"""Diagnóstico único (2): links do FRE e nomes anteriores a 2016."""
import csv, io, os, urllib.request, zipfile
CNPJ = "34.274.233/0001-02"
BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/"
saida = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); saida.append(s)
def baixa(url, n=None):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.headers.get("Content-Type"), r.geturl(), (r.read(n) if n else r.read())

# 1) nomes anteriores a 2016 (DFP/ITR principal)
for ano in (2010, 2012, 2014, 2015):
    ct, u, b = baixa(f"{BASE}DFP/DADOS/dfp_cia_aberta_{ano}.zip")
    z = zipfile.ZipFile(io.BytesIO(b))
    ach = set()
    with z.open(f"dfp_cia_aberta_{ano}.csv") as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"), delimiter=";"):
            nm = r["DENOM_CIA"].upper()
            if "DISTRIBUIDORA" in nm and ("PETROBRAS" in nm or "BR " in nm or "VIBRA" in nm):
                ach.add((r["CNPJ_CIA"], r["DENOM_CIA"]))
    p(f"DFP {ano}: nomes parecidos = {sorted(ach)}")

# 2) links do FRE
linhas = []
for ano in range(2016, 2027):
    try:
        ct, u, b = baixa(f"{BASE}FRE/DADOS/fre_cia_aberta_{ano}.zip")
    except Exception as e:
        p(f"FRE {ano}: {e}"); continue
    z = zipfile.ZipFile(io.BytesIO(b))
    with z.open(f"fre_cia_aberta_{ano}.csv") as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"), delimiter=";"):
            if r["CNPJ_CIA"].strip() == CNPJ:
                linhas.append(r)
                p(f"FRE {ano}: DT_REFER={r['DT_REFER']} VERSAO={r['VERSAO']} CATEG={r['CATEG_DOC']} RECEB={r['DT_RECEB']} LINK={r['LINK_DOC']}")

# 3) testar download de um link
for r in [x for x in linhas if x["DT_REFER"].startswith("2025")][-1:] + [x for x in linhas if x["DT_REFER"].startswith("2017")][-1:]:
    try:
        ct, u, b = baixa(r["LINK_DOC"], 3000)
        p(f"TESTE LINK {r['DT_REFER']} v{r['VERSAO']}: content-type={ct} url_final={u} primeiros bytes={b[:200]!r}")
    except Exception as e:
        p(f"TESTE LINK {r['DT_REFER']}: {type(e).__name__} {str(e)[:100]}")

os.makedirs("logs", exist_ok=True)
open("logs/diagnostico-cvm-2.md", "w", encoding="utf-8").write("\n".join(saida) + "\n")
