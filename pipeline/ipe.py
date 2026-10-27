#!/usr/bin/env python3
"""Comunicados ao mercado, fatos relevantes, avisos aos acionistas e demais documentos eventuais da Vibra (base IPE da CVM).

Lê o índice anual dos Dados Abertos (ipe_cia_aberta_<ano>.zip), filtra a Vibra, mantém a última versão de cada
documento e grava data/ipe.json (categoria, tipo, espécie, assunto, datas, protocolo e link para o documento na CVM).
O conteúdo dos documentos não é baixado: o painel leva ao original.

Uso: python pipeline/ipe.py [--completo] [--saida DIR]     (CVM_LOCAL_DIR lê .zip locais, para testes)
"""
import argparse
import csv
import datetime as dt
import io
import json
import re
import os
import sys
import time
import urllib.request
import zipfile

CNPJ = "34.274.233/0001-02"
ANO_INICIAL = 2017
URL = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_{ano}.zip"
UA = {"User-Agent": "Mozilla/5.0 (compatible; painel-vbbr3/1.0)"}
csv.field_size_limit(2**30)


def baixar(url, tentativas=3):
    erro = None
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read(), None
        except Exception as e:  # noqa: BLE001
            erro = "%s: %s" % (type(e).__name__, e)
            time.sleep(2 * (i + 1))
    return None, erro


def col(linha, *nomes):
    for n in nomes:
        if n in linha and linha[n] is not None:
            return linha[n].strip()
    return ""


def ler_zip(conteudo, cnpj=CNPJ):
    out = []
    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        for nome in z.namelist():
            if not nome.lower().endswith(".csv"):
                continue
            with z.open(nome) as f:
                for l in csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"), delimiter=";"):
                    if col(l, "CNPJ_Companhia", "CNPJ_CIA") != cnpj:
                        continue
                    out.append({
                        "data_entrega": col(l, "Data_Entrega", "DT_ENTREGA")[:10],
                        "data_referencia": col(l, "Data_Referencia", "DT_REFER")[:10],
                        "categoria": col(l, "Categoria", "CATEG_DOC"),
                        "tipo": col(l, "Tipo", "TP_DOC"),
                        "especie": col(l, "Especie", "ESPECIE"),
                        "assunto": " ".join(col(l, "Assunto", "ASSUNTO").split())[:400],
                        "apresentacao": col(l, "Tipo_Apresentacao", "TP_APRESENT"),
                        "protocolo": col(l, "Protocolo_Entrega", "ID_DOC"),
                        "versao": int(col(l, "Versao", "VERSAO") or 1),
                        "link": col(l, "Link_Download", "LINK_DOC"),
                    })
    return out


def num_protocolo(link):
    m = re.search(r"numProtocolo=(\d+)", link or "", re.I) or re.search(r"NumeroProtocoloEntrega=(\d+)", link or "", re.I)
    return m.group(1) if m else None


def provisorios(raiz, oficiais):
    """Documentos já entregues à CVM e anunciados no Plantão de Notícias da B3 que a base aberta (semanal) ainda não traz.

    Saem da lista assim que a base aberta os incluir (mesmo número de protocolo) ou quando a base aberta já cobrir a data
    de entrega sem trazê-los (documento cancelado ou substituído). Cancelamentos anunciados no Plantão ("(C)") não entram.
    """
    p = os.path.join(raiz, "data", "plantao.json")
    if not os.path.exists(p):
        return []
    sys.path.insert(0, os.path.join(raiz, "pipeline"))
    import plantao  # noqa: E402
    noticias = json.load(open(p, encoding="utf-8")).get("noticias", [])
    conhecidos = {num_protocolo(d["link"]) for d in oficiais} - {None}
    corte = max((d["data_entrega"] for d in oficiais), default="")
    cancelados = {n.get("protocolo") for n in noticias if re.search(r"\(C\)\s*$", n.get("titulo", ""))}
    out = {}
    for n in sorted(noticias, key=lambda n: n["data_hora"]):
        pr = n.get("protocolo")
        if n.get("doc") != "IPE" or not pr or pr in conhecidos or pr in cancelados or n["data_hora"][:10] < corte:
            continue
        out[pr] = plantao.para_ipe(n)
    return list(out.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--completo", action="store_true")
    ap.add_argument("--saida", default="data")
    a = ap.parse_args()
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    saida = a.saida if os.path.isabs(a.saida) else os.path.join(raiz, a.saida)
    cache = os.path.join(raiz, ".cache", "ipe")
    os.makedirs(saida, exist_ok=True); os.makedirs(cache, exist_ok=True); os.makedirs(os.path.join(raiz, "logs"), exist_ok=True)
    local = os.environ.get("CVM_LOCAL_DIR")
    hoje = dt.date.today()
    log = ["# IPE (comunicados e fatos relevantes) — última execução", "", "Executado em %s UTC" % dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M"), ""]
    docs, falhas = [], 0
    for ano in range(ANO_INICIAL, hoje.year + 1):
        nome = "ipe_cia_aberta_%d.zip" % ano
        conteudo, erro = None, None
        if local:
            p = os.path.join(local, nome)
            conteudo = open(p, "rb").read() if os.path.exists(p) else None
        else:
            pc = os.path.join(cache, nome)
            if os.path.exists(pc) and ano < hoje.year - 1 and not a.completo:
                conteudo = open(pc, "rb").read()
            else:
                conteudo, erro = baixar(URL.format(ano=ano))
                if conteudo:
                    open(pc, "wb").write(conteudo)
        if not conteudo:
            falhas += 1
            log.append("- %d: sem arquivo (%s)" % (ano, erro or "local ausente"))
            continue
        try:
            r = ler_zip(conteudo)
            docs += r
            log.append("- %d: %d documentos da Vibra" % (ano, len(r)))
        except Exception as e:  # noqa: BLE001
            falhas += 1
            log.append("- %d: erro de leitura (%s)" % (ano, e))
    # última versão de cada protocolo
    ult = {}
    for d in docs:
        k = d["protocolo"] or (d["data_entrega"] + d["assunto"])
        if k not in ult or d["versao"] >= ult[k]["versao"]:
            ult[k] = d
    lista = sorted(ult.values(), key=lambda d: (d["data_entrega"], d["protocolo"]), reverse=True)
    prov = provisorios(raiz, lista)
    if prov:
        log.append("- provisórios do Plantão de Notícias da B3 (ainda fora da base aberta semanal): %d" % len(prov))
        lista = sorted(lista + prov, key=lambda d: (d["data_entrega"], d["protocolo"]), reverse=True)
    cats = {}
    for d in lista:
        cats[d["categoria"]] = cats.get(d["categoria"], 0) + 1
    log += ["", "Documentos (última versão): %d" % len(lista), "Por categoria: " + ", ".join("%s (%d)" % kv for kv in sorted(cats.items(), key=lambda x: -x[1]))]
    open(os.path.join(saida if local else os.path.join(raiz, "logs"), "ipe-ultima-execucao.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    if not lista:
        print("Nenhum documento; dados anteriores mantidos.")
        return 0
    doc = {"fonte": "CVM — Dados Abertos, documentos periódicos e eventuais (IPE)", "atualizado_em": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
           "documentos": lista}
    with open(os.path.join(saida, "ipe.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print("OK: %d documentos" % len(lista))
    return 0


if __name__ == "__main__":
    sys.exit(main())
