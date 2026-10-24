#!/usr/bin/env python3
"""Diagnóstico temporário: o runner consegue baixar releases de resultados? Grava logs/releases-diagnostico.md."""
import json, os, re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
log = ["# Diagnóstico de acesso aos releases", ""]
def teste(url, n=600):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            corpo = r.read()
            tipo = r.headers.get("Content-Type", "")
            log.append("- OK %s → HTTP %s, %s, %d bytes" % (url, r.status, tipo, len(corpo)))
            return corpo
    except Exception as e:  # noqa: BLE001
        log.append("- ERRO %s → %s: %s" % (url, type(e).__name__, str(e)[:200]))
        return None
for u in ["https://ri.vibraenergia.com.br/", "https://ri.vibraenergia.com.br/informacoes-financeiras/central-de-resultados/",
          "https://api.mziq.com/mzfilemanager/v2/d/", "https://apicatalog.mziq.com/"]:
    b = teste(u)
    if b and u.endswith("central-de-resultados/"):
        html = b.decode("utf-8", "ignore")
        links = sorted(set(re.findall(r'https?://[^"\'\s<>]+\.pdf', html)))[:15]
        mz = sorted(set(re.findall(r'https?://[^"\'\s<>]*mziq[^"\'\s<>]*', html)))[:15]
        log.append("  PDFs na página: %d; exemplos: %s" % (len(links), links[:5]))
        log.append("  URLs mziq na página: %s" % mz[:10])
        if links:
            teste(links[0])
p = os.path.join(raiz, "data", "ipe.json")
if os.path.exists(p):
    docs = json.load(open(p, encoding="utf-8"))["documentos"]
    rel = [d for d in docs if re.search(r"release|resultado", d["assunto"] + " " + d["tipo"], re.I)][:3]
    log.append("")
    log.append("Documentos IPE com 'release/resultado' (amostra): %d" % len(rel))
    for d in rel:
        log.append("  %s | %s | %s | %s" % (d["data_entrega"], d["categoria"], d["tipo"], d["assunto"][:120]))
        if d["link"]:
            teste(d["link"])
open(os.path.join(raiz, "logs", "releases-diagnostico.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
print("\n".join(log))
