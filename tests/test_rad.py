"""O leitor do pacote do RAD (pipeline/rad.py) reproduz, conta a conta, as linhas da base aberta da CVM.

Fixtures: DadosDocumento.xlsx do ITR 2T26 e da DFP 2025 da Vibra (baixados da CVM). Referência: data/cvm_raw (base aberta).
"""
import csv, os, sys
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
import rad  # noqa: E402

pasta = os.path.join(RAIZ, "data", "cvm_raw")
fixas = rad.fixas_conhecidas(pasta)
n = 0
for tipo, ref, ano in (("ITR", "2026-06-30", "2026"), ("DFP", "2025-12-31", "2025")):
    xl = open(os.path.join(RAIZ, "tests", "fixtures", "rad", "%s_%s_v1.xlsx" % (tipo, ref)), "rb").read()
    linhas, acoes = rad.linhas_documento(rad.ler_xlsx(xl), tipo, ref, 1, fixas)
    chave = lambda r: (r["demo"], r["ORDEM_EXERC"], r["DT_INI_EXERC"], r["DT_FIM_EXERC"], r["CD_CONTA"].strip(), (r.get("COLUNA_DF") or "").strip())  # noqa: E731
    novo = {chave(r): r for r in linhas}
    ab = {}
    for demo in ("BPA", "BPP", "DRE", "DRA", "DFC", "DVA", "DMPL"):
        for r in csv.DictReader(open(os.path.join(pasta, "%s_%s_%s.csv" % (tipo, demo, ano)), encoding="utf-8")):
            if r["DT_REFER"] == ref and r["VERSAO"] == "1":
                ab[chave(r)] = r
    faltam = sorted(set(ab) - set(novo))
    sobram = sorted(set(novo) - set(ab))
    assert not faltam and not sobram, "%s %s: faltam %s / sobram %s" % (tipo, ref, faltam[:5], sobram[:5])
    for k, r in ab.items():
        a, b = float(r["VL_CONTA"]), float(novo[k]["VL_CONTA"])
        assert abs(a - b) < 1e-6, "%s %s %s: base aberta %s × RAD %s" % (tipo, ref, k, a, b)
        assert r["DS_CONTA"].strip() == novo[k]["DS_CONTA"].strip(), "%s %s: descrição %r × %r" % (tipo, k, r["DS_CONTA"], novo[k]["DS_CONTA"])
        assert r["ESCALA_MOEDA"].strip().upper() == novo[k]["ESCALA_MOEDA"], (tipo, k)
        assert (r["ST_CONTA_FIXA"].strip() or "N") == novo[k]["ST_CONTA_FIXA"], (tipo, k, r["ST_CONTA_FIXA"], novo[k]["ST_CONTA_FIXA"])
        n += 1
    ac = [r for r in csv.DictReader(open(os.path.join(pasta, "%s_ACOES_%s.csv" % (tipo, ano)), encoding="utf-8")) if r["DT_REFER"] == ref][-1]
    for c in ("ON", "PN", "TOTAL", "ON_TESOURO", "PN_TESOURO", "TOTAL_TESOURO"):
        assert float(ac[c] or 0) == float(acoes[c] or 0), (tipo, c, ac[c], acoes[c])
        n += 1
print("TESTE RAD OK: %d valores iguais à base aberta (ITR 2T26 e DFP 2025)" % n)
