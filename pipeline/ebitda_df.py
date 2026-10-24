#!/usr/bin/env python3
"""EBITDA Ajustado por segmento a partir da nota de informações por segmento das ITRs/DFPs da Vibra.

Fonte principal: tabelas "Demonstração Consolidada do Resultado por Área de Negócio" das demonstrações financeiras
arquivadas na CVM (texto em data/docs/vibra_df). A Companhia passou a apresentar o EBITDA Ajustado nessa nota em 2023
(com comparativos de 2022); para os trimestres anteriores, a série usa o release de resultados e marca a fonte.

Regras:
  - valor do trimestre = tabela "Trimestre atual" da ITR do próprio trimestre; 1T = acumulado de março;
    4T = acumulado de dezembro (DFP) − acumulado de setembro (ITR do 3T);
  - sem a DF do próprio período, usa o comparativo publicado na DF seguinte (marcado como comparativo);
  - portão de qualidade: em cada tabela, segmentos somam o total dos segmentos e total + corporativo = consolidado;
    tabela que não fecha é descartada e registrada no log;
  - comparativos posteriores diferentes do valor original ficam registrados como reapresentação.
Grava data/ebitda_ajustado.json e logs/ebitda-ajustado.md.
"""
import datetime as dt
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
from releases_ler import rotulo_e_inicio, valores, ord_t, lab  # noqa: E402

MESES = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6, "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
         "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
         "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}
MAPAS = {  # quantidade de valores na linha → colunas
    6: ["REDE", "B2B", "REN", "SEG", "CORP", "CONS"],
    5: ["REDE", "B2B", "SEG", "CORP", "CONS"],
}


def periodo_do_titulo(t):
    """('T', '2T26') para tabela trimestral; ('A', 2026, 6) para acumulado até o mês; None se não reconhecer."""
    m = re.search(r"\((\d{2})\.(\d{2})\.(\d{4}) a (\d{2})\.(\d{2})\.(\d{4})\)", t)
    if m:
        m1, m2, ano = int(m.group(2)), int(m.group(5)), int(m.group(6))
        if m2 - m1 == 2 and m2 % 3 == 0:
            return ("T", "%dT%02d" % (m2 // 3, ano % 100))
        if m1 == 1:
            return ("A", ano, m2)
        return None
    m = re.search(r"[–-]\s*([a-zç]+)\s*(?:/|de)\s*(\d{2,4})\s*$", t.strip(), re.I)
    if m and m.group(1).lower() in MESES:
        ano = int(m.group(2)); ano = ano + 2000 if ano < 100 else ano
        return ("A", ano, MESES[m.group(1).lower()])
    return None


def ler_df(texto):
    """Tabelas de EBITDA Ajustado por segmento encontradas no texto: lista de (periodo, valores por coluna)."""
    L = texto.split("\n")
    out, rejeitadas = [], []
    for i, l in enumerate(L):
        rot, ini = rotulo_e_inicio(l)
        if not rot or rot.lower() != "ebitda ajustado":
            continue
        vs = valores(l, ini, False)
        if len(vs) < 3:
            continue
        tit = next((L[j] for j in range(i - 1, max(-1, i - 45), -1) if re.search(r"rea de neg", L[j], re.I)), None)
        per = periodo_do_titulo(tit) if tit else None
        if not per:
            rejeitadas.append("título não reconhecido: %r" % (tit or "")[:90]); continue
        mapa = MAPAS.get(len(vs))
        if not mapa:
            rejeitadas.append("%s: %d valores na linha" % (per, len(vs))); continue
        d = dict(zip(mapa, vs))
        segs = d["REDE"] + d["B2B"] + d.get("REN", 0)
        if abs(segs + d["CORP"] - d["CONS"]) > 1.5:
            rejeitadas.append("%s: tabela não fecha (%s)" % (per, d)); continue
        if abs(segs - d["SEG"]) > 1.5 or abs(d["SEG"] + d["CORP"] - d["CONS"]) > 1.5:
            # segmentos + corporativo fecham com o consolidado, mas o "Total dos segmentos" publicado não: inconsistência
            # de digitação no documento; usa a soma dos segmentos e registra
            rejeitadas.append("%s: 'Total dos segmentos' publicado %s ≠ soma dos segmentos %s (segmentos + corporativo = consolidado %s); usada a soma" % (per, d["SEG"], segs, d["CONS"]))
            d["SEG"] = segs
        if (per, tuple(sorted(d.items()))) not in [(o[0], tuple(sorted(o[1].items()))) for o in out]:
            out.append((per, d))
    return out, rejeitadas


def ref_do_doc(tabelas):
    """Período de referência do documento = o acumulado mais recente encontrado."""
    acs = [(p[1], p[2]) for p, _ in tabelas if p[0] == "A"]
    if not acs:
        return None
    ano, mes = max(acs)
    return "%dT%02d" % (mes // 3, ano % 100)


def main():
    pasta = os.path.join(RAIZ, "data", "docs", "vibra_df")
    idx = json.load(open(os.path.join(pasta, "indice.json"), encoding="utf-8"))["documentos"]
    log = ["# EBITDA Ajustado (nota de segmentos das DFs) — última execução", "",
           "Executado em %s UTC" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), ""]
    proprio, comparativo = {}, {}   # período → {chave: (valores, fonte)}
    for d in sorted(idx, key=lambda x: x["data_entrega"]):
        caminho = os.path.join(pasta, d["arquivo"])
        if not os.path.exists(caminho):
            continue
        tabs, rej = ler_df(open(caminho, encoding="utf-8").read())
        for r in rej:
            log.append("- %s %s: %s" % (d["data_entrega"], d["assunto"][:40], r))
        if not tabs:
            continue
        ref = ref_do_doc(tabs)
        fonte = {"tipo": "DFP" if ref and ref[0] == "4" else "ITR", "data": d["data_entrega"], "documento": d["assunto"] or d["tipo"], "link": d["link"], "referencia": ref}
        for per, vals in tabs:
            chave = per[1] if per[0] == "T" else "A%d-%02d" % (per[1], per[2])
            fim = per[1] if per[0] == "T" else "%dT%02d" % (per[2] // 3, per[1] % 100)
            alvo = proprio if fim == ref else comparativo
            if alvo is proprio:
                proprio.setdefault(chave, (vals, fonte))   # primeira publicação do próprio período
            comparativo.setdefault(chave, []).append((vals, fonte))
    # trimestres
    def acum(ano, mes, fonte_pref):
        k = "A%d-%02d" % (ano, mes)
        if k in proprio:
            return proprio[k][0], proprio[k][1], "próprio"
        if k in comparativo:
            v, f = comparativo[k][0]
            return v, f, "comparativo"
        return None, None, None

    series, origem = {}, {}
    periodos_df = set()
    for k in list(proprio) + list(comparativo):
        if k.startswith("A"):
            ano, mes = int(k[1:5]), int(k[6:8])
            periodos_df.add("%dT%02d" % (mes // 3, ano % 100))
        else:
            periodos_df.add(k)
    for p in sorted(periodos_df, key=ord_t):
        q, ano = int(p[0]), 2000 + int(p[2:])
        vals, fonte, como = None, None, None
        if p in proprio:
            vals, fonte = proprio[p]; como = "trimestre (ITR do período)"
        elif q == 1:
            vals, fonte, tipo = acum(ano, 3, None); como = "acumulado de março" + ("" if tipo == "próprio" else " (comparativo)") if vals else None
        else:
            a1, f1, t1 = acum(ano, q * 3, None)
            a0, f0, t0 = acum(ano, q * 3 - 3, None)
            if a1 and a0:
                vals = {c: a1[c] - a0.get(c, 0) for c in a1 if c in a0 or c in ("REN",)}
                fonte = f1
                como = "acumulado até %02d/%d − acumulado até %02d/%d%s" % (q * 3, ano, q * 3 - 3, ano, "" if t1 == t0 == "próprio" else " (inclui comparativo)")
            elif p in comparativo:
                vals, fonte = comparativo[p][0]; como = "trimestre (comparativo em DF posterior)"
        if not vals:
            continue
        series[p] = {c: {"v": round(v, 1), "fonte": dict(fonte, como=como)} for c, v in vals.items()}
    # reapresentações: comparativos posteriores do mesmo trimestre
    reap = []
    for p, segs in series.items():
        for v_, f_ in comparativo.get(p, []):
            if f_["referencia"] != p and abs(v_["CONS"] - segs["CONS"]["v"]) > 1:
                reap.append("%s: %s na DF do período; %s na DF de %s" % (p, segs["CONS"]["v"], v_["CONS"], f_["data"]))
                segs["CONS"].setdefault("reapresentado", []).append({"valor": v_["CONS"], "data": f_["data"]})
    # trimestres anteriores à nota (release como fonte, marcado)
    rel = json.load(open(os.path.join(RAIZ, "data", "release_operacional.json"), encoding="utf-8"))
    usados_release = []
    for p in rel["periodos"]:
        if p in series or ord_t(p) < ord_t("4T17"):
            continue
        s = rel["series"][p]
        cons = s.get("CONS", {}).get("ebitda")
        if not cons:
            continue
        series[p] = {"CONS": {"v": cons["v"], "fonte": {"tipo": "release", "data": cons["fonte"]["data"], "documento": cons["fonte"]["assunto"], "link": cons["fonte"]["link"],
                                                         "como": "release (a nota de segmentos das DFs não apresentava o EBITDA Ajustado neste período)"}}}
        for seg in ("REDE", "B2B", "GC", "AVI", "OUT", "REN"):
            x = s.get(seg, {}).get("ebitda")
            if x:
                series[p][seg] = {"v": x["v"], "fonte": series[p]["CONS"]["fonte"]}
        usados_release.append(p)
    pers = sorted(series, key=ord_t)
    # conferência com o release (informativa)
    difs = []
    for p in pers:
        x = series[p]["CONS"]
        if x["fonte"]["tipo"] == "release":
            continue
        r = rel["series"].get(p, {}).get("CONS", {}).get("ebitda")
        if r and abs(r["v"] - x["v"]) > 1:
            difs.append("%s: DF %s × release %s" % (p, x["v"], r["v"]))
    doc = {"fonte": "Nota de informações por segmento das ITRs/DFPs (CVM); release apenas onde a nota não apresentava o EBITDA Ajustado",
           "atualizado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "segmentos": {"CONS": "Consolidado", "REDE": "Rede de Postos", "B2B": "B2B", "REN": "Renováveis", "SEG": "Total dos segmentos",
                         "CORP": "Corporativo", "GC": "Grandes Consumidores", "AVI": "Aviação", "OUT": "Outros negócios"},
           "periodos": pers, "series": {p: series[p] for p in pers}}
    json.dump(doc, open(os.path.join(RAIZ, "data", "ebitda_ajustado.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    log += ["", "Trimestres: %d (%s a %s); da nota das DFs: %d; do release: %d (%s)" % (
        len(pers), pers[0], pers[-1], len(pers) - len(usados_release), len(usados_release), ", ".join(usados_release[:3] + ["…"] + usados_release[-2:]) if usados_release else "-"), ""]
    log += ["## DF × release (EBITDA Ajustado consolidado)", ""] + (["- " + x for x in difs] or ["- sem diferenças"])
    log += ["", "## Reapresentações em DFs posteriores", ""] + (["- " + x for x in reap] or ["- nenhuma"])
    open(os.path.join(RAIZ, "logs", "ebitda-ajustado.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))
    return 0


if __name__ == "__main__":
    sys.exit(main())
