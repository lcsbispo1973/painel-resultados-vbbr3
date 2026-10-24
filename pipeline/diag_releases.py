#!/usr/bin/env python3
"""Diagnóstico temporário: o runner consegue baixar o PDF dos releases (Press-release) pelo sistema da CVM?
Grava logs/releases-diagnostico.md (só metadados e trechos)."""
import json, os, re, urllib.request, http.cookiejar
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
log = ["# Diagnóstico de acesso aos releases (2)", ""]
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def get(url):
    try:
        with op.open(urllib.request.Request(url, headers=UA), timeout=90) as r:
            b = r.read()
            log.append("- %s → HTTP %s | %s | %s | %d bytes | início=%r" % (url[:160], r.status, r.headers.get("Content-Type"), r.headers.get("Content-Disposition"), len(b), b[:60]))
            return b
    except Exception as e:  # noqa: BLE001
        log.append("- ERRO %s → %s: %s" % (url[:160], type(e).__name__, str(e)[:200]))
        return None
docs = json.load(open(os.path.join(raiz, "data", "ipe.json"), encoding="utf-8"))["documentos"]
rel = [d for d in docs if d["tipo"] == "Press-release"][:2]
for d in rel:
    log += ["", "## %s %s (protocolo %s)" % (d["data_entrega"], d["assunto"], d["protocolo"])]
    b = get(d["link"])
    if b and not b.startswith(b"%PDF"):
        s = b.decode("utf-8", "ignore")
        log.append("  título: %r" % (re.findall(r"<title>(.*?)</title>", s, re.S)[:1],))
        log.append("  iframes/src: %r" % re.findall(r'(?:src|href)="([^"]+)"', s)[:15])
        b64 = re.findall(r"([A-Za-z0-9+/]{200,}={0,2})", s)
        log.append("  blocos base64 longos: %d (maior %d chars)" % (len(b64), max([len(x) for x in b64] or [0])))
        if b64:
            import base64
            try:
                raw = base64.b64decode(max(b64, key=len)[:4000] + "==")
                log.append("  base64 decodificado começa com %r" % raw[:12])
            except Exception as e:  # noqa: BLE001
                log.append("  base64 inválido: %s" % e)
        log.append("  trecho: %r" % re.sub(r"\s+", " ", s)[:700])
    m = re.search(r"numSequencia=(\d+).*numVersao=(\d+).*", d["link"])
    for alt in ["https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=%s" % d["protocolo"],
                "https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&numSequencia=%s&numVersao=%s&numProtocolo=%s&descTipo=IPE&CodigoInstituicao=1" % (m.group(1) if m else "", m.group(2) if m else "", d["protocolo"])]:
        get(alt)
open(os.path.join(raiz, "logs", "releases-diagnostico.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
print("\n".join(log))
