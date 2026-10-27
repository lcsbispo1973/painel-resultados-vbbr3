"""Diagnóstico: mapeia a consulta externa do RAD novo (ENETWeb) da CVM."""
import json, os, re, sys, urllib.request, urllib.parse, http.cookiejar
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "rad.txt"), "w", encoding="utf-8")
def p(*a): print(*a, file=log, flush=True)
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
def get(u, **h):
    r = op.open(urllib.request.Request(u, headers={"User-Agent": UA, **h}), timeout=60); return r.status, r.geturl(), r.read(), dict(r.headers)
vistos = set()
def baixa(u, nome):
    if u in vistos: return None
    vistos.add(u)
    try:
        s, fim, b, h = get(u); p("GET", s, fim, len(b), h.get("Content-Type")); open(os.path.join(OUT, nome), "wb").write(b); return b.decode("utf-8", "replace")
    except Exception as e: p("ERRO", u, repr(e)); return None
for u in ["https://www.rad.cvm.gov.br/ENETWeb/frmConsultaExternaCVM.aspx", "https://www.rad.cvm.gov.br/ENETWeb/", "https://www.rad.cvm.gov.br/ENETWeb/frmConsultaExternaCVM"]:
    html = baixa(u, "pagina_%d.html" % len(vistos))
    if not html: continue
    for src in set(re.findall(r'(?:src|href)="([^"]+\.(?:js|json)[^"]*)"', html)):
        full = urllib.parse.urljoin(u, src) if not src.startswith("http") else src
        if "rad.cvm.gov.br" in full:
            t = baixa(full, "js_" + re.sub(r"[^A-Za-z0-9_.]", "_", src)[-90:])
            if t:
                for m in sorted(set(re.findall(r'["\'`](/?(?:api|ENETWeb|ENET)[^"\'`\s]{3,120})["\'`]', t)))[:80]: p("   rota:", m)
                for m in sorted(set(re.findall(r'[A-Za-z]*(?:Listar|Consult|Pesquis|Documento)[A-Za-z]*', t)))[:60]: p("   nome:", m)
p("cookies:", [c.name for c in cj])
p("(fim)")
