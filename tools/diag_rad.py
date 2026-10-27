"""Diagnóstico: Plantão de Notícias da B3 na semana do ITR 2T26 (títulos e detalhes) e download do pacote do ITR."""
import io, json, os, re, sys, urllib.request, urllib.error, http.cookiejar, zipfile
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "rad.txt"), "w", encoding="utf-8")
def p(*a): print(*a, file=log, flush=True)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def get(u, **h):
    r = op.open(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "*/*", **h}), timeout=120); return r.status, r.read(), dict(r.headers)
s, b, h = get("https://sistemasweb.b3.com.br/PlantaoNoticias/Noticias/ListarTitulosNoticias?agencia=18&palavra=VIBRA&dataInicial=2026-08-10&dataFinal=2026-08-20")
ns = json.loads(b.decode("utf-8"))
for n in ns:
    m = n["NwsMsg"]; p("\n#", m["dateTime"], m["headline"], m["id"])
    if not re.search(r"ITR|Resultado|Release|Demonstra|Fato Relevante|Comunicado", m["headline"], re.I): continue
    for u in ["https://sistemasweb.b3.com.br/PlantaoNoticias/Noticias/ListarDetalheNoticia?idNoticia=%s&agencia=18&dataNoticia=%s" % (m["id"], m["dateTime"].replace(" ", "%20")),
              "https://sistemasweb.b3.com.br/PlantaoNoticias/Noticias/Detail?idNoticia=%s&agencia=18&dataNoticia=%s" % (m["id"], m["dateTime"].replace(" ", "%20"))]:
        try:
            s, b, h = get(u); t = b.decode("utf-8", "replace"); p("  detalhe", s, len(t), u.split("/Noticias/")[1][:30]); p("  ", re.sub(r"\s+", " ", t)[:1200])
            for l in sorted(set(re.findall(r"https?://[^\"'<> \\]+", t)))[:10]: p("   link:", l)
            break
        except Exception as e: p("  ERRO detalhe", repr(e))
for u in ["https://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento=160918",
          "https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento=160918",
          "https://www.rad.cvm.gov.br/ENETWeb/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento=160918"]:
    try:
        s, b, h = get(u); p("\ndownload", u, s, len(b), h.get("Content-Type"), h.get("Content-Disposition"))
        try:
            z = zipfile.ZipFile(io.BytesIO(b)); p("conteúdo:", [(i.filename, i.file_size) for i in z.infolist()])
            for i in z.infolist():
                d = z.read(i)
                if d[:2] == b"PK":
                    z2 = zipfile.ZipFile(io.BytesIO(d)); p("  interno", i.filename, [(j.filename, j.file_size) for j in z2.infolist()])
                    for j in z2.infolist():
                        if j.filename.lower().endswith(".xml") and j.file_size < 3_000_000: open(os.path.join(OUT, "itr_" + os.path.basename(j.filename)), "wb").write(z2.read(j))
                elif i.filename.lower().endswith(".xml"): open(os.path.join(OUT, "itr_" + os.path.basename(i.filename)), "wb").write(d)
            break
        except Exception as e: p("não é zip:", repr(e), b[:300])
    except Exception as e: p("\nERRO download", u, repr(e))
p("(fim)")
