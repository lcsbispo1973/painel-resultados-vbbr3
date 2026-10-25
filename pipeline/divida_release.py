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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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


RX_EN = re.compile(r"^\s*Net debt\s{2,}(.*)$", re.I)


def fim_trimestre(rot):
    """Rótulo de coluna do cabeçalho → trimestre do fim do período ('1S19' → '2T19'; '9M19' → '3T19'; '2019' → '4T19')."""
    if re.fullmatch(r"[1-4]T\d{2}", rot):
        return rot
    m = re.fullmatch(r"([12])S(\d{2})", rot)
    if m:
        return "%dT%s" % (int(m.group(1)) * 2, m.group(2))
    m = re.fullmatch(r"9M(\d{2})", rot)
    if m:
        return "3T" + m.group(1)
    m = re.fullmatch(r"20(\d{2})", rot)
    return "4T" + m.group(1) if m else None


def ler(texto, per):
    """Linha "Dívida Líquida" do release → {trimestre: valor}. As colunas são identificadas pelo cabeçalho da tabela
    (a ordem varia entre releases: atual, ano anterior, trimestre anterior — ou atual, trimestre anterior, ano anterior).
    Sem cabeçalho legível, só aceita a ordem padrão quando há os três valores."""
    from releases_ler import colunas
    L = texto.split("\n")
    for i, l in enumerate(L):
        m = RX_LINHA.match(l)
        if not m:
            continue
        toks = RX_TOK.findall(m.group(1))
        vals = [v for v in (num(t) for t in toks) if v is not None]
        if not vals:
            return None
        cols = [fim_trimestre(c) for c in colunas(L, i)]
        if cols and cols[0] == per and None not in cols[:len(vals)] and len(cols) >= len(vals):
            return dict(zip(cols, vals))
        if len(vals) >= 3:
            return {per: vals[0], desloca(per, -4): vals[1], desloca(per, -1): vals[2]}
        return {per: vals[0]}
    return None


def ler_en(texto):
    """Linha "Net debt" da versão em inglês (separador de milhar com vírgula ou ponto): primeiros três valores."""
    for l in texto.split("\n"):
        m = RX_EN.match(l)
        if m:
            vals = []
            for t in re.findall(r"\(?-?\d[\d.,]*\)?%?", m.group(1)):
                if t.endswith("%"):
                    continue
                neg = t.startswith("(") or t.startswith("-")
                t = t.strip("()-")
                if re.fullmatch(r"\d{1,3}([.,]\d{3})+|\d{1,3}", t):
                    vals.append((-1 if neg else 1) * float(re.sub(r"[.,]", "", t)))
            return vals[:3]
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
    proprio, comp, textos_en = {}, {}, []
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
        v = ler(t, per)
        fonte = {"data": r["data_entrega"], "documento": r["assunto"], "link": r["link"]}
        textos_en.append((per, ler_en(t), fonte))
        if not v or v.get(per) is None:
            log.append("- %s (%s): linha de dívida líquida não lida" % (per, r["data_entrega"]))
            continue
        proprio[per] = {"v": v[per], "alav_divulgada": ler_alav(t), "fonte": fonte}   # reapresentação do mesmo trimestre: vale a última
        for q, x in v.items():
            if q != per:
                comp.setdefault(q, []).append((x, fonte))
    # versão em inglês: só para trimestres sem nenhum valor em português. A coluna é deduzida pelos valores já conhecidos:
    # o 1º valor tem de ser o do próprio trimestre e um dos outros dois tem de bater com um trimestre já conhecido
    # (ano anterior ou trimestre anterior); o valor restante fica com o outro trimestre.
    for per, en, fonte in textos_en:
        conhecido = lambda q: proprio[q]["v"] if q in proprio else (sorted(comp[q], key=lambda x: x[1]["data"])[0][0] if q in comp else None)
        if not en or len(en) < 3 or conhecido(per) is None or abs(en[0] - conhecido(per)) > 1:
            continue
        a, b = desloca(per, -4), desloca(per, -1)
        for x, y in ((en[1], en[2]), (en[2], en[1])):
            if conhecido(b) is not None and abs(x - conhecido(b)) <= 1 and conhecido(a) is None:
                comp.setdefault(a, []).append((y, dict(fonte, como="comparativo (versão em inglês do release)")))
                break
            if conhecido(a) is not None and abs(x - conhecido(a)) <= 1 and conhecido(b) is None:
                comp.setdefault(b, []).append((y, dict(fonte, como="comparativo (versão em inglês do release)")))
                break
    serie = dict(proprio)
    for per, lst in comp.items():
        if per not in serie:
            v, f = sorted(lst, key=lambda x: x[1]["data"])[0]
            serie[per] = {"v": v, "alav_divulgada": None, "fonte": dict(f, como=f.get("como", "comparativo"))}
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
