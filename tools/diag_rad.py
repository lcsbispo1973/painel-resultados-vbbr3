"""Diagnóstico: fontes em tempo real para documentos da Vibra (B3 Plantão de Notícias, B3 listados) e download do pacote do ITR na CVM."""
import base64, csv, io, json, os, re, sys, urllib.request, urllib.error, http.cookiejar, datetime as dt, zipfile
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "rad.txt"), "w", encoding="utf-8")
def p(*a): print(*a, file=log, flush=True)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def get(u, **h):
    r = op.open(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json, text/plain, */*", **h}), timeout=90); return r.status, r.read(), dict(r.headers)
hoje = dt.date.today()
def tenta(nome, u, n=1500, salvar=None):
    try:
        s, b, h = get(u); t = b.decode("utf-8", "replace"); p("\n==", nome, s, len(b), h.get("Content-Type")); p(t[:n])
        if salvar: open(os.path.join(OUT, salvar), "wb").write(b)
        return b
    except urllib.error.HTTPError as e:
        p("\n==", nome, "HTTP", e.code, e.read()[:300])
    except Exception as e: p("\n==", nome, "ERRO", repr(e))
# 1) B3 Plantão de Notícias
for palavra in ["VIBRA", "VBBR"]:
    tenta("plantao " + palavra, "https://sistemasweb.b3.com.br/PlantaoNoticias/Noticias/ListarTitulosNoticias?agencia=18&palavra=%s&dataInicial=%s&dataFinal=%s" % (palavra, (hoje - dt.timedelta(days=40)).isoformat(), hoje.isoformat()), 2500, "plantao_%s.json" % palavra)
# 2) B3 listados (proxy de empresas)
def b64(o): return base64.b64encode(json.dumps(o, separators=(",", ":")).encode()).decode()
for nome, path, o in [("detalhe", "GetDetail", {"codeCVM": "24295", "language": "pt-br"}),
                      ("financeiro", "GetListedFinancial", {"codeCVM": "24295", "language": "pt-br"}),
                      ("tipos doc", "GetListedDocumentsTypeHistory", {"cnpj": "34274233000102", "language": "pt-br"}),
                      ("dividendos", "GetListedSupplementCompany", {"issuingCompany": "VBBR", "language": "pt-br"})]:
    tenta("b3 " + nome, "https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/%s/%s" % (path, b64(o)), 1500)
# 3) pacote do ITR mais recente pelo link da base aberta
try:
    s, b, h = get("https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_%d.zip" % hoje.year)
    z = zipfile.ZipFile(io.BytesIO(b)); nome = [n for n in z.namelist() if re.fullmatch(r"itr_cia_aberta_\d{4}\.csv", n)][0]
    linhas = [r for r in csv.DictReader(io.TextIOWrapper(z.open(nome), encoding="latin-1"), delimiter=";") if r.get("CD_CVM", "").lstrip("0") == "24295"]
    p("\nITR na base aberta:", [(r["DT_REFER"], r["VERSAO"], r["DT_RECEB"], r["LINK_DOC"]) for r in linhas])
    link = sorted(linhas, key=lambda r: (r["DT_REFER"], int(r["VERSAO"])))[-1]["LINK_DOC"]
    for u in [link, link.replace("/ENET/", "/ENETWeb/")]:
        try:
            s, b, h = get(u, Accept="*/*"); p("download", u, s, len(b), h.get("Content-Type"), h.get("Content-Disposition"))
            try:
                z = zipfile.ZipFile(io.BytesIO(b)); p("conteúdo:", [(i.filename, i.file_size) for i in z.infolist()])
                for i in z.infolist():
                    if re.search(r"\.(itr|dfp)$", i.filename, re.I):
                        z2 = zipfile.ZipFile(io.BytesIO(z.read(i))); p("  interno:", [(j.filename, j.file_size) for j in z2.infolist()])
                        for j in z2.infolist():
                            if j.filename.lower().endswith(".xml") and "InfoFinaDFin" in j.filename:
                                open(os.path.join(OUT, j.filename), "wb").write(z2.read(j))
                    elif i.filename.lower().endswith(".xml"):
                        open(os.path.join(OUT, i.filename), "wb").write(z.read(i))
                break
            except Exception as e: p("não é zip:", repr(e), b[:400])
        except Exception as e: p("ERRO download", u, repr(e))
except Exception as e: p("ERRO ITR:", repr(e))
p("(fim)")
