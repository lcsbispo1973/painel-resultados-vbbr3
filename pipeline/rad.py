#!/usr/bin/env python3
"""ITR e DFP da Vibra direto do sistema de entrega da CVM (RAD), sem esperar a atualização semanal da base aberta.

O Plantão de Notícias da B3 (pipeline/plantao.py) informa o número sequencial (NSD) de cada ITR/DFP entregue. Com ele,
o pacote do documento é baixado da CVM (frmDownloadDocumento.aspx?NumeroSequencialDocumento=NSD). O pacote traz a
planilha DadosDocumento.xlsx com todas as demonstrações; aqui são lidas as consolidadas e a composição do capital e
gravadas em data/cvm_raw/RAD_<tipo>_<demo>_<data>.csv, no MESMO formato dos arquivos da base aberta.

Regra de uso (pipeline/cvm.py): o arquivo do RAD só vale enquanto a base aberta não tiver aquele período na mesma versão
ou em versão mais nova. Quando a base aberta chega, os dois são comparados conta a conta (pipeline/auditoria.py).

Uso: python pipeline/rad.py            (lê data/plantao.json)
     python pipeline/rad.py --xlsx ARQ --tipo ITR --data 2026-06-30 --versao 1 --saida DIR   (teste com arquivo local)
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento={nsd}"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
COLUNAS_RAW = ["tipo", "demo", "ano", "DT_REFER", "VERSAO", "ESCALA_MOEDA", "ORDEM_EXERC",
               "DT_INI_EXERC", "DT_FIM_EXERC", "CD_CONTA", "DS_CONTA", "VL_CONTA", "ST_CONTA_FIXA", "COLUNA_DF"]
COLUNAS_ACOES = ["tipo", "ano", "DT_REFER", "VERSAO", "ON", "PN", "TOTAL", "ON_TESOURO", "PN_TESOURO", "TOTAL_TESOURO"]
# colunas da DMPL na planilha (pela posição) → nomes da base aberta (COLUNA_DF)
COLUNAS_DMPL = ["Capital Social Integralizado", "Reservas de Capital, Opções Outorgadas e Ações em Tesouraria", "Reservas de Lucro",
                "Lucros ou Prejuízos Acumulados", "Outros Resultados Abrangentes", "Patrimônio Líquido",
                "Participação dos Não Controladores", "Patrimônio Líquido Consolidado"]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "pr": "http://schemas.openxmlformats.org/package/2006/relationships"}


# ----------------------------------------------------------------------------- leitura do xlsx (só biblioteca padrão)
def ler_xlsx(conteudo):
    """{nome da aba: [linhas como listas de texto]}."""
    z = zipfile.ZipFile(io.BytesIO(conteudo))
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            ss.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).findall("pr:Relationship", NS)}
    out = {}
    for s in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS).findall("m:sheet", NS):
        alvo = rels[s.get("{%s}id" % NS["r"])].lstrip("/")
        alvo = alvo if alvo.startswith("xl/") else "xl/" + alvo
        linhas = []
        for row in ET.fromstring(z.read(alvo)).iter("{%s}row" % NS["m"]):
            cel = {}
            for c in row.findall("m:c", NS):
                col = re.match(r"[A-Z]+", c.get("r")).group(0)
                idx = 0
                for ch in col:
                    idx = idx * 26 + ord(ch) - 64
                v = c.find("m:v", NS)
                if c.get("t") == "s" and v is not None:
                    val = ss[int(v.text)]
                elif c.get("t") == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter("{%s}t" % NS["m"]))
                else:
                    val = v.text if v is not None else ""
                cel[idx - 1] = val or ""
            if cel:
                linhas.append([cel.get(i, "") for i in range(max(cel) + 1)])
        out[s.get("name")] = linhas
    return out


def numero(s):
    s = (s or "").strip()
    if not s:
        return 0.0   # a base aberta grava 0 nas linhas-título sem valor (ex.: 3.99 Lucro por Ação)
    return float(s.replace(".", "").replace(",", "."))


LATIN = str.maketrans({"\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u00a0": " "})


def texto(s):
    """Descrições como na base aberta (gravada em latin-1: travessão vira hífen, aspas curvas viram retas)."""
    return (s or "").translate(LATIN).encode("latin-1", "replace").decode("latin-1").strip()


def fmt(v):
    return "%.10f" % v


def menos_um_ano(d):
    return d.replace(year=d.year - 1)


# ----------------------------------------------------------------------------- planilha → linhas no formato da base aberta
def linhas_documento(abas, tipo, dt_refer, versao, fixas=None):
    """Linhas (demonstrações consolidadas) e composição do capital no formato dos arquivos da base aberta."""
    fixas = fixas or {}
    ref = dt.date.fromisoformat(dt_refer)
    ini_ano, ini_tri = ref.replace(month=1, day=1), ref.replace(month=(ref.month - 1) // 3 * 3 + 1, day=1)
    ant = menos_um_ano(ref)
    out, vistos = [], set()

    def add(demo, ordem, ini, fim, cd, ds, val, escala, coluna=""):
        if val is None:
            return
        k = (demo, ordem, ini, fim, cd, coluna)
        if k in vistos:   # 1º trimestre: trimestre e acumulado são o mesmo período
            return
        vistos.add(k)
        out.append({"tipo": tipo, "demo": demo, "ano": str(ref.year), "DT_REFER": dt_refer, "VERSAO": str(versao), "ESCALA_MOEDA": escala,
                    "ORDEM_EXERC": ordem, "DT_INI_EXERC": ini.isoformat() if ini else "", "DT_FIM_EXERC": fim.isoformat(), "CD_CONTA": cd,
                    "DS_CONTA": texto(ds), "VL_CONTA": fmt(val), "ST_CONTA_FIXA": fixas.get(cd, "N"), "COLUNA_DF": coluna})

    def tabela(nome):
        ls = abas.get(nome) or []
        if not ls:
            raise ValueError("aba ausente na planilha: %s" % nome)
        cab = [c.strip() for c in ls[0]]
        return cab, ls[1:]

    def escala(linha, cab):
        p = linha[cab.index("Precisao")].strip().upper() if "Precisao" in cab and cab.index("Precisao") < len(linha) else "MIL"
        return "MIL" if p.startswith("MIL") else "UNIDADE"

    ultimo_cols = ("Valor Ultimo Exercicio",) if tipo == "DFP" else ()
    for nome, demo in (("DF Cons Ativo", "BPA"), ("DF Cons Passivo", "BPP")):
        cab, ls = tabela(nome)
        cols = [("ÚLTIMO", None, ref, "Valor Ultimo Exercicio" if tipo == "DFP" else "Valor Trimestre Atual"),
                ("PENÚLTIMO", None, ant if tipo == "DFP" else dt.date(ref.year - 1, 12, 31), "Valor Penultimo Exercicio" if tipo == "DFP" else "Valor Exercicio Anterior")]
        for l in ls:
            for ordem, ini, fim, c in cols:
                add(demo, ordem, ini, fim, l[0].strip(), l[1].strip(), numero(l[cab.index(c)]), escala(l, cab))
    for nome, demo, trimestral in (("DF Cons Resultado Periodo", "DRE", True), ("DF Cons Resultado Abrangente", "DRA", True),
                                   ("DF Cons Fluxo de Caixa", "DFC", False), ("DF Cons Valor Adicionado", "DVA", False)):
        cab, ls = tabela(nome)
        if tipo == "DFP":
            cols = [("ÚLTIMO", ini_ano, ref, "Valor Ultimo Exercicio"), ("PENÚLTIMO", menos_um_ano(ini_ano), ant, "Valor Penultimo Exercicio")]
        else:
            cols = [("ÚLTIMO", ini_ano, ref, "Valor Acumulado Atual Exercicio"), ("PENÚLTIMO", menos_um_ano(ini_ano), ant, "Valor Acumulado Exercicio Anterior")]
            if trimestral:
                cols = [("ÚLTIMO", ini_tri, ref, "Valor Trimestre Atual"), cols[0],
                        ("PENÚLTIMO", menos_um_ano(ini_tri), ant, "Valor Trimestre Exercicio Anterior"), cols[1]]
        for l in ls:
            for ordem, ini, fim, c in cols:
                if c in cab:
                    add(demo, ordem, ini, fim, l[0].strip(), l[1].strip(), numero(l[cab.index(c)]), escala(l, cab))
    abas_dmpl = [("DF Cons DMPL Ultimo", "ÚLTIMO", ini_ano, ref), ("DF Cons DMPL Penultimo", "PENÚLTIMO", menos_um_ano(ini_ano), ant)] if tipo == "DFP" else \
                [("DF Cons DMPL Atual", "ÚLTIMO", ini_ano, ref), ("DF Cons DMPL Anterior", "PENÚLTIMO", menos_um_ano(ini_ano), ant)]
    for nome, ordem, ini, fim in abas_dmpl:
        cab, ls = tabela(nome)
        for l in ls:
            for j, coluna in enumerate(COLUNAS_DMPL):
                add("DMPL", ordem, ini, fim, l[0].strip(), l[1].strip(), numero(l[2 + j]) if 2 + j < len(l) else None, escala(l, cab), coluna)
    cab, ls = tabela("Composicao Capital")
    acoes = None
    if ls:
        l = ls[0]
        g = lambda nome: (l[cab.index(nome)].strip().replace(".", "") if nome in cab and cab.index(nome) < len(l) else "")  # noqa: E731
        acoes = {"tipo": tipo, "ano": str(ref.year), "DT_REFER": dt_refer, "VERSAO": str(versao),
                 "ON": g("Acoes Ordinarias Capital Integralizado"), "PN": g("Acoes Preferenciais Capital Integralizado"),
                 "TOTAL": g("Total Capital Integralizado"), "ON_TESOURO": g("Acoes Ordinarias Tesouraria"),
                 "PN_TESOURO": g("Acoes Preferenciais Tesouraria"), "TOTAL_TESOURO": g("Total Tesouraria")}
    return out, acoes


def gravar(pasta, tipo, dt_refer, linhas, acoes, nsd):
    os.makedirs(pasta, exist_ok=True)
    for f in os.listdir(pasta):   # versões anteriores do mesmo período vindas do RAD
        if f.startswith("RAD_%s_" % tipo) and f.endswith("_%s.csv" % dt_refer):
            os.remove(os.path.join(pasta, f))
    demos = sorted({l["demo"] for l in linhas})
    for d in demos:
        with open(os.path.join(pasta, "RAD_%s_%s_%s.csv" % (tipo, d, dt_refer)), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLUNAS_RAW)
            w.writeheader()
            w.writerows([l for l in linhas if l["demo"] == d])
    if acoes:
        with open(os.path.join(pasta, "RAD_%s_ACOES_%s.csv" % (tipo, dt_refer)), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLUNAS_ACOES)
            w.writeheader()
            w.writerow(acoes)
    json.dump({"tipo": tipo, "DT_REFER": dt_refer, "nsd": nsd, "linhas": len(linhas), "gravado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")},
              open(os.path.join(pasta, "RAD_%s_%s.json" % (tipo, dt_refer)), "w", encoding="utf-8"))


def fixas_conhecidas(pasta):
    """ST_CONTA_FIXA por conta, tirado dos arquivos da base aberta (a planilha do RAD não traz essa marca)."""
    fx = {}
    for f in sorted(os.listdir(pasta)):
        if f.endswith(".csv") and not f.startswith("RAD_") and "_ACOES_" not in f:
            for r in csv.DictReader(open(os.path.join(pasta, f), encoding="utf-8")):
                fx[r["CD_CONTA"].strip()] = r["ST_CONTA_FIXA"].strip() or "N"
    return fx


def versoes_abertas(pasta):
    """{(tipo, DT_REFER): maior versão} nos arquivos da base aberta."""
    v = {}
    for f in os.listdir(pasta):
        if f.endswith(".csv") and not f.startswith("RAD_") and "_DRE_" in f:
            for r in csv.DictReader(open(os.path.join(pasta, f), encoding="utf-8")):
                k = (r["tipo"], r["DT_REFER"])
                v[k] = max(v.get(k, 0), int(r["VERSAO"] or 0))
    return v


def baixar_pacote(nsd, tentativas=3):
    erro = None
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL.format(nsd=nsd), headers=UA), timeout=300) as r:
                b = r.read()
            z = zipfile.ZipFile(io.BytesIO(b))
            xml = [n for n in z.namelist() if re.search(r"(ITR|DFP)\d{2}-\d{2}-\d{4}v(\d+)\.xml$", n)]
            versao = int(re.search(r"v(\d+)\.xml$", xml[0]).group(1)) if xml else 1
            return z.read("DadosDocumento.xlsx"), versao, None
        except Exception as e:  # noqa: BLE001
            erro = "%s: %s" % (type(e).__name__, e)
            time.sleep(5 * (i + 1))
    return None, None, erro


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx"); ap.add_argument("--tipo"); ap.add_argument("--data"); ap.add_argument("--versao", type=int, default=1)
    ap.add_argument("--saida")
    a = ap.parse_args()
    pasta = a.saida or os.path.join(RAIZ, "data", "cvm_raw")
    if a.xlsx:   # teste com arquivo local
        ls, ac = linhas_documento(ler_xlsx(open(a.xlsx, "rb").read()), a.tipo, a.data, a.versao, fixas_conhecidas(os.path.join(RAIZ, "data", "cvm_raw")))
        gravar(pasta, a.tipo, a.data, ls, ac, None)
        print("%d linhas gravadas em %s" % (len(ls), pasta))
        return 0
    log = ["# RAD (ITR/DFP direto da CVM) — última execução", "", "Executado em %s UTC" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), ""]
    pl = os.path.join(RAIZ, "data", "plantao.json")
    noticias = json.load(open(pl, encoding="utf-8"))["noticias"] if os.path.exists(pl) else []
    # último documento entregue para cada (tipo, data de referência), ignorando cancelamentos
    docs = {}
    for n in sorted(noticias, key=lambda n: n["data_hora"]):
        if n.get("doc") in ("ITR", "DFP") and n.get("nsd") and not re.search(r"\(C\)\s*$", n["titulo"]):
            docs[(n["doc"], n["dt_refer"])] = n
    fixas = fixas_conhecidas(pasta)
    for (tipo, ref), n in sorted(docs.items()):
        if ref < "2025-01-01":
            continue
        meta = os.path.join(pasta, "RAD_%s_%s.json" % (tipo, ref))
        ja = json.load(open(meta, encoding="utf-8")) if os.path.exists(meta) else None
        if ja and str(ja.get("nsd")) == str(n["nsd"]):
            continue   # este documento já foi lido
        b, versao, erro = baixar_pacote(n["nsd"])
        if not b:
            log.append("- %s %s (NSD %s): falha no download (%s)" % (tipo, ref, n["nsd"], erro))
            continue
        try:
            ls, ac = linhas_documento(ler_xlsx(b), tipo, ref, versao, fixas)
        except Exception as e:  # noqa: BLE001
            log.append("- %s %s (NSD %s): planilha não lida (%s)" % (tipo, ref, n["nsd"], e))
            continue
        gravar(pasta, tipo, ref, ls, ac, n["nsd"])
        log.append("- %s %s (NSD %s, versão %d): %d linhas consolidadas" % (tipo, ref, n["nsd"], versao, len(ls)))
    if len(log) == 4:
        log.append("Nenhum ITR/DFP novo.")
    open(os.path.join(RAIZ, "logs", "rad.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log[4:]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
