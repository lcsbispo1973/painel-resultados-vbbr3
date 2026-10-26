#!/usr/bin/env python3
"""Desempenho consolidado do ano no Relatório da Administração das DFPs da Vibra (texto em data/docs/vibra_df).

A seção "Desempenho Consolidado <ano>" (ou "Análise do desempenho financeiro de <ano>") explica as variações do ano com
os valores dos principais eventos (recuperações tributárias, provisões, alienações, perdas por impairment etc.).
É usada pelo MD&A redigido para contextualizar a comparação anual. Só texto da Companhia; nada é reescrito aqui.
Grava data/df_desempenho.json.
"""
import datetime as dt
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INICIO = re.compile(r"^\s*(?:DESEMPENHO CONSOLIDADO|Desempenho Consolidado|An[áa]lise do desempenho financeiro(?: de)?)\s+(20\d{2})\s*$", re.I)
FIM = re.compile(r"^\s*(?:DESEMPENHO DOS SEGMENTOS|Desempenho dos Segmentos|Desempenho por segmento|DESEMPENHO OPERACIONAL|"
                 r"Desempenho Operacional|Rede de Postos|GEST[ÃA]O DE PESSOAS|Governan[çc]a|Perspectivas|Agradecimentos)\b", re.I)
RUIDO = re.compile(r"^\s*(?:\d{1,3}|Relat[óo]rio da Administra[çc][ãa]o|P[úu]blica|Vibra Energia S\.?A\.?)\s*$", re.I)


def secao(texto):
    L = texto.split("\n")
    for i, l in enumerate(L):
        m = INICIO.match(l)
        if not m:
            continue
        linhas = []
        for l2 in L[i + 1:i + 160]:
            if FIM.match(l2) and linhas:
                break
            if RUIDO.match(l2):
                continue
            linhas.append(l2.rstrip())
        # parágrafos: linhas em branco separam; "(+)"/"(-)" e marcadores iniciam um novo item
        pars, buf = [], []
        for l2 in linhas + [""]:
            s = l2.strip()
            novo = re.match(r"^(\([+\-–]\)|•|-\s)", s)
            if (not s or novo) and buf:
                pars.append(re.sub(r"\s+", " ", " ".join(buf)).strip()); buf = []
            if s:
                buf.append(s)
        pars = [re.sub(r"(\w)- (\w)", r"\1\2", p) for p in pars if len(p) >= 60]
        return int(m.group(1)), pars
    return None, []


def main():
    pasta = os.path.join(RAIZ, "data", "docs", "vibra_df")
    idx = json.load(open(os.path.join(pasta, "indice.json"), encoding="utf-8"))["documentos"]
    out, log = {}, []
    for d in sorted(idx, key=lambda x: x["data_entrega"]):
        if not (d.get("data_referencia") or "").endswith("12-31"):
            continue
        caminho = os.path.join(pasta, d["arquivo"])
        if not os.path.exists(caminho):
            continue
        ano, pars = secao(open(caminho, encoding="utf-8").read())
        if not pars or ano != int(d["data_referencia"][:4]):
            log.append("%s: seção de desempenho consolidado não encontrada" % d["data_entrega"])
            continue
        out[str(ano)] = {"documento": d["assunto"] or d["tipo"], "data": d["data_entrega"], "link": d["link"], "paragrafos": pars}
    json.dump({"fonte": "Relatório da Administração das DFPs (CVM): desempenho consolidado do ano",
               "atualizado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "anos": out},
              open(os.path.join(RAIZ, "data", "df_desempenho.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("Desempenho consolidado lido para: %s" % ", ".join(sorted(out)))
    for l in log:
        print("- " + l)
    return 0


if __name__ == "__main__":
    sys.exit(main())
