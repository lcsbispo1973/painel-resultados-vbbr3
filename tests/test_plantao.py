"""Plantão de Notícias da B3: classificação dos títulos reais e regras dos documentos provisórios (pipeline/plantao.py e ipe.py)."""
import json, os, sys, tempfile
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
import plantao, ipe  # noqa: E401,E402

n = 0
casos = {
    "VIBRA (VBBR-NM) - Demonstracoes Financeiras - ITR de 30/09/25": {"doc": "ITR", "dt_refer": "2025-09-30"},
    "VIBRA (VBBR-NM) - Demonstracoes Financeiras - DFP de 31/12/25": {"doc": "DFP", "dt_refer": "2025-12-31"},
    "VIBRA (VBBR-NM) - Dados Financeiros - Press-release - 30/06/26": {"categoria": "Dados Econômico-Financeiros", "tipo": "Press-release", "assunto": "Release 2T26"},
    "VIBRA (VBBR-NM) - Dados Financeiros - Press-release - 14/08/26 (C)": {"tipo": "Press-release", "data_ref": "2026-08-14"},
    "VIBRA (VBBR-NM) - Fato Relevante - 13/10/26": {"categoria": "Fato Relevante", "tipo": ""},
    "VIBRA (VBBR-NM) - Outros Comunicados ao Mercado - 25/09/26": {"categoria": "Comunicado ao Mercado", "tipo": "Outros Comunicados Não Considerados Fatos Relevantes"},
    "VIBRA (VBBR-NM) - Aviso aos Acionistas - 14/08/26": {"categoria": "Aviso aos Acionistas"},
    "VIBRA (VBBR-NM) - Sumario Reuniao Conselho Administracao - 01/10/26": {"categoria": "Reunião da Administração", "tipo": "Conselho de Administração"},
    "VIBRA (VBBR-NM) - Relatorio de Agencia de Rating - 30/10/25": {"categoria": "Dados Econômico-Financeiros", "tipo": "Relatório de Agência de Rating"},
    "VIBRA (VBBR-NM) - Esclarecimentos de questionamentos CVM/B3- 15/10/26": {"categoria": "Comunicado ao Mercado", "tipo": "Esclarecimentos sobre questionamentos da CVM/B3"},
    "VIBRA (VBBR-NM) - Mudanca de Auditor - 31/12/26": {"categoria": "Comunicado ao Mercado", "tipo": "Mudança de Auditor (art. 28, Instr. CVM nº308/99)"},
}
for t, esperado in casos.items():
    r = plantao.classifica(t)
    for k, v in esperado.items():
        assert r.get(k) == v, "%s: %s = %r (esperado %r)" % (t, k, r.get(k), v)
        n += 1
# documentos provisórios: entram só os que a base aberta ainda não tem, sem cancelados, e saem quando ela cobre a data
noticias = [
    {"id": 1, "data_hora": "2026-10-27 08:00:00", "titulo": "VIBRA (VBBR-NM) - Fato Relevante - 26/10/26", "protocolo": "900001"},
    {"id": 2, "data_hora": "2026-10-27 09:00:00", "titulo": "VIBRA (VBBR-NM) - Dados Financeiros - Press-release - 27/10/26", "protocolo": "900002"},
    {"id": 3, "data_hora": "2026-10-27 09:10:00", "titulo": "VIBRA (VBBR-NM) - Dados Financeiros - Press-release - 27/10/26 (C)", "protocolo": "900002"},
    {"id": 4, "data_hora": "2026-10-27 10:00:00", "titulo": "VIBRA (VBBR-NM) - Aviso aos Acionistas - 27/10/26", "protocolo": "900003"},
    {"id": 5, "data_hora": "2026-10-20 10:00:00", "titulo": "VIBRA (VBBR-NM) - Outros Comunicados ao Mercado - 20/10/26", "protocolo": "900004"},
    {"id": 6, "data_hora": "2026-10-27 11:00:00", "titulo": "VIBRA (VBBR-NM) - Demonstracoes Financeiras - ITR de 30/09/26", "nsd": "170000"},
]
for x in noticias:
    x.update(plantao.classifica(x["titulo"]))
oficiais = [{"data_entrega": "2026-10-25", "link": "https://x/frmDownloadDocumento.aspx?numProtocolo=900003&numSequencia=1", "protocolo": "024295IPE..."}]
with tempfile.TemporaryDirectory() as t:
    os.makedirs(os.path.join(t, "data")); os.symlink(os.path.join(RAIZ, "pipeline"), os.path.join(t, "pipeline"))
    json.dump({"noticias": noticias}, open(os.path.join(t, "data", "plantao.json"), "w"))
    prov = ipe.provisorios(t, oficiais)
pr = sorted(d["protocolo"] for d in prov)
# 900001 entra; 900002 foi cancelado; 900003 já está na base aberta; 900004 é anterior à cobertura da base aberta; o ITR não é IPE
assert pr == ["RAD-900001"], pr; n += 1
d = prov[0]
assert d["categoria"] == "Fato Relevante" and d["provisorio"] and "numProtocolo=900001" in d["link"] and d["data_entrega"] == "2026-10-27", d; n += 1
assert ipe.num_protocolo(d["link"]) == "900001"; n += 1
print("TESTE PLANTÃO OK: %d conferências" % n)
