#!/usr/bin/env python3
"""Etapa 1 dos releases: baixa os releases de resultados (IPE da CVM, tipo Press-release) e extrai o texto.

Para cada release ainda não processado: baixa o PDF pelo link da CVM, extrai o texto com `pdftotext -layout`
e grava data/releases/texto/<data_entrega>_<protocolo>.txt. O índice fica em data/releases/indice.json.
A leitura dos números (EBITDA Ajustado por segmento, volumes, margens) é feita sobre esses textos em outra etapa.

Uso: python pipeline/releases.py [--completo]
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}


def baixar(url, tentativas=3):
    erro = None
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                b = r.read()
                if b.startswith(b"%PDF"):
                    return b, None
                erro = "resposta não é PDF (%d bytes)" % len(b)
        except Exception as e:  # noqa: BLE001
            erro = "%s: %s" % (type(e).__name__, e)
        time.sleep(3 * (i + 1))
    return None, erro


def nome_seguro(s):
    return re.sub(r"[^0-9A-Za-z_-]+", "-", s)[:60]


def chave(d):
    """Número de protocolo da CVM (igual no documento provisório do Plantão da B3 e na base aberta); senão, o protocolo."""
    m = re.search(r"numProtocolo=(\d+)", d.get("link") or "", re.I)
    return m.group(1) if m else d["protocolo"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--completo", action="store_true")
    a = ap.parse_args()
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pasta = os.path.join(raiz, "data", "releases")
    ptxt = os.path.join(pasta, "texto")
    os.makedirs(ptxt, exist_ok=True)
    os.makedirs(os.path.join(raiz, "logs"), exist_ok=True)
    ipe = json.load(open(os.path.join(raiz, "data", "ipe.json"), encoding="utf-8"))["documentos"]
    pi = os.path.join(pasta, "indice.json")
    indice = {} if a.completo or not os.path.exists(pi) else {chave(d): d for d in json.load(open(pi, encoding="utf-8"))["releases"]}
    atuais = {chave(x) for x in ipe if x["tipo"] == "Press-release"}
    # documento provisório (Plantão da B3) que a CVM não confirmou (cancelado ou substituído) sai do índice
    indice = {k: v for k, v in indice.items() if k in atuais}
    log = ["# Releases — última execução", "", "Executado em %s UTC" % dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M"), ""]
    novos = falhas = 0
    for d in [x for x in ipe if x["tipo"] == "Press-release"]:
        k = chave(d)
        if k in indice and indice[k].get("arquivo") and os.path.exists(os.path.join(ptxt, indice[k]["arquivo"])):
            if indice[k].get("provisorio") and not d.get("provisorio"):   # a base aberta confirmou: atualiza os dados, sem baixar de novo
                indice[k].update({"protocolo": d["protocolo"], "data_referencia": d["data_referencia"], "assunto": d["assunto"], "link": d["link"]})
                indice[k].pop("provisorio", None)
            continue
        pdf, erro = baixar(d["link"])
        if not pdf:
            falhas += 1
            log.append("- ERRO %s %s: %s" % (d["data_entrega"], d["assunto"], erro))
            continue
        with tempfile.TemporaryDirectory() as t:
            fp = os.path.join(t, "r.pdf"); open(fp, "wb").write(pdf)
            r = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", fp, "-"], capture_output=True)
        if r.returncode != 0:
            falhas += 1
            log.append("- ERRO pdftotext %s: %s" % (d["assunto"], r.stderr.decode("utf-8", "ignore")[:200]))
            continue
        arq = "%s_%s.txt" % (d["data_entrega"], nome_seguro(k))
        open(os.path.join(ptxt, arq), "w", encoding="utf-8").write(r.stdout.decode("utf-8", "ignore"))
        indice[k] = {"protocolo": d["protocolo"], "data_entrega": d["data_entrega"], "data_referencia": d["data_referencia"], "assunto": d["assunto"],
                     "link": d["link"], "arquivo": arq, "paginas_bytes": len(pdf)}
        if d.get("provisorio"):
            indice[k]["provisorio"] = True
        novos += 1
        log.append("- ok %s %s → %s" % (d["data_entrega"], d["assunto"], arq))
        time.sleep(1)
    lista = sorted(indice.values(), key=lambda x: x["data_entrega"], reverse=True)
    json.dump({"fonte": "CVM — IPE, Press-release (releases de resultados)", "atualizado_em": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "releases": lista},
              open(pi, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log += ["", "Releases no índice: %d · novos nesta execução: %d · falhas: %d" % (len(lista), novos, falhas)]
    open(os.path.join(raiz, "logs", "releases-ultima-execucao.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print(log[-1])
    return 0


if __name__ == "__main__":
    sys.exit(main())
