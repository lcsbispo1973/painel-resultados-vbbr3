"""Diagnóstico: consulta de documentos da Vibra no RAD/ENET da CVM (tempo real)."""
import json, os, re, sys, urllib.request, http.cookiejar, datetime as dt, zipfile, io
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "rad.txt"), "w", encoding="utf-8")
def p(*a): print(*a, file=log, flush=True)
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
BASE = "https://www.rad.cvm.gov.br/ENET/"
def get(u, **h):
    r = op.open(urllib.request.Request(u, headers={"User-Agent": UA, **h}), timeout=60); return r.status, r.read(), dict(r.headers)
s, b, h = get(BASE + "frmConsultaExternaCVM.aspx"); html = b.decode("utf-8", "replace")
open(os.path.join(OUT, "pagina.html"), "w", encoding="utf-8").write(html)
for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
    u = src if src.startswith("http") else BASE + src.lstrip("/")
    try:
        _, js, _ = get(u); t = js.decode("utf-8", "replace")
        if "ListarDocumentos" in t or "Listar" in t or "categoria" in t:
            nome = re.sub(r"[^A-Za-z0-9_.]", "_", src)[-80:]; open(os.path.join(OUT, "js_" + nome), "w", encoding="utf-8").write(t); p("JS salvo:", src, len(t))
    except Exception as e: p("ERRO JS", src, repr(e))
# empresas: autocomplete
for path in ["frmConsultaExternaCVM.aspx/PopulaComboEmpresas", "frmConsultaExternaCVM.aspx/ListarEmpresas"]:
    try:
        req = urllib.request.Request(BASE + path, data=json.dumps({"tipoEmpresa": "0"}).encode() if "Popula" in path else b"{}",
                                     headers={"User-Agent": UA, "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest", "Referer": BASE + "frmConsultaExternaCVM.aspx"})
        t = op.open(req, timeout=60).read().decode("utf-8", "replace"); i = t.upper().find("VIBRA"); p(path, len(t), t[max(0, i - 300):i + 200] if i >= 0 else t[:400])
    except Exception as e: p("ERRO", path, repr(e))
hoje = dt.date.today()
def lista(**kw):
    body = {"dataDe": (hoje - dt.timedelta(days=60)).strftime("%d/%m/%Y"), "dataAte": hoje.strftime("%d/%m/%Y"), "empresa": "024295",
            "setorAtividade": "-1", "categoriaEmissor": "-1", "situacaoEmissor": "-1", "tipoParticipante": "-1", "dataReferencia": "",
            "categoria": "IPE_-1_-1_-1", "periodo": "2", "horaIni": "", "horaFim": "", "palavraChave": "", "ultimaDtRef": "false", "tipoEmpresa": "0",
            "token": "", "versaoCaptcha": ""}
    body.update(kw)
    req = urllib.request.Request(BASE + "frmConsultaExternaCVM.aspx/ListarDocumentos", data=json.dumps(body).encode(),
                                 headers={"User-Agent": UA, "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest",
                                          "Referer": BASE + "frmConsultaExternaCVM.aspx", "Origin": "https://www.rad.cvm.gov.br"})
    t = op.open(req, timeout=60).read().decode("utf-8", "replace"); return t
for kw in [dict(empresa="24295"), dict(empresa="024295"), dict(empresa="24295", periodo="0"), dict(empresa="24295", periodo="1"), dict(empresa="24295", periodo="3"),
           dict(empresa="", palavraChave="Vibra", periodo="0"), dict(empresa="24295", categoria="-1"), dict(empresa="24295", categoria="EST_-1"),
           dict(empresa="24295", tipoEmpresa="-1"), dict(empresa="024295", tipoEmpresa="-1"), dict(empresa="24295", dataDe="", dataAte="", periodo="1")]:
    try:
        t = lista(**kw); p("\n==", kw, len(t)); p(t[:1500])
    except Exception as e: p("\n==", kw, "ERRO", repr(e))
p("(fim)")
