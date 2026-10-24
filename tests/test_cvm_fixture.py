#!/usr/bin/env python3
"""Teste do pipeline da CVM com arquivos fictícios no layout dos Dados Abertos.
Valores em R$ mil (ESCALA_MOEDA = MIL), como nos arquivos reais. Execute: python tests/test_cvm_fixture.py"""
import csv
import io
import json
import os
import subprocess
import sys
import tempfile
import zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CNPJ = "34.274.233/0001-02"
CAB = ["CNPJ_CIA", "DT_REFER", "VERSAO", "DENOM_CIA", "CD_CVM", "GRUPO_DFP", "MOEDA", "ESCALA_MOEDA", "ORDEM_EXERC",
       "DT_INI_EXERC", "DT_FIM_EXERC", "CD_CONTA", "DS_CONTA", "VL_CONTA", "ST_CONTA_FIXA"]

DRE_Q = {  # trimestre -> conta -> valor (R$ milhões)
    1: {"3.01": 100, "3.02": -60, "3.03": 40, "3.04": -10, "3.05": 30, "3.06": -5, "3.07": 25, "3.08": -5, "3.09": 20, "3.11": 20},
    2: {"3.01": 110, "3.02": -66, "3.03": 44, "3.04": -11, "3.05": 33, "3.06": -6, "3.07": 27, "3.08": -7, "3.09": 20, "3.11": 20},
    3: {"3.01": 120, "3.02": -72, "3.03": 48, "3.04": -12, "3.05": 36, "3.06": -6, "3.07": 30, "3.08": -10, "3.09": 20, "3.11": 20},
    4: {"3.01": 130, "3.02": -78, "3.03": 52, "3.04": -13, "3.05": 39, "3.06": -7, "3.07": 32, "3.08": -12, "3.09": 20, "3.11": 20},
}
FIM = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}
INI_TRI = {1: "01-01", 2: "04-01", 3: "07-01", 4: "10-01"}
DFC_Q = {1: (50, -20, -10, 0, 80), 2: (60, -25, -15, 0, 100), 3: (55, -20, -5, 0, 120), 4: (70, -30, -10, 0, 150)}
BP = {"1": 1000, "1.01": 400, "1.01.01": None, "1.02": 600, "2": 1000, "2.01": 300, "2.02": 400, "2.03": 300}


def linha(ref, versao, ordem, ini, fim, cd, ds, val, fixa="S", cnpj=CNPJ):
    return [cnpj, ref, str(versao), "VIBRA ENERGIA S.A.", "1", "DF Consolidado", "REAL", "MIL", ordem, ini, fim, cd, ds,
            f"{val * 1000:.2f}", fixa]


def escreve(zf, nome, linhas):
    buf = io.StringIO(newline="")
    w = csv.writer(buf, delimiter=";")
    w.writerow(CAB)
    w.writerows(linhas)
    zf.writestr(nome, buf.getvalue().encode("latin-1"))


def monta(pasta):
    ano = "2025"
    itr_dre, itr_bpa, itr_bpp, itr_dfc, dfp_dre, dfp_bpa, dfp_bpp, dfp_dfc = ([] for _ in range(8))
    for q in (1, 2, 3):
        ref = f"{ano}-{FIM[q]}"
        for cd, v in DRE_Q[q].items():
            itr_dre.append(linha(ref, 1, "ÚLTIMO", f"{ano}-{INI_TRI[q]}", ref, cd, f"Conta {cd}", v))
            if q > 1:
                acum = sum(DRE_Q[k][cd] for k in range(1, q + 1))
                itr_dre.append(linha(ref, 1, "ÚLTIMO", f"{ano}-01-01", ref, cd, f"Conta {cd}", acum))
        itr_dre.append(linha(ref, 1, "ÚLTIMO", f"{ano}-{INI_TRI[q]}", ref, "3.01", "Receita", 999999, cnpj="00.000.000/0001-00"))
    # versão antiga (1) do 1T com valor errado, versão 2 correta já acima: troca a versão das linhas corretas
    for r in itr_dre:
        if r[1] == f"{ano}-03-31":
            r[2] = "2"
    itr_dre.append(linha(f"{ano}-03-31", 1, "ÚLTIMO", f"{ano}-01-01", f"{ano}-03-31", "3.01", "Receita", 5))
    for cd in DRE_Q[1]:
        fy = sum(DRE_Q[k][cd] for k in range(1, 5))
        dfp_dre.append(linha(f"{ano}-12-31", 1, "ÚLTIMO", f"{ano}-01-01", f"{ano}-12-31", cd, f"Conta {cd}", fy))
        dfp_dre.append(linha(f"{ano}-12-31", 1, "PENÚLTIMO", "2024-01-01", "2024-12-31", cd, f"Conta {cd}", 7))
    caixa = {}
    saldo = 80
    for q in (1, 2, 3, 4):
        op, inv, fin, cam, ini = DFC_Q[q]
        saldo = ini + op + inv + fin + cam
        caixa[q] = saldo
        ref = f"{ano}-{FIM[q]}"
        for cd, v in BP.items():
            val = caixa[q] if cd == "1.01.01" else v
            alvo_a, alvo_p = (itr_bpa, itr_bpp) if q < 4 else (dfp_bpa, dfp_bpp)
            (alvo_a if cd.startswith("1") else alvo_p).append(linha(ref, 1, "ÚLTIMO", "", ref, cd, f"Conta {cd}", val))
        acum = [sum(DFC_Q[k][i] for k in range(1, q + 1)) for i in range(4)]
        alvo = itr_dfc if q < 4 else dfp_dfc
        ini_ano = DFC_Q[1][4]
        for cd, v in (("6.01", acum[0]), ("6.02", acum[1]), ("6.03", acum[2]), ("6.04", acum[3]),
                      ("6.05", sum(acum)), ("6.05.01", ini_ano), ("6.05.02", ini_ano + sum(acum))):
            alvo.append(linha(ref, 1, "ÚLTIMO", f"{ano}-01-01", ref, cd, f"Conta {cd}", v))
    with zipfile.ZipFile(os.path.join(pasta, f"itr_cia_aberta_{ano}.zip"), "w") as z:
        escreve(z, f"itr_cia_aberta_DRE_con_{ano}.csv", itr_dre)
        escreve(z, f"itr_cia_aberta_DRE_ind_{ano}.csv", [linha(f"{ano}-03-31", 1, "ÚLTIMO", f"{ano}-01-01", f"{ano}-03-31", "3.01", "Receita", 123456)])
        escreve(z, f"itr_cia_aberta_BPA_con_{ano}.csv", itr_bpa)
        escreve(z, f"itr_cia_aberta_BPP_con_{ano}.csv", itr_bpp)
        escreve(z, f"itr_cia_aberta_DFC_MI_con_{ano}.csv", itr_dfc)
    with zipfile.ZipFile(os.path.join(pasta, f"dfp_cia_aberta_{ano}.zip"), "w") as z:
        escreve(z, f"dfp_cia_aberta_DRE_con_{ano}.csv", dfp_dre)
        escreve(z, f"dfp_cia_aberta_BPA_con_{ano}.csv", dfp_bpa)
        escreve(z, f"dfp_cia_aberta_BPP_con_{ano}.csv", dfp_bpp)
        escreve(z, f"dfp_cia_aberta_DFC_MI_con_{ano}.csv", dfp_dfc)


def main():
    with tempfile.TemporaryDirectory() as zips, tempfile.TemporaryDirectory() as saida:
        monta(zips)
        env = dict(os.environ, CVM_LOCAL_DIR=zips)
        r = subprocess.run([sys.executable, "-I", os.path.join(RAIZ, "pipeline", "cvm.py"), "--anos", "2025", "--saida", saida],
                           env=env, capture_output=True, text=True)
        print(r.stdout[-3000:], r.stderr[-2000:])
        assert r.returncode == 0, "pipeline falhou"
        carrega = lambda n: json.load(open(os.path.join(saida, "data", n), encoding="utf-8"))  # noqa: E731
        dre, bp, dfc, conf = (carrega(n) for n in ("cvm_dre.json", "cvm_balanco.json", "cvm_fluxo_caixa.json", "cvm_conferencias.json"))
        val = lambda t, cd, p: next(l for l in t["linhas"] if l["cd_conta"] == cd)[p]  # noqa: E731
        esperado = {
            ("dre", "3.01", "1T25"): 100, ("dre", "3.01", "2T25"): 110, ("dre", "3.01", "3T25"): 120,
            ("dre", "3.01", "4T25"): 130, ("dre", "3.11", "4T25"): 20, ("dre", "3.02", "4T25"): -78,
            ("bp", "1.01.01", "4T25"): 180, ("bp", "1", "2T25"): 1000,
            ("dfc", "6.01", "1T25"): 50, ("dfc", "6.01", "2T25"): 60, ("dfc", "6.01", "3T25"): 55, ("dfc", "6.01", "4T25"): 70,
            ("dfc", "6.05.01", "3T25"): 120, ("dfc", "6.05.02", "4T25"): 180,
        }
        tabelas = {"dre": dre, "bp": bp, "dfc": dfc}
        falhas = []
        for (t, cd, p), v in esperado.items():
            obtido = val(tabelas[t], cd, p)
            if obtido is None or abs(obtido - v) > 1e-6:
                falhas.append(f"{t} {cd} {p}: esperado {v}, obtido {obtido}")
        internas = [c for c in conf if c["demo"] != "Release" and c["status"] == "divergente"]
        falhas += [f"conferência divergente: {c['demo']} {c['periodo']} {c['teste']} dif {c['diferenca']}" for c in internas]
        ok = [c for c in conf if c["demo"] != "Release" and c["status"] == "ok"]
        assert len(ok) >= 25, f"poucas conferências ok ({len(ok)})"
        if falhas:
            print("FALHAS:\n" + "\n".join(falhas))
            sys.exit(1)
        print(f"TESTE OK: {len(esperado)} valores conferidos, {len(ok)} conferências internas ok.")


if __name__ == "__main__":
    main()
