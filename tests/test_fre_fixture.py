#!/usr/bin/env python3
"""Teste do pipeline do FRE com arquivos fictícios: última versão, dados pessoais fora e séries."""
import csv, io, json, os, subprocess, sys, tempfile, zipfile
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CNPJ = "34.274.233/0001-02"


def csv_bytes(cab, linhas):
    b = io.StringIO(newline="")
    w = csv.writer(b, delimiter=";"); w.writerow(cab); w.writerows(linhas)
    return b.getvalue().encode("latin-1")


def main():
    with tempfile.TemporaryDirectory() as zips, tempfile.TemporaryDirectory() as saida:
        p = lambda v, i: [CNPJ, "2025-12-31", str(v), "VIBRA", "1", "FRE", str(i), "2025-05-30", "http://x/%d" % i]  # noqa: E731
        outro = ["11.111.111/0001-11", "2025-12-31", "9", "OUTRA", "2", "FRE", "99", "2025-05-30", "http://x/99"]
        with zipfile.ZipFile(os.path.join(zips, "fre_cia_aberta_2025.zip"), "w") as z:
            z.writestr("fre_cia_aberta_2025.csv", csv_bytes(["CNPJ_CIA", "DT_REFER", "VERSAO", "DENOM_CIA", "CD_CVM", "CATEG_DOC", "ID_DOC", "DT_RECEB", "LINK_DOC"],
                                                          [p(1, 10), p(2, 20), outro]))
            cab = ["CNPJ_Companhia", "Data_Referencia", "Versao", "ID_Documento", "Nome_Companhia", "Tipo_Capital", "Valor_Capital", "Quantidade_Total_Acoes"]
            z.writestr("fre_cia_aberta_capital_social_2025.csv", csv_bytes(cab, [
                [CNPJ, "2025-12-31", "1", "10", "VIBRA", "Capital Emitido", "1000000", "100"],
                [CNPJ, "2025-12-31", "2", "20", "VIBRA", "Capital Emitido", "7000000000", "1123000000"],
                ["11.111.111/0001-11", "2025-12-31", "9", "99", "OUTRA", "Capital Emitido", "5", "5"]]))
            cab = ["CNPJ_Companhia", "Data_Referencia", "Versao", "ID_Documento", "Acionista", "Tipo_Pessoa_Acionista", "CPF_CNPJ_Acionista", "Percentual_Total_Acoes_Circulacao"]
            z.writestr("fre_cia_aberta_posicao_acionaria_2025.csv", csv_bytes(cab, [
                [CNPJ, "2025-12-31", "2", "20", "FUNDO XYZ", "Pessoa Jurídica", "00.000.000/0001-00", "12.5"],
                [CNPJ, "2025-12-31", "2", "20", "JOAO DA SILVA", "Pessoa Física", "123.456.789-00", "0.5"]]))
            cab = ["CNPJ_Companhia", "Data_Referencia", "Versao", "ID_Documento", "Data_Fim_Exercicio_Social", "Orgao_Administracao", "Total_Remuneracao_Orgao", "Numero_Membros", "Salario", "Bonus"]
            z.writestr("fre_cia_aberta_remuneracao_total_orgao_2025.csv", csv_bytes(cab, [
                [CNPJ, "2025-12-31", "2", "20", "2025-12-31", "Diretoria Estatutária", "60000000", "8", "20000000", "30000000"]]))
        env = dict(os.environ, CVM_LOCAL_DIR=zips)
        r = subprocess.run([sys.executable, "-I", os.path.join(RAIZ, "pipeline", "fre.py"), "--anos", "2025", "--saida", saida], env=env, capture_output=True, text=True)
        print(r.stdout[-1500:], r.stderr[-1500:])
        assert r.returncode == 0
        aj = json.load(open(os.path.join(saida, "data", "fre", "2025.json"), encoding="utf-8"))
        assert len(aj["documentos"]) == 1 and aj["documentos"][0]["versao"] == 2 and aj["documentos"][0]["versoes_no_ano"] == 2, aj["documentos"]
        cs = aj["tabelas"]["capital_social"]
        assert len(cs["linhas"]) == 1 and "7000000000" in cs["linhas"][0], cs
        pa = aj["tabelas"]["posicao_acionaria"]
        txt = json.dumps(pa, ensure_ascii=False)
        assert "123.456.789" not in txt and "JOAO" not in txt and "Pessoa física (não identificada)" in txt and "FUNDO XYZ" in txt, txt
        assert "CPF_CNPJ_Acionista" not in pa["colunas"], pa["colunas"]
        s = json.load(open(os.path.join(saida, "data", "fre_series.json"), encoding="utf-8"))
        rem = s["remuneracao"][0]
        assert rem["total_rs_mi"] == 60.0 and rem["fixa_rs_mi"] == 20.0 and rem["variavel_rs_mi"] == 30.0, rem
        assert s["capital"][0]["capital_rs_mi"] == 7000.0, s["capital"]
        print("TESTE FRE OK")


if __name__ == "__main__":
    main()
