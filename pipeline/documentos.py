#!/usr/bin/env python3
"""Baixa documentos em PDF arquivados na CVM e guarda o texto extraído (pdftotext -layout), para leitura posterior.

Grupos:
  vibra_df         demonstrações financeiras (ITR/DFP) da Vibra arquivadas no IPE — nota de informações por segmento
  vibra_proventos  avisos e comunicados de dividendos/JCP da Vibra
  vibra_rating     relatórios de agências de rating da Vibra
  ultrapar_rel     releases de resultados da Ultrapar (segmento Ipiranga)
  ultrapar_df      demonstrações financeiras da Ultrapar (nota de segmentos)
Também testa o pacote ENET das ITRs de 2018–2019 da Vibra (ainda não arquivadas no IPE) e registra a estrutura
do XML do Formulário de Referência (para localizar o item 10), sem gravar dados pessoais.

Textos: data/docs/<grupo>/<data>_<protocolo>.txt · índice: data/docs/<grupo>/indice.json · log: logs/documentos.md
Uso: python pipeline/documentos.py [--completo]
"""
import argparse, csv, datetime as dt, io, json, os, re, subprocess, sys, tempfile, time, urllib.request, zipfile
from collections import Counter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
import ipe  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
CNPJ_ULTRAPAR = "33.256.439/0001-39"
RX_PROV = re.compile(r"dividend|juros sobre (o )?capital|jcp|provento|bonifica|remunera[çc][ãa]o aos acionistas", re.I)


def baixar(url, tentativas=3):
    erro = None
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url.replace("http://", "https://"), headers=UA), timeout=150) as r:
                return r.read(), None
        except Exception as e:  # noqa: BLE001
            erro = "%s: %s" % (type(e).__name__, e)
            time.sleep(3 * (i + 1))
    return None, erro


def pdf_texto(b):
    with tempfile.TemporaryDirectory() as t:
        p = os.path.join(t, "x.pdf"); open(p, "wb").write(b)
        r = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", p, "-"], capture_output=True)
        return r.stdout.decode("utf-8", "ignore") if r.returncode == 0 else None


def seguro(s):
    return re.sub(r"[^0-9A-Za-z_-]+", "-", s)[:60]


def coletar(grupo, docs, log, completo):
    pasta = os.path.join(RAIZ, "data", "docs", grupo)
    os.makedirs(pasta, exist_ok=True)
    pi = os.path.join(pasta, "indice.json")
    idx = {} if completo or not os.path.exists(pi) else {d["protocolo"]: d for d in json.load(open(pi, encoding="utf-8"))["documentos"]}
    novos = falhas = 0
    for d in docs:
        k = d["protocolo"]
        if k in idx and os.path.exists(os.path.join(pasta, idx[k]["arquivo"])):
            continue
        b, erro = baixar(d["link"])
        if b and b[:2] == b"PK":   # alguns documentos vêm compactados: usa o maior PDF do pacote
            try:
                with zipfile.ZipFile(io.BytesIO(b)) as z:
                    pdfs = [z.read(n) for n in z.namelist() if n.lower().endswith(".pdf")]
                b = max(pdfs, key=len) if pdfs else b
            except Exception as e:  # noqa: BLE001
                erro = "zip inválido: %s" % e
        txt = pdf_texto(b) if b and b.startswith(b"%PDF") else None
        if not txt:
            falhas += 1
            log.append("  - ERRO %s %s: %s" % (d["data_entrega"], d["assunto"][:50], erro or ("não é PDF: %r" % (b[:12] if b else b""))))
            continue
        arq = "%s_%s.txt" % (d["data_entrega"], seguro(k))
        open(os.path.join(pasta, arq), "w", encoding="utf-8").write(txt)
        idx[k] = {"protocolo": k, "data_entrega": d["data_entrega"], "data_referencia": d["data_referencia"], "categoria": d["categoria"],
                  "tipo": d["tipo"], "assunto": d["assunto"], "link": d["link"], "arquivo": arq}
        novos += 1
        time.sleep(1)
    lista = sorted(idx.values(), key=lambda x: x["data_entrega"], reverse=True)
    json.dump({"grupo": grupo, "atualizado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "documentos": lista},
              open(pi, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log.append("- %s: %d no índice, %d novos, %d falhas" % (grupo, len(lista), novos, falhas))


def ipe_ultrapar(log):
    cache = os.path.join(RAIZ, ".cache", "ipe")
    docs = []
    for ano in range(2017, dt.date.today().year + 1):
        p = os.path.join(cache, "ipe_cia_aberta_%d.zip" % ano)
        if os.path.exists(p):
            conteudo = open(p, "rb").read()
        else:
            conteudo, _ = ipe.baixar(ipe.URL.format(ano=ano))
            if conteudo:
                os.makedirs(cache, exist_ok=True); open(p, "wb").write(conteudo)
        if conteudo:
            docs += ipe.ler_zip(conteudo, CNPJ_ULTRAPAR)
    ult = {}
    for d in docs:
        if d["protocolo"] not in ult or d["versao"] >= ult[d["protocolo"]]["versao"]:
            ult[d["protocolo"]] = d
    log.append("- IPE Ultrapar: %d documentos" % len(ult))
    return sorted(ult.values(), key=lambda d: d["data_entrega"], reverse=True)


def diag_enet_itr(log):
    """ITRs de 2018–2019 da Vibra: o pacote ENET traz o PDF das notas?"""
    log.append("")
    log.append("## Diagnóstico ENET (ITR 2019)")
    b, erro = baixar("https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_2019.zip")
    if not b:
        log.append("- índice ITR 2019: %s" % erro); return
    with zipfile.ZipFile(io.BytesIO(b)) as z:
        nome = [n for n in z.namelist() if re.match(r"itr_cia_aberta_2019\.csv$", n)]
        if not nome:
            log.append("- arquivos no zip: %s" % z.namelist()[:10]); return
        linhas = [r for r in csv.DictReader(io.TextIOWrapper(z.open(nome[0]), encoding="latin-1"), delimiter=";") if r.get("CNPJ_CIA") == ipe.CNPJ]
    log.append("- linhas da Vibra no índice: %d; colunas: %s" % (len(linhas), list(linhas[0].keys()) if linhas else []))
    if not linhas:
        return
    r = sorted(linhas, key=lambda x: (x.get("DT_REFER"), x.get("VERSAO")))[0]
    link = r.get("LINK_DOC", "")
    log.append("- %s v%s: %s" % (r.get("DT_REFER"), r.get("VERSAO"), link))
    b, erro = baixar(link)
    if not b:
        log.append("  erro: %s" % erro); return
    log.append("  %d bytes, início %r" % (len(b), b[:6]))
    if b[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            for n in z.namelist():
                d = z.read(n)
                log.append("  · %s (%d bytes, %r)" % (n, len(d), d[:6]))
                if d[:2] == b"PK":
                    with zipfile.ZipFile(io.BytesIO(d)) as z2:
                        for n2 in z2.namelist()[:30]:
                            d2 = z2.read(n2)
                            extra = ""
                            if d2.startswith(b"%PDF"):
                                t = pdf_texto(d2) or ""
                                extra = " PDF: 'EBITDA ajustado' %d vezes; 'segmento' %d vezes" % (len(re.findall(r"ebitda ajustado", t, re.I)), len(re.findall(r"segmento", t, re.I)))
                            log.append("     · %s (%d bytes)%s" % (n2, len(d2), extra))


def diag_fre_xml(log):
    """Estrutura do XML do FRE mais recente: tags com textos longos (só nome da tag e tamanho)."""
    log.append("")
    log.append("## Estrutura do XML do FRE")
    idx = json.load(open(os.path.join(RAIZ, "data", "fre", "indice.json"), encoding="utf-8"))["anos"]
    doc = [a for a in idx if a["documentos"]][-1]["documentos"][-1]
    b, erro = baixar(doc["link"])
    if not b or b[:2] != b"PK":
        log.append("- erro: %s" % (erro or "não é zip")); return
    with zipfile.ZipFile(io.BytesIO(b)) as z:
        nome = [n for n in z.namelist() if "FRE" in n and n.endswith(".xml")][0]
        bruto = z.read(nome)
    s = bruto.decode("utf-8", "ignore") if b"encoding=\"utf-8\"" in bruto[:200].lower() else bruto.decode("latin-1", "ignore")
    log.append("- %s: %d caracteres; cabeçalho %r" % (nome, len(s), s[:120]))
    tam = Counter(); exemplo = {}
    for m in re.finditer(r"<([A-Za-z_][\w.-]*)[^>]*>([^<]{300,})</\1>", s):
        tag, txt = m.group(1), m.group(2)
        tam[tag] += len(txt)
        exemplo.setdefault(tag, re.sub(r"&[a-z#0-9]+;|\s+", " ", txt)[:90])
    for c, n in tam.most_common(40):
        ex = exemplo[c]
        log.append("- <%s>: %d caracteres · %r" % (c, n, ex if re.search(r"condi|liquidez|resultado|endivid|financ|10\.", ex, re.I) else ex[:25]))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--completo", action="store_true"); a = ap.parse_args()
    os.makedirs(os.path.join(RAIZ, "logs"), exist_ok=True)
    log = ["# Documentos — última execução", "", "Executado em %s UTC" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), ""]
    vibra = json.load(open(os.path.join(RAIZ, "data", "ipe.json"), encoding="utf-8"))["documentos"]
    coletar("vibra_df", [d for d in vibra if d["tipo"].startswith("Demonstrações Financeiras") and "Especiais" not in d["tipo"]], log, a.completo)
    coletar("vibra_proventos", [d for d in vibra if d["categoria"] in ("Aviso aos Acionistas", "Comunicado ao Mercado", "Fato Relevante", "Reunião da Administração") and RX_PROV.search(d["assunto"] + " " + d["tipo"])], log, a.completo)
    coletar("vibra_rating", [d for d in vibra if "rating" in (d["tipo"] + " " + d["assunto"]).lower()], log, a.completo)
    ult = ipe_ultrapar(log)
    coletar("ultrapar_rel", [d for d in ult if d["tipo"] == "Press-release"], log, a.completo)
    coletar("ultrapar_df", [d for d in ult if d["tipo"].startswith("Demonstrações Financeiras") and "Especiais" not in d["tipo"]], log, a.completo)
    for f in (diag_fre_xml,):
        try:
            f(log)
        except Exception as e:  # noqa: BLE001
            log.append("- diagnóstico %s falhou: %s" % (f.__name__, e))
    open(os.path.join(RAIZ, "logs", "documentos.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log[:20]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
