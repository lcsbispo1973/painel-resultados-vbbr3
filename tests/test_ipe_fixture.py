"""Confere a leitura do índice IPE da CVM com um arquivo sintético (sem rede)."""
import io, json, os, subprocess, sys, tempfile, zipfile
raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
cab = "CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download"
linhas = [
    "34.274.233/0001-02;VIBRA ENERGIA S.A.;024295;2026-08-06;Fato Relevante;;;Aquisição de participação;2026-08-06;AP - Apresentação;111;1;https://exemplo/111v1",
    "34.274.233/0001-02;VIBRA ENERGIA S.A.;024295;2026-08-06;Fato Relevante;;;Aquisição de participação (reapresentado);2026-08-07;RE - Reapresentação;111;2;https://exemplo/111v2",
    "34.274.233/0001-02;VIBRA ENERGIA S.A.;024295;2026-07-30;Comunicado ao Mercado;Apresentações a analistas/agentes do mercado;;Release de resultados 2T26;2026-07-30;AP - Apresentação;222;1;https://exemplo/222",
    "00.000.000/0001-91;OUTRA S.A.;000001;2026-07-30;Fato Relevante;;;Outra empresa;2026-07-30;AP;333;1;https://exemplo/333",
]
with tempfile.TemporaryDirectory() as d:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("ipe_cia_aberta_2026.csv", ("\n".join([cab] + linhas) + "\n").encode("latin-1"))
    open(os.path.join(d, "ipe_cia_aberta_2026.zip"), "wb").write(buf.getvalue())
    out = os.path.join(d, "saida")
    env = dict(os.environ, CVM_LOCAL_DIR=d)
    subprocess.run([sys.executable, "-I", os.path.join(raiz, "pipeline", "ipe.py"), "--saida", out], check=True, env=env, capture_output=True)
    docs = json.load(open(os.path.join(out, "ipe.json"), encoding="utf-8"))["documentos"]
assert len(docs) == 2, docs
assert docs[0]["protocolo"] == "111" and docs[0]["versao"] == 2 and docs[0]["link"].endswith("111v2"), docs[0]
assert docs[1]["tipo"].startswith("Apresentações") and docs[1]["assunto"] == "Release de resultados 2T26"
print("TESTE IPE OK")
