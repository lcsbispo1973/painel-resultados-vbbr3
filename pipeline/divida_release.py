"""Dívida líquida e alavancagem conforme divulgadas pela Vibra nos releases de resultados.

A dívida líquida da Companhia não é uma conta das demonstrações: soma swaps e desconta, além do caixa, o caixa restrito
e títulos (e, a partir de 2025, considera as cartas de crédito). Para o painel bater com o número que a Companhia
divulga, a dívida líquida e a alavancagem usam esta série; o cálculo pelo balanço continua disponível à parte.

Fonte por trimestre: o release do próprio trimestre (linha "Dívida Líquida", 1ª coluna). Na falta dela, o comparativo
do release seguinte (coluna do trimestre anterior) ou do mesmo trimestre do ano seguinte. Diferenças entre o valor
original e os comparativos posteriores ficam no log.

Saída: data/divida_release.json · log: logs/divida-release.md
"""
import datetime as dt
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(RAIZ, "data", "releases")
RX_LINHA = re.compile(r"^\s*D[íi]vida L[íi]quida\s{2,}(.*)$")
RX_ALAV = re.compile(r"^\s*D[íi]vida L[íi]quida\s*/\s*EBITDA[^\d\n]*?\(x\)\s{2,}(.*)$", re.I)
RX_TOK = re.compile(r"\(?-?[\d\.]+(?:,\d+)?\)?%?x?¹?")


def periodo(data_entrega):
    """Trimestre do release: o último trimestre encerrado antes da entrega (a data de referência do IPE nem sempre é o fim do trimestre)."""
    d = dt.date.fromisoformat(data_entrega)
    q = (d.month - 1) // 3          # trimestres completos no ano até a entrega
    return "4T%02d" % ((d.year - 1) % 100) if q == 0 else "%dT%02d" % (q, d.year % 100)


def desloca(p, k):
    n = int(p[2:]) * 4 + int(p[0]) - 1 + k
    return "%dT%02d" % (n % 4 + 1, n // 4)


def num(tok):
    t = tok.rstrip("¹x")
    if t.endswith("%"):
        return None
    neg = t.startswith("(") or t.startswith("-")
    t = t.strip("()-")
    if not re.fullmatch(r"\d{1,3}(\.\d{3})*", t):
        return None
    v = float(t.replace(".", ""))
    return -v if neg else v


def ler(texto):
    for l in texto.split("\n"):
        m = RX_LINHA.match(l)
        if m:
            toks = RX_TOK.findall(m.group(1))
            if not toks or toks[0].endswith("%"):
                return None
            vals = [num(t) for t in toks]
            cur = vals[0]
            yoy = vals[1] if len(vals) > 1 else None
            prev = vals[3] if len(vals) > 3 else None
            return {"cur": cur, "yoy": yoy, "prev": prev}
    return None


def ler_alav(texto):
    for l in texto.split("\n"):
        m = RX_ALAV.match(l)
        if m:
            t = m.group(1).split()[0].rstrip("¹x").replace(",", ".")
            try:
                return float(t)
            except ValueError:
                return None
    return None


def main():
    idx = json.load(open(os.path.join(PASTA, "indice.json"), encoding="utf-8"))["releases"]
    log = ["# Dívida líquida divulgada nos releases", "", "Executado em %s UTC" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), ""]
    proprio, comp = {}, {}
    for r in sorted(idx, key=lambda x: x["data_entrega"]):
        p = os.path.join(PASTA, "texto", r["arquivo"])
        if not os.path.exists(p):
            continue
        per = periodo(r["data_entrega"])
        m = re.search(r"\b([1-4])\s?T\s?(?:20)?(\d{2})\b", r.get("assunto") or "")
        if m and "%sT%s" % m.groups() != per:
            log.append("- %s: assunto indica %sT%s, entrega indica %s; ignorado" % (r["data_entrega"], m.group(1), m.group(2), per))
            continue
        t = open(p, encoding="utf-8").read()
        v = ler(t)
        if not v or v["cur"] is None:
            log.append("- %s (%s): linha de dívida líquida não lida" % (per, r["data_entrega"]))
            continue
        fonte = {"data": r["data_entrega"], "documento": r["assunto"], "link": r["link"]}
        proprio[per] = {"v": v["cur"], "alav_divulgada": ler_alav(t), "fonte": fonte}   # reapresentação do mesmo trimestre: vale a última
        if v["prev"] is not None:
            comp.setdefault(desloca(per, -1), []).append((v["prev"], fonte))
        if v["yoy"] is not None:
            comp.setdefault(desloca(per, -4), []).append((v["yoy"], fonte))
    serie = dict(proprio)
    for per, lst in comp.items():
        if per not in serie:
            v, f = sorted(lst, key=lambda x: x[1]["data"])[0]
            serie[per] = {"v": v, "alav_divulgada": None, "fonte": dict(f, como="comparativo")}
            log.append("- %s: sem linha no release do trimestre; usado o comparativo do release de %s (%s)" % (per, f["data"], v))
        else:
            for v, f in lst:
                if abs(v - serie[per]["v"]) > 1:
                    log.append("- %s: release original %s; comparativo no release de %s = %s (reapresentação)" % (per, serie[per]["v"], f["data"], v))
    per_ord = sorted(serie, key=lambda p: (int(p[2:]), int(p[0])))
    out = {"fonte": "Releases de resultados da Vibra (IPE da CVM), linha Dívida Líquida", "unidade": "R$ milhões",
           "atualizado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "periodos": per_ord,
           "series": {p: serie[p] for p in per_ord}}
    json.dump(out, open(os.path.join(RAIZ, "data", "divida_release.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log.append("")
    log.append("%d trimestres: %s a %s" % (len(per_ord), per_ord[0] if per_ord else "-", per_ord[-1] if per_ord else "-"))
    os.makedirs(os.path.join(RAIZ, "logs"), exist_ok=True)
    open(os.path.join(RAIZ, "logs", "divida-release.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))
    return 0


if __name__ == "__main__":
    sys.exit(main())
