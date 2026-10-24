"""Diagnóstico único: o que a CVM publica sobre a Vibra (anos, arquivos e tabelas do FRE)."""
import csv, io, os, sys, urllib.request, zipfile

CNPJ = "34.274.233/0001-02"
BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/"
saida = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); saida.append(s)

def baixa(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()

def linhas_vibra(z, nome):
    out = []
    with z.open(nome) as f:
        rd = csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"), delimiter=";")
        cab = rd.fieldnames
        for r in rd:
            if r.get("CNPJ_Companhia", r.get("CNPJ_CIA", "")).strip() == CNPJ:
                out.append(r)
    return cab, out

for tipo, sub, pref in [("DFP", "DFP/DADOS", "dfp_cia_aberta"), ("ITR", "ITR/DADOS", "itr_cia_aberta"), ("FRE", "FRE/DADOS", "fre_cia_aberta")]:
    p(f"## {tipo}")
    for ano in range(2008, 2027):
        url = f"{BASE}{sub}/{pref}_{ano}.zip"
        try:
            b = baixa(url)
            p(f"- {ano}: ok {len(b)//1024} KB")
        except Exception as e:
            p(f"- {ano}: {type(e).__name__} {str(e)[:60]}")

# DFP: arquivos e presença da Vibra em anos antigos
for ano in (2010, 2012, 2014, 2016, 2025):
    try:
        z = zipfile.ZipFile(io.BytesIO(baixa(f"{BASE}DFP/DADOS/dfp_cia_aberta_{ano}.zip")))
        p(f"## DFP {ano}: arquivos = {sorted(z.namelist())}")
        nome = [n for n in z.namelist() if n.endswith("_DRE_con_%d.csv" % ano)]
        if nome:
            cab, ls = linhas_vibra(z, nome[0]); p(f"   Vibra no DRE_con: {len(ls)} linhas")
            # nome alternativo
        else:
            p("   sem DRE_con")
    except Exception as e:
        p(f"## DFP {ano}: {e}")

# FRE: detalhe
for ano in (2017, 2020, 2025, 2026):
    try:
        z = zipfile.ZipFile(io.BytesIO(baixa(f"{BASE}FRE/DADOS/fre_cia_aberta_{ano}.zip")))
    except Exception as e:
        p(f"## FRE {ano}: {e}"); continue
    p(f"## FRE {ano}: {len(z.namelist())} arquivos")
    for n in sorted(z.namelist()):
        try:
            cab, ls = linhas_vibra(z, n)
        except Exception as e:
            p(f"   {n}: erro {e}"); continue
        p(f"   {n}: {len(ls)} linhas Vibra | colunas: {cab}")
        if ls and ano in (2025,) and ("geral" in n or "comentario" in n.lower() or "diretor" in n.lower()):
            p("      amostra: " + str({k: str(v)[:200] for k, v in ls[0].items()}))

os.makedirs("logs", exist_ok=True)
open("logs/diagnostico-cvm.md", "w", encoding="utf-8").write("\n".join(saida) + "\n")
