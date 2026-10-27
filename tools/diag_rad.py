"""Diagnóstico: lista documentos da Vibra no RAD novo (ENETWeb) e baixa o pacote do ITR mais recente."""
import json, os, re, sys, urllib.request, http.cookiejar, datetime as dt, zipfile, io
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "rad.txt"), "w", encoding="utf-8")
def p(*a): print(*a, file=log, flush=True)
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
B = "https://www.rad.cvm.gov.br/ENETWeb/"
op.open(urllib.request.Request(B + "frmConsultaExternaCVM.aspx", headers={"User-Agent": UA}), timeout=60).read()
hoje = dt.date.today()
def lista(empresa, categoria, dias=200, periodo="2"):
    dv = ("{ dataDe: '%s', dataAte: '%s' , empresa: '%s', setorAtividade: '-1', categoriaEmissor: '-1', situacaoEmissor: '-1', tipoParticipante: '-1', dataReferencia: '', "
          "categoria: '%s', periodo: '%s', horaIni: '', horaFim: '', palavraChave:'',ultimaDtRef:'false', tipoEmpresa:'0', token: '', versaoCaptcha: ''}") % (
        (hoje - dt.timedelta(days=dias)).strftime("%d/%m/%Y"), hoje.strftime("%d/%m/%Y"), empresa, categoria, periodo)
    req = urllib.request.Request(B + "frmConsultaExternaCVM.aspx/ListarDocumentos", data=dv.encode("utf-8"),
                                 headers={"User-Agent": UA, "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest", "Referer": B + "frmConsultaExternaCVM.aspx"})
    return json.loads(op.open(req, timeout=90).read().decode("utf-8"))["d"]
melhor = None
for emp in [",024295", "024295", ",24295"]:
    for cat in ["EST_-1,IPE_-1_-1_-1", "EST_-1", "IPE_-1_-1_-1"]:
        try:
            d = lista(emp, cat); n = len([x for x in (d.get("dados") or "").split("&*") if x])
            p("empresa=%r categoria=%r → erro=%s %s linhas=%d" % (emp, cat, d.get("temErro"), d.get("msgErro", "")[:200], n))
            if n and (melhor is None or n > melhor[0]): melhor = (n, d["dados"])
        except Exception as e: p("empresa=%r categoria=%r ERRO %r" % (emp, cat, e))
if melhor:
    open(os.path.join(OUT, "lista.txt"), "w", encoding="utf-8").write(melhor[1])
    linhas = [l.split("$&") for l in melhor[1].split("&*") if l]
    p("\ncolunas por linha:", sorted(set(len(l) for l in linhas)))
    for l in linhas[:12]: p(" | ".join(re.sub(r"\s+", " ", c)[:160] for c in l))
    downs = re.findall(r"OpenDownloadDocumentos\('(\d+)','(\d+)','([^']+)','([^']+)'\)", melhor[1])
    p("\ndownloads:", downs[:8])
    for seq, ver, prot, tipo in [x for x in downs if x[3] in ("ITR", "DFP")][:1]:
        u = B + "frmDownloadDocumento.aspx?Tela=ext&numSequencia=%s&numVersao=%s&numProtocolo=%s&descTipo=%s&CodigoInstituicao=1" % (seq, ver, prot, tipo)
        r = op.open(urllib.request.Request(u, headers={"User-Agent": UA, "Referer": B + "frmConsultaExternaCVM.aspx"}), timeout=120); b = r.read()
        p("download", tipo, r.status, len(b), r.headers.get("Content-Type"), r.headers.get("Content-Disposition"))
        open(os.path.join(OUT, "pacote.bin"), "wb").write(b)
        try:
            z = zipfile.ZipFile(io.BytesIO(b)); p("conteúdo:", [(i.filename, i.file_size) for i in z.infolist()])
            for i in z.infolist():
                if i.filename.lower().endswith((".itr", ".dfp")):
                    z2 = zipfile.ZipFile(io.BytesIO(z.read(i))); p("  interno:", [(j.filename, j.file_size) for j in z2.infolist()])
        except Exception as e: p("não é zip:", repr(e), b[:300])
p("(fim)")
