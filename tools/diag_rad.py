"""Diagnóstico: PDF pelo ID do Plantão, pacote de DFP, e títulos do Plantão em 12 meses."""
import csv, io, json, os, re, sys, urllib.request, urllib.error, http.cookiejar, zipfile, datetime as dt
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "rad.txt"), "w", encoding="utf-8")
def p(*a): print(*a, file=log, flush=True)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def get(u, **h):
    r = op.open(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "*/*", **h}), timeout=180); return r.status, r.geturl(), r.read(), dict(r.headers)
for u in ["https://www.rad.cvm.gov.br/ENETWEB/frmExibirArquivoIPEExterno.aspx?ID=1558260",
          "https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=1558260",
          "https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo=1558260&numSequencia=1082966&numVersao=1"]:
    try:
        s, fim, b, h = get(u); p("PDF?", s, len(b), h.get("Content-Type"), b[:8], fim[:120]); 
        if not b.startswith(b"%PDF"): p("   ", re.sub(rb"\s+", b" ", b[:600]))
    except Exception as e: p("ERRO", u, repr(e))
# DFP 2025
try:
    s, _, b, h = get("https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2025.zip")
    z = zipfile.ZipFile(io.BytesIO(b)); nome = [n for n in z.namelist() if re.fullmatch(r"dfp_cia_aberta_\d{4}\.csv", n)][0]
    ls = [r for r in csv.DictReader(io.TextIOWrapper(z.open(nome), encoding="latin-1"), delimiter=";") if r.get("CD_CVM", "").lstrip("0") == "24295"]
    p("DFP base aberta:", [(r["DT_REFER"], r["VERSAO"], r["LINK_DOC"]) for r in ls])
    link = sorted(ls, key=lambda r: int(r["VERSAO"]))[-1]["LINK_DOC"].replace("http://", "https://")
    s, _, b, h = get(link); z = zipfile.ZipFile(io.BytesIO(b)); p("pacote DFP:", [(i.filename, i.file_size) for i in z.infolist()])
    for i in z.infolist():
        if i.filename == "DadosDocumento.xlsx": open(os.path.join(OUT, "DFP_DadosDocumento.xlsx"), "wb").write(z.read(i))
except Exception as e: p("ERRO DFP", repr(e))
try:
    s, _, b, h = get("https://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento=160918")
    z = zipfile.ZipFile(io.BytesIO(b)); open(os.path.join(OUT, "ITR_DadosDocumento.xlsx"), "wb").write(z.read("DadosDocumento.xlsx"))
except Exception as e: p("ERRO ITR", repr(e))
# Plantão: 12 meses, em janelas de 30 dias
hoje = dt.date.today(); todos = {}
for k in range(13):
    fim = hoje - dt.timedelta(days=30 * k); ini = fim - dt.timedelta(days=30)
    try:
        s, _, b, h = get("https://sistemasweb.b3.com.br/PlantaoNoticias/Noticias/ListarTitulosNoticias?agencia=18&palavra=VIBRA&dataInicial=%s&dataFinal=%s" % (ini, fim))
        for n in json.loads(b.decode("utf-8")): todos[n["NwsMsg"]["id"]] = n["NwsMsg"]
    except Exception as e: p("ERRO plantao", ini, repr(e))
p("\nPlantão 12 meses: %d notícias" % len(todos))
json.dump(sorted(todos.values(), key=lambda m: m["dateTime"]), open(os.path.join(OUT, "plantao_12m.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
for m in sorted(todos.values(), key=lambda m: m["dateTime"]): p(m["dateTime"], m["headline"])
p("(fim)")
