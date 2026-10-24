"""Confere as leituras de documentos (nota de segmentos das DFs da Vibra e releases da Ultrapar) com valores conferidos nos PDFs."""
import json, os, subprocess, sys
raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
for s in ("ebitda_df.py", "ipiranga.py"):
    subprocess.run([sys.executable, "-I", os.path.join(raiz, "pipeline", s)], check=True, capture_output=True)
aj = json.load(open(os.path.join(raiz, "data", "ebitda_ajustado.json"), encoding="utf-8"))["series"]
ip = json.load(open(os.path.join(raiz, "data", "ipiranga.json"), encoding="utf-8"))["series"]
casos_aj = [("2T26", "CONS", 4499), ("2T26", "REDE", 2658), ("2T26", "B2B", 1728), ("2T26", "REN", 188), ("2T26", "CORP", -75),
            ("3T24", "CONS", 6062), ("3T24", "CORP", 3966), ("4T25", "CONS", 2620), ("1T26", "CONS", 3204), ("1T26", "SEG", 3349),
            ("1T22", "CONS", 1090), ("2T25", "CONS", 1472), ("4T21", "CONS", 1598)]
for p, s, v in casos_aj:
    assert aj[p][s]["v"] == v, (p, s, aj[p][s]["v"], v)
assert aj["4T21"]["CONS"]["fonte"]["tipo"] == "release" and aj["2T26"]["CONS"]["fonte"]["tipo"] == "ITR"
for p in aj:   # segmentos + corporativo = consolidado nos trimestres da DF
    x = aj[p]
    if "CORP" in x:
        assert abs(sum(x[k]["v"] for k in ("REDE", "B2B", "REN") if k in x) + x["CORP"]["v"] - x["CONS"]["v"]) <= 2, p
casos_ip = [("2T26", "vol", 6173), ("2T26", "ebitda", 2773), ("2T25", "ebitda", 1199), ("2T18", "ebitda", 402), ("2T21", "vol", 5585)]
for p, m, v in casos_ip:
    assert ip[p][m]["v"] == v, (p, m, ip[p][m]["v"], v)
print("TESTE DOCUMENTOS OK: %d valores" % (len(casos_aj) + len(casos_ip)))
