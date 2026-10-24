"""Confere a leitura automática dos releases com valores conferidos à mão nos PDFs (textos reais em data/releases)."""
import json, os, subprocess, sys
raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
subprocess.run([sys.executable, "-I", os.path.join(raiz, "pipeline", "releases_ler.py")], check=True, capture_output=True)
d = json.load(open(os.path.join(raiz, "data", "release_operacional.json"), encoding="utf-8"))["series"]
v = lambda p, s, m: d[p][s][m]["v"]
casos = [
    ("2T26", "CONS", "vol", 9053), ("2T26", "CONS", "ebitda", 4499), ("2T26", "CONS", "margem_m3", 476), ("2T26", "CONS", "ebitda_rec", 4124),
    ("2T26", "REDE", "ebitda", 2658), ("2T26", "B2B", "ebitda", 1728), ("2T26", "REN", "ebitda", 188), ("2T26", "B2B", "vol", 3253),
    ("1T26", "REDE", "ebitda", 1729), ("1T26", "B2B", "ebitda", 1473), ("1T26", "CONS", "ebitda", 3204), ("1T26", "REN", "ebitda", 147),
    ("4T25", "REDE", "ebitda", 1849), ("2T25", "CONS", "ebitda", 1472), ("1T25", "REN", "ebitda", 213),
    ("3T24", "CONS", "ebitda", 1987),      # manchete do release, sem a recuperação tributária extraordinária
    ("3T18", "CONS", "vol", 10966),       # release com colunas na ordem atual, trimestre anterior, ano anterior
    ("4T17", "CONS", "vol", 11028),       # release com vírgula como separador de milhar
    ("2T20", "CONS", "margem_m3", 104),   # rótulo quebrado em três linhas
]
for p, s, m, esperado in casos:
    assert v(p, s, m) == esperado, (p, s, m, v(p, s, m), esperado)
assert len(d) >= 35, len(d)
print("TESTE RELEASES OK: %d valores" % len(casos))
