"""Diagnóstico: consulta de documentos da Vibra no RAD/ENET da CVM (tempo real) e download de um pacote de ITR."""
import json, os, re, sys, urllib.request, http.cookiejar, datetime as dt, zipfile, io
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "rad.txt"), "w", encoding="utf-8")
def p(*a): print(*a, file=log, flush=True)
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
BASE = "https://www.rad.cvm.gov.br/ENET/"
def get(u, **h):
    r = op.open(urllib.request.Request(u, headers={"User-Agent": UA, **h}), timeout=60); return r.status, r.read(), dict(r.headers)
try:
    s, b, h = get(BASE + "frmConsultaExternaCVM.aspx"); p("GET consulta:", s, len(b)); p("cookies:", [c.name for c in cj])
    p("trecho:", re.sub(r"\s+", " ", b.decode("utf-8", "replace"))[:600])
    for v in re.findall(r'(captcha[^"<>]{0,80})', b.decode("utf-8", "replace"), re.I)[:5]: p("captcha?:", v)
except Exception as e: p("ERRO GET consulta:", repr(e))
hoje = dt.date.today()
for cat in ["EST_-1", "EST_3", "EST_4", "IPE_-1_-1_-1", "-1"]:
    body = {"dataDe": (hoje - dt.timedelta(days=150)).strftime("%d/%m/%Y"), "dataAte": hoje.strftime("%d/%m/%Y"), "empresa": "024295",
            "setorAtividade": "-1", "categoriaEmissor": "-1", "situacaoEmissor": "-1", "tipoParticipante": "-1", "dataReferencia": "",
            "categoria": cat, "periodo": "2", "horaIni": "", "horaFim": "", "palavraChave": "", "ultimaDtRef": "false", "tipoEmpresa": "0",
            "token": "", "versaoCaptcha": ""}
    try:
        req = urllib.request.Request(BASE + "frmConsultaExternaCVM.aspx/ListarDocumentos", data=json.dumps(body).encode(),
                                     headers={"User-Agent": UA, "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest",
                                              "Referer": BASE + "frmConsultaExternaCVM.aspx", "Origin": "https://www.rad.cvm.gov.br"})
        r = op.open(req, timeout=60); t = r.read().decode("utf-8", "replace")
        p("\n== categoria", cat, "HTTP", r.status, "bytes", len(t)); p(t[:3000])
        open(os.path.join(OUT, "lista_%s.json" % cat.replace("-", "m")), "w", encoding="utf-8").write(t)
    except Exception as e:
        p("\n== categoria", cat, "ERRO", repr(e))
        try: p(e.read().decode("utf-8", "replace")[:1500])
        except Exception: pass
# download de um ITR (se a lista trouxer os parâmetros)
txt = "".join(open(os.path.join(OUT, f), encoding="utf-8").read() for f in os.listdir(OUT) if f.startswith("lista_"))
m = re.findall(r"OpenDownloadDocumentos\(\s*\\?'(\d+)\\?'\s*,\s*\\?'(\d+)\\?'\s*,\s*\\?'([^'\\]+)\\?'\s*,\s*\\?'([^'\\]+)\\?'", txt)
p("\nparâmetros de download encontrados:", m[:10])
for seq, ver, prot, tipo in [x for x in m if x[3] in ("ITR", "DFP")][:1]:
    u = BASE + "frmDownloadDocumento.aspx?Tela=ext&numSequencia=%s&numVersao=%s&numProtocolo=%s&descTipo=%s&CodigoInstituicao=1" % (seq, ver, prot, tipo)
    try:
        s, b, h = get(u, Referer=BASE + "frmConsultaExternaCVM.aspx"); p("download", tipo, s, len(b), h.get("Content-Type"), h.get("Content-Disposition"))
        open(os.path.join(OUT, "pacote_%s.bin" % tipo), "wb").write(b)
        try:
            z = zipfile.ZipFile(io.BytesIO(b)); p("conteúdo:", [(i.filename, i.file_size) for i in z.infolist()][:40])
        except Exception as e: p("não é zip:", repr(e), b[:300])
    except Exception as e: p("ERRO download:", repr(e))
p("(fim)")
