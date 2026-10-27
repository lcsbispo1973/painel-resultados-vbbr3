#!/usr/bin/env python3
"""Auditoria independente dos cálculos do painel (Python, sem usar o motor JavaScript do painel).

1. Arquivos brutos da CVM × séries do painel: para cada conta, a soma dos trimestres do painel tem de igualar o acumulado
   que a Companhia arquivou (ITR de jun e set; DFP de dez), e o balanço do painel tem de igualar o saldo arquivado.
2. MD&A — números: cada valor de data/mda_fatos.json é recalculado aqui a partir das séries (demonstrações, EBITDA
   Ajustado, volumes e dívida líquida), e cada texto formatado (R$, %, p.p., x, dias, m³) é refeito e comparado.
3. MD&A — textos aprovados: todo número citado tem de existir entre os números fornecidos; e cada valor em R$ que
   corresponde a um único fato tem de aparecer numa frase que fale daquele assunto (pega número trocado de linha).
Saída: logs/auditoria.md e data/auditoria.json. Sai com código 1 se houver divergência (trava de publicação).
"""
import csv
import datetime as dt
import glob
import json
import os
import re
import sys
from decimal import Decimal, ROUND_HALF_UP

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(RAIZ, "data")


def ler(n):
    return json.load(open(os.path.join(D, n), encoding="utf-8"))


def ordem(p):
    return int(p[2:]) * 4 + int(p[0])


def lab(n):
    a, q = divmod(n - 1, 4)
    return "%dT%02d" % (q + 1, a)


def ok(v):
    return isinstance(v, (int, float)) and v == v


# ---------------------------------------------------------------- séries do painel
def larga(nome):
    j = ler(nome)
    s = {}
    for l in j["linhas"]:
        s[l["cd_conta"]] = {p: l.get(p) for p in j["periodos"]}
        for a in j.get("anuais", []):
            s[l["cd_conta"]]["AN" + a] = l.get("AN" + a)
    return s, j["periodos"], j.get("anuais", [])


DRE, PDRE, ANDRE = larga("cvm_dre.json")
DFC, PDFC, ANDFC = larga("cvm_fluxo_caixa.json")
DVA, PDVA, _ = larga("cvm_dva.json")
BP, PBP, _ = larga("cvm_balanco.json")
SER = {"dre": (DRE, PDRE), "dfc": (DFC, PDFC), "dva": (DVA, PDVA)}
AJ = ler("ebitda_ajustado.json")
OPER = ler("release_operacional.json")
DLREL = ler("divida_release.json")["series"]


def n_trim(base, p):
    return {"T": 1, "S": 2, "9M": 3, "AN": 4, "LTM": 4}[base]


def fluxo(ds, cd, p, base):
    s, per = SER[ds]
    k = n_trim(base, p)
    if base == "AN" or (base == "LTM" and p[0] == "4"):
        an = "AN20" + p[2:]
        if p not in per and an in s.get(cd, {}):   # exercício só anual (2015)
            v = s[cd].get(an)
            return v if ok(v) else None
    anc = {"dre": "3.01", "dfc": "6.01", "dva": "7.01"}[ds]
    tot, algum = 0.0, False
    for i in range(ordem(p) - k + 1, ordem(p) + 1):
        q = lab(i)
        if q not in per or not ok(s.get(anc, {}).get(q)):
            return None
        v = s.get(cd, {}).get(q)
        if ok(v):
            tot += v; algum = True
    return tot if algum else None


def saldo(cd, p):
    v = BP.get(cd, {}).get(p)
    return v if ok(v) else None


def ebitda_aj(seg, p, base):
    k = n_trim(base, p)
    tot = 0.0
    for i in range(ordem(p) - k + 1, ordem(p) + 1):
        x = AJ["series"].get(lab(i), {}).get(seg)
        if not x or not ok(x.get("v")):
            if k == 4 and p[0] == "4":
                ex = (AJ.get("exercicios") or {}).get("20" + p[2:], {}).get(seg)
                return ex["v"] if ex else None
            return None
        tot += x["v"]
    return tot


def volume(seg, p, base):
    k = n_trim(base, p)
    ex = None
    if k == 4 and p[0] == "4":
        e = (OPER.get("exercicios") or {}).get("20" + p[2:], {}).get(seg, {}).get("vol")
        ex = e["v"] if e else None
    tot, comp = 0.0, False
    for i in range(ordem(p) - k + 1, ordem(p) + 1):
        q = OPER["series"].get(lab(i))
        x = q and ((q.get("CONS", {}).get("vol") or q.get("DIST", {}).get("vol")) if seg == "CONS" else q.get(seg, {}).get("vol"))
        if not x or not ok(x.get("v")):
            return ex
        tot += x["v"]; comp = comp or "comparativo" in (x.get("fonte", {}).get("como") or "")
    if ex is not None and (comp or abs(tot - ex) <= max(3, abs(ex) * 0.0002)):
        return ex
    return tot


def dliq(p):
    r = DLREL.get(p)
    if r and ok(r.get("v")):
        return r["v"]
    prim = min(DLREL, key=ordem)
    if ordem(p) < ordem(prim):
        return None
    db = (saldo("2.01.04", p) or 0) + (saldo("2.02.01", p) or 0)
    cx = (saldo("1.01.01", p) or 0) + (saldo("1.01.02", p) or 0)
    return db - cx


def div(a, b):
    return a / b if ok(a) and ok(b) and b else None


def plc(p):
    v = saldo("2.03", p)
    return v - (saldo("2.03.09", p) or 0) if ok(v) else None


def desloca(p, k):
    return lab(ordem(p) - k)


def fato(fid, p, base):
    f = lambda cd: fluxo("dre", cd, p, base)  # noqa: E731
    if fid == "receita": return f("3.01")
    if fid == "lbruto": return f("3.03")
    if fid == "mbruta": v = div(f("3.03"), f("3.01")); return v * 100 if v is not None else None
    if fid == "dvendas": return f("3.04.01")
    if fid == "dga": return f("3.04.02")
    if fid == "outras":
        t, v, g = f("3.04"), f("3.04.01"), f("3.04.02")
        return t - v - g if ok(t) and ok(v) and ok(g) else None
    if fid == "ebitda": return ebitda_aj("CONS", p, base)
    if fid == "mebitda": v = div(ebitda_aj("CONS", p, base), f("3.01")); return v * 100 if v is not None else None
    if fid == "rfin": return f("3.06")
    if fid == "ir": return f("3.08")
    if fid == "aliq":
        lair = f("3.07")
        return -f("3.08") / lair * 100 if ok(lair) and lair > 0 and ok(f("3.08")) else None
    if fid == "lucro": return f("3.11")
    if fid == "lucroc": return f("3.11.01")
    if fid == "mliq": v = div(f("3.11"), f("3.01")); return v * 100 if v is not None else None
    if fid == "vol": return volume("CONS", p, base)
    if fid == "vol_rede": return volume("REDE", p, base)
    if fid == "vol_b2b": return volume("B2B", p, base)
    if fid in ("aj_rede", "aj_b2b", "aj_ren", "aj_corp"): return ebitda_aj({"aj_rede": "REDE", "aj_b2b": "B2B", "aj_ren": "REN", "aj_corp": "CORP"}[fid], p, base)
    if fid in ("m3", "m3_rede", "m3_b2b"):
        seg = {"m3": "CONS", "m3_rede": "REDE", "m3_b2b": "B2B"}[fid]
        e, v = ebitda_aj(seg, p, base), volume(seg, p, base)
        if seg == "CONS" and ok(e):
            r = ebitda_aj("REN", p, base)
            if r is not None:
                e -= r
        return e / v * 1000 if ok(e) and v else None
    if fid == "dbruta": a, b = saldo("2.01.04", p), saldo("2.02.01", p); return a + b if ok(a) and ok(b) else (a if ok(a) else b)
    if fid == "caixa": a = saldo("1.01.01", p); return a + (saldo("1.01.02", p) or 0) if ok(a) else None
    if fid == "dliq": return dliq(p)
    if fid == "alav":
        e = ebitda_aj("CONS", p, "LTM"); d = dliq(p)
        return d / e if ok(e) and e > 0 and ok(d) else None
    if fid == "pl": return saldo("2.03", p)
    rec, cus = fluxo("dre", "3.01", p, "LTM"), fluxo("dre", "3.02", p, "LTM")
    pmr = div(saldo("1.01.03", p), rec); pmr = pmr * 365 if pmr is not None else None
    pme = div(saldo("1.01.04", p), -cus if ok(cus) else None); pme = pme * 365 if pme is not None else None
    pmp = div(saldo("2.01.02", p), -cus if ok(cus) else None); pmp = pmp * 365 if pmp is not None else None
    if fid == "pmr": return pmr
    if fid == "pme": return pme
    if fid == "pmp": return pmp
    if fid == "ciclo": return pmr + pme - pmp if None not in (pmr, pme, pmp) else None
    g = lambda cd: fluxo("dfc", cd, p, base)  # noqa: E731
    if fid == "fco": return g("6.01")
    if fid == "capex": return g("6.02.01")
    if fid == "fcl": a, b = g("6.01"), g("6.02.01"); return a + b if ok(a) and ok(b) else None
    if fid == "prov": v = g("6.03.05"); return -v if ok(v) else None
    if fid == "conv":
        e = ebitda_aj("CONS", p, base)
        return g("6.01") / e * 100 if ok(e) and e > 0 and ok(g("6.01")) else None
    if fid == "roe":
        l12 = fluxo("dre", "3.11.01", p, "LTM"); a, b = plc(p), plc(desloca(p, 4))
        return l12 / ((a + b) / 2) * 100 if ok(l12) and ok(a) and ok(b) else None
    raise KeyError(fid)


# ---------------------------------------------------------------- formatação (refeita aqui)
def arred(v, c):
    q = Decimal(1).scaleb(-c)
    return Decimal(v).quantize(q, rounding=ROUND_HALF_UP)   # Decimal(float) exato = mesmo critério do toFixed do JavaScript


def dec(v, c):
    s = format(abs(arred(v, c)), "f")
    inteiro, _, frac = s.partition(".")
    inteiro = "{:,}".format(int(inteiro)).replace(",", ".")
    return inteiro + ("," + frac if c else "")


def sinal(v):
    return "−" if v < 0 else ""


FMT = {
    "mi": lambda v: sinal(v) + "R$ " + dec(v, 0) + " milhões",
    "bi": lambda v: sinal(v) + "R$ " + dec(v / 1000, 1) + (" bilhão" if abs(v) < 1950 else " bilhões"),
    "pct": lambda v: ("−" if v < 0 else "") + dec(v, 1) + "%",
    "x": lambda v: dec(v, 2) + "x",
    "m3": lambda v: "R$ " + dec(v, 0) + "/m³",
    "vol": lambda v: dec(v, 0) + " mil m³",
    "dias": lambda v: dec(v, 1) + " dias",
}
UN = {"receita": "mi", "lbruto": "mi", "mbruta": "pct", "dvendas": "mi", "dga": "mi", "outras": "mi", "ebitda": "mi", "mebitda": "pct", "rfin": "mi",
      "ir": "mi", "aliq": "pct", "lucro": "mi", "lucroc": "mi", "mliq": "pct", "vol": "vol", "vol_rede": "vol", "vol_b2b": "vol", "aj_rede": "mi",
      "aj_b2b": "mi", "aj_ren": "mi", "aj_corp": "mi", "m3": "m3", "m3_rede": "m3", "m3_b2b": "m3", "dbruta": "mi", "caixa": "mi", "dliq": "mi",
      "alav": "x", "pl": "mi", "pmr": "dias", "pme": "dias", "pmp": "dias", "ciclo": "dias", "fco": "mi", "capex": "mi", "fcl": "mi", "prov": "mi",
      "conv": "pct", "roe": "pct"}
VAR = {k: ("pp" if UN[k] == "pct" else "xx" if UN[k] == "x" else "abs" if UN[k] == "dias" else "pct") for k in UN}


def textos(un, v):
    if un == "mi":
        return [FMT["mi"](v), FMT["bi"](v)] if abs(v) >= 1000 else [FMT["mi"](v)]
    return [FMT[un](v)]


def texto_var(tipo, va, vb):
    if not ok(va) or not ok(vb):
        return None
    if tipo == "pct":
        if vb == 0 or (va < 0) != (vb < 0):
            return None
        p = (va / vb - 1) * 100
        return ("+" if p >= 0 else "−") + dec(p, 1) + "%"
    d = va - vb
    if tipo == "pp":
        return ("+" if d >= 0 else "−") + dec(d, 1) + " p.p."
    if tipo == "xx":
        return ("+" if d >= 0 else "−") + dec(d, 2) + "x"
    return ("+" if d >= 0 else "−") + dec(d, 1) + " dias"


# ---------------------------------------------------------------- 1. brutos da CVM × séries
def bruto_cvm():
    linhas, rad = {}, {}
    for f in glob.glob(os.path.join(D, "cvm_raw", "*.csv")):
        nome = os.path.basename(f)
        if "_ACOES_" in nome:
            continue
        for r in csv.DictReader(open(f, encoding="utf-8")):
            (rad if nome.startswith("RAD_") else linhas).setdefault((r["demo"], r["DT_REFER"]), []).append(r)
    for k, rs in rad.items():   # mesma regra do pipeline: o RAD só vale com versão mais nova que a da base aberta
        if max(int(r["VERSAO"] or 0) for r in rs) > max((int(r["VERSAO"] or 0) for r in linhas.get(k, [])), default=0):
            linhas.setdefault(k, []).extend(rs)
    res = []
    for (demo, ref), rs in linhas.items():
        vmax = max(int(r["VERSAO"] or 0) for r in rs)
        for r in rs:
            if int(r["VERSAO"] or 0) != vmax or "PEN" in r["ORDEM_EXERC"].upper() or (r.get("COLUNA_DF") or "").strip():
                continue
            esc = 1e3 if r["ESCALA_MOEDA"].strip().upper() == "MIL" else 1.0
            res.append((demo, r["DT_INI_EXERC"].strip(), r["DT_FIM_EXERC"].strip(), r["CD_CONTA"].strip(), float(r["VL_CONTA"]) * esc / 1e6))
    return res


def rad_x_aberta():
    """Documento lido direto do RAD × o mesmo documento na base aberta (quando os dois existem): têm de ser idênticos."""
    erros, n = [], 0
    ab = {}
    for f in glob.glob(os.path.join(D, "cvm_raw", "*.csv")):
        if os.path.basename(f).startswith("RAD_") or "_ACOES_" in f:
            continue
        for r in csv.DictReader(open(f, encoding="utf-8")):
            ab[(r["tipo"], r["demo"], r["DT_REFER"], r["VERSAO"], r["ORDEM_EXERC"], r["DT_INI_EXERC"], r["DT_FIM_EXERC"], r["CD_CONTA"], r.get("COLUNA_DF") or "")] = r["VL_CONTA"]
    for f in glob.glob(os.path.join(D, "cvm_raw", "RAD_*.csv")):
        if "_ACOES_" in f:
            continue
        for r in csv.DictReader(open(f, encoding="utf-8")):
            k = (r["tipo"], r["demo"], r["DT_REFER"], r["VERSAO"], r["ORDEM_EXERC"], r["DT_INI_EXERC"], r["DT_FIM_EXERC"], r["CD_CONTA"], r.get("COLUNA_DF") or "")
            if k not in ab:
                continue
            n += 1
            if abs(float(ab[k]) - float(r["VL_CONTA"])) > 1e-6:
                erros.append("RAD × base aberta %s %s %s %s %s: %s × %s" % (k[0], k[1], k[2], k[7], k[8], r["VL_CONTA"], ab[k]))
    return n, erros


def rotulo_data(d):
    y, m = int(d[:4]), int(d[5:7])
    return "%dT%02d" % ((m - 1) // 3 + 1, y % 100)


def parte1():
    erros, n = [], 0
    for demo, ini, fim, cd, v in bruto_cvm():
        if cd.startswith("3.99"):
            continue
        p = rotulo_data(fim)
        if demo in ("BPA", "BPP"):
            s = saldo(cd, p)
            if s is None:
                continue
            n += 1
            if abs(s - v) > 0.6:
                erros.append("balanço %s %s: painel %s × CVM %s" % (p, cd, s, round(v, 3)))
            continue
        ds = {"DRE": "dre", "DFC": "dfc", "DVA": "dva"}.get(demo)
        if not ds or not ini:
            continue
        if cd in ("6.05.01", "6.05.02"):
            continue   # saldos inicial e final de caixa não se somam
        if ini[5:] != "01-01":
            continue   # só acumulados do ano (os trimestrais avulsos são a própria série)
        meses = int(fim[5:7])
        if meses not in (6, 9, 12):
            continue
        base = {6: "S", 9: "9M", 12: "AN"}[meses]
        if base == "9M" and p[0] != "3":
            continue
        s = fluxo(ds, cd, p, base) if base != "9M" else fluxo(ds, cd, p, "9M")
        if s is None:
            continue
        n += 1
        if abs(s - v) > 1.0:
            erros.append("%s %s %s (acumulado até %s): soma dos trimestres do painel %s × CVM %s" % (ds, cd, p, fim, round(s, 3), round(v, 3)))
    return n, erros


# ---------------------------------------------------------------- 2. fatos do MD&A
def parte2():
    fatos = ler("mda_fatos.json")["pares"]
    erros, n = [], 0
    for k, par in fatos.items():
        A, B = par["A"], par["B"]
        for f in par["fatos"]:
            fid = f["id"]
            va, vb = fato(fid, A["p"], A["base"]), fato(fid, B["p"], B["base"])
            n += 1
            for lado, mio, dele in (("A", va, f.get("valor_a")), ("B", vb, f.get("valor_b"))):
                if (mio is None) != (dele is None) or (mio is not None and abs(mio - dele) > 1e-6 * max(1, abs(mio))):
                    erros.append("%s %s %s: recalculado %s × painel %s" % (k, fid, lado, mio, dele))
            un = UN[fid]
            if va is not None and textos(un, va) != f["a"]:
                erros.append("%s %s: texto A %s × esperado %s" % (k, fid, f["a"], textos(un, va)))
            if vb is not None and textos(un, vb) != f["b"]:
                erros.append("%s %s: texto B %s × esperado %s" % (k, fid, f["b"], textos(un, vb)))
            tv = texto_var(VAR[fid], va, vb)
            if tv != f.get("variacao"):
                erros.append("%s %s: variação %s × esperado %s" % (k, fid, f.get("variacao"), tv))
            if VAR[fid] == "pct" and un == "mi" and va is not None and vb is not None:
                if textos("mi", va - vb) != f.get("diferenca"):
                    erros.append("%s %s: diferença %s × esperado %s" % (k, fid, f.get("diferenca"), textos("mi", va - vb)))
    return n, erros


# ---------------------------------------------------------------- 3. textos aprovados do MD&A
ASSUNTO = {   # palavras que precisam aparecer na frase em que o valor do fato é citado
    "receita": r"receita", "lbruto": r"lucro bruto|resultado bruto", "dvendas": r"vendas", "dga": r"gerais|administrativ",
    "outras": r"outras receitas|outras despesas|outras", "ebitda": r"ebitda", "rfin": r"financeir", "ir": r"imposto|tribut|contribui|\bIR\b|\bCS\b",
    "lucro": r"lucro|resultado l[ií]quido", "lucroc": r"controlador|lucro", "aj_rede": r"rede|postos|ebitda", "aj_b2b": r"b2b|ebitda",
    "aj_ren": r"renov|comerc|ebitda", "aj_corp": r"corporativ|reconcilia", "dbruta": r"d[ií]vida bruta|bruta|endividamento|empr[ée]stimos",
    "caixa": r"caixa|aplica|disponibilidad", "dliq": r"d[ií]vida l[ií]quida|l[ií]quida", "pl": r"patrim[ôo]nio|\bPL\b",
    "fco": r"caixa|operacion", "capex": r"invest|capex|imobilizado", "fcl": r"livre|caixa", "prov": r"dividend|JCP|proventos|juros sobre",
}


RX_VAL = re.compile(r"R\$ ?([−-]?\s?\d{1,3}(?:\.\d{3})*(?:,\d+)?|[−-]?\d+(?:,\d+)?)\s*(milh(?:ão|ões)|bilh(?:ão|ões)|mil(?!h)|/\s?m[3³]|MM\b)?", re.I)


def unidade(u):
    u = (u or "").lower()
    return "bi" if u.startswith("bi") else "mi" if (u.startswith("milh") or u == "mm") else "m3" if re.search("m[3³]", u) else "mil" if u == "mil" else ""


def valores_un(t):
    return {(m.group(1).replace(" ", "").replace("−", "-").lstrip("-"), unidade(m.group(2))) for m in RX_VAL.finditer(t)}


def frases(t):
    return re.split(r"(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])", t)


def parte3():
    sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
    import mda_ia as MI
    fatos = ler("mda_fatos.json")["pares"]
    est = ler("mda_ia.json")["pares"]
    rel, fre, ipe, dfd = MI.ler("releases_texto.json"), MI.ler("fre_item10.json"), MI.ler("ipe.json"), MI.ler("df_desempenho.json")
    erros, alertas, n = [], [], 0
    for k, v in est.items():
        par = fatos.get(k)
        if not par:
            erros.append("%s: texto sem fatos correspondentes" % k); continue
        bl, _, _ = MI.trechos(par, rel, fre)
        evs = MI.eventos(par, ipe, (rel or {}).get("trimestres", {}).get(par["A"]["p"], {}).get("data"))
        if evs:
            bl["eventos"] = evs
        its = MI.itens(par, rel, dfd)
        r = MI.confere(v["secoes"], *MI.permitidos(par, bl, its))
        n += 1
        # valor em R$ com unidade (milhões, bilhões, R$/m³) tem de existir com a mesma unidade nos fatos ou nos itens; e um
        # total de release (lucro bruto, receita, despesas operacionais) citado sem "ajustado" é alerta
        proprios = {x for f in par["fatos"] for c in ("a", "b", "diferenca") for s in (f.get(c) or []) for x in valores_un(s)}
        de_itens = {x for t in its for x in valores_un(t)}
        for sid, ps in v["secoes"].items():
            for p in ps:
                for fr in frases(p):
                    ini = 0
                    for m in RX_VAL.finditer(fr):
                        x = (m.group(1).replace(" ", "").replace("−", "-").lstrip("-"), unidade(m.group(2)))
                        jan, ini = fr[ini:m.end()], m.end()
                        if x[1] == "" and ((x[0], "m3") in proprios | de_itens) and re.search(r"m[3³]", fr):
                            continue
                        if x not in proprios and x not in de_itens:
                            erros.append("%s [%s] %s sem correspondência (número e unidade) nos fatos nem nos itens: %s" % (k, sid, m.group(0), fr[:200]))
                        elif x not in proprios and x[1] != "m3":
                            c = list(re.finditer(r"lucro bruto|receita l[íi]quida|despesas operacionais", jan, re.I))
                            if c and not re.match(r"\s*(ajustad|normalizad|recorrent)", jan[c[-1].end():], re.I) and len(jan) - c[-1].end() < 70 \
                                    and not re.search(r"\(\s*[−-]?R\$|exclu|efeito|hedge|CBIO|acordo|TAE|provis", jan, re.I):
                                alertas.append("%s [%s] %s de release citado como %s sem \"ajustado\": %s" % (k, sid, m.group(0), c[-1].group(0), fr[:220]))
        for sid, ps in v["secoes"].items():   # frases sobre as fontes ou a falta delas (devem ter sido limpas)
            for p in ps:
                if MI.RX_META.search(p) or re.search(r"(?:segundo|de acordo com) a Companhia", p, re.I):
                    erros.append("%s [%s]: frase sobre fontes: %s" % (k, sid, p[:160]))
        if r:
            erros.append("%s: números fora dos permitidos (%s)" % (k, ", ".join(sorted(set(r))[:6])))
        # valor em R$ que pertence a um único fato → a frase tem de falar daquele assunto
        dono = {}
        for f in par["fatos"]:
            for campo in ("a", "b", "diferenca"):
                for s in f.get(campo) or []:
                    num = re.sub(r"^−", "", s)
                    dono.setdefault(num, set()).add(f["id"])
        for sid, ps in v["secoes"].items():
            for p in ps:
                fs = frases(p)
                for j, fr in enumerate(fs):
                    ctx = (fs[j - 1] + " " if j else "") + fr   # a frase anterior também conta ("Essa linha...", "O segmento...")
                    for m in re.finditer(r"R\$ ?[\d.]+(?:,\d+)? (?:milhões|milhão|bilhões|bilhão)", fr):
                        ids = dono.get(m.group(0).replace("R$ ", "R$ "), set())
                        ids = {i for i in ids if i in ASSUNTO}
                        if len(ids) != 1:
                            continue
                        i = ids.pop()
                        if not re.search(ASSUNTO[i], ctx, re.I):
                            alertas.append("%s [%s] %s citado numa frase sem referência a %s: %s" % (k, sid, m.group(0), i, fr[:220]))
    return n, erros, alertas


# ---------------------------------------------------------------- 4. indicadores do painel
IDS4 = ["receita", "rbruto", "ebit", "da", "ebitda", "ebitdac", "rfin", "lucro", "lucroc", "mb", "mebit", "mebitda", "mliq", "dv", "dga", "aliq",
        "roe", "mliqudm", "roecons", "roa", "giro", "alav", "lcor", "lsec", "limed", "lger", "cgl", "dbruta", "caixa", "dliq", "dliqc", "dlebitda",
        "dlpl", "dbpl", "passat", "plat", "dcp", "cobjuros", "pmr", "pme", "pmp", "cop", "cfin", "ncg", "fco", "capex", "fcl", "convfco", "capexda",
        "prov", "acoes", "lpa", "vpa", "preco", "mcap", "ev", "pl", "pvp", "evebitda", "fcfy", "dy"]


def painel_indicadores():
    import subprocess
    js = r"""
const fs=require('fs'),path=require('path');const raiz=process.argv[1];
const ld=n=>JSON.parse(fs.readFileSync(path.join(raiz,'data',n+'.json'),'utf8'));const D=require(path.join(raiz,'docs','js','dados.js'));
const m=D.criar({dre:ld('cvm_dre'),bp:ld('cvm_balanco'),dfc:ld('cvm_fluxo_caixa'),dva:ld('cvm_dva'),dra:ld('cvm_dra'),acoes:ld('cvm_acoes'),b3:ld('b3_cotacoes'),aj:ld('ebitda_ajustado'),dlrel:ld('divida_release'),dmpl:ld('cvm_dmpl')});
const ids=JSON.parse(process.argv[2]),out={};
for(const base of ['T','AN']) for(const p of m.periodos('dre',base)){ for(const id of ids){ out[base+'|'+p+'|'+id]=m.ind(id,p,base); } }
process.stdout.write(JSON.stringify(out));"""
    r = subprocess.run(["node", "-e", js, RAIZ, json.dumps(IDS4)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


ACOES = ler("cvm_acoes.json")["valores"]
COT = ler("b3_cotacoes.json")["dias"]


def preco(p):
    y, q = 2000 + int(p[2:]), int(p[0])
    fim = "%d-%s" % (y, {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}[q])
    ant = [d for d in COT if d[0] <= fim]
    if not ant:
        return None
    d = ant[-1]
    return d[2] if (dt.date.fromisoformat(fim) - dt.date.fromisoformat(d[0])).days <= 10 else None


def acoes(p):
    a = ACOES.get(p)
    return a["total"] - (a.get("tesouro") or 0) if a and ok(a.get("total")) else None


def indicador(i, p, base):
    t = lambda ds, cd: fluxo(ds, cd, p, base)  # noqa: E731
    u = lambda ds, cd: fluxo(ds, cd, p, "LTM")  # noqa: E731
    b = lambda cd, k=0: saldo(cd, desloca(p, k))  # noqa: E731
    bm = lambda cd: (b(cd) + b(cd, 4)) / 2 if ok(b(cd)) and ok(b(cd, 4)) else None  # noqa: E731
    pc = lambda: x(None, lambda: plc(p))  # noqa: E731
    def x(_, f):
        try:
            return f()
        except TypeError:
            return None
    def ebit(f):
        a, eq = f("dre", "3.05"), f("dre", "3.04.06")
        return a - (eq or 0) if ok(a) else None
    def da():
        v = t("dva", "7.04.01"); return -v if ok(v) else None
    def caixa():
        a = b("1.01.01"); return a + (b("1.01.02") or 0) if ok(a) else None
    def dbr():
        a, c = b("2.01.04"), b("2.02.01")
        return (a or 0) + (c or 0) if (ok(a) or ok(c)) else None
    aj = lambda: ebitda_aj("CONS", p, base)  # noqa: E731
    aj12 = lambda: ebitda_aj("CONS", p, "LTM")  # noqa: E731
    mcap = lambda: preco(p) * acoes(p) / 1e6 if ok(preco(p)) and ok(acoes(p)) else None  # noqa: E731
    dl = lambda: dliq(p)  # noqa: E731
    ev = lambda: mcap() + dl() + (b("2.03.09") or 0) if ok(mcap()) and ok(dl()) else None  # noqa: E731
    pct = lambda v: v * 100 if ok(v) else None  # noqa: E731
    F = {
        "receita": lambda: t("dre", "3.01"), "rbruto": lambda: t("dre", "3.03"), "ebit": lambda: ebit(t), "da": da,
        "ebitda": aj, "ebitdac": lambda: ebit(t) + (-t("dva", "7.04.01")) if ok(ebit(t)) and ok(t("dva", "7.04.01")) else None,
        "rfin": lambda: t("dre", "3.06"), "lucro": lambda: t("dre", "3.11"), "lucroc": lambda: t("dre", "3.11.01"),
        "mb": lambda: pct(div(t("dre", "3.03"), t("dre", "3.01"))), "mebit": lambda: pct(div(ebit(t), t("dre", "3.01"))),
        "mebitda": lambda: pct(div(aj(), t("dre", "3.01"))), "mliq": lambda: pct(div(t("dre", "3.11"), t("dre", "3.01"))),
        "dv": lambda: pct(div(-t("dre", "3.04.01"), t("dre", "3.01"))) if ok(t("dre", "3.04.01")) else None,
        "dga": lambda: pct(div(-t("dre", "3.04.02"), t("dre", "3.01"))) if ok(t("dre", "3.04.02")) else None,
        "aliq": lambda: pct(div(-t("dre", "3.08"), t("dre", "3.07"))) if ok(t("dre", "3.07")) and t("dre", "3.07") > 0 and ok(t("dre", "3.08")) else None,
        "roe": lambda: pct(div(u("dre", "3.11.01"), (plc(p) + plc(desloca(p, 4))) / 2)) if ok(plc(p)) and ok(plc(desloca(p, 4))) else None,
        "mliqudm": lambda: pct(div(u("dre", "3.11"), u("dre", "3.01"))), "roecons": lambda: pct(div(u("dre", "3.11"), bm("2.03"))),
        "roa": lambda: pct(div(u("dre", "3.11"), bm("1"))), "giro": lambda: div(u("dre", "3.01"), bm("1")), "alav": lambda: div(bm("1"), bm("2.03")),
        "lcor": lambda: div(b("1.01"), b("2.01")), "lsec": lambda: div(b("1.01") - b("1.01.04"), b("2.01")) if ok(b("1.01")) and ok(b("1.01.04")) else None,
        "limed": lambda: div(caixa(), b("2.01")), "lger": lambda: div(b("1.01") + b("1.02.01"), b("2.01") + b("2.02")) if None not in (b("1.01"), b("1.02.01"), b("2.01"), b("2.02")) else None,
        "cgl": lambda: b("1.01") - b("2.01") if ok(b("1.01")) and ok(b("2.01")) else None, "dbruta": dbr, "caixa": caixa, "dliq": dl,
        "dliqc": lambda: dbr() - caixa() if ok(dbr()) and ok(caixa()) else None,
        "dlebitda": lambda: div(dl(), aj12()) if ok(aj12()) and aj12() > 0 else None, "dlpl": lambda: div(dl(), b("2.03")), "dbpl": lambda: div(dbr(), b("2.03")),
        "passat": lambda: pct(div(b("2.01") + b("2.02"), b("1"))) if ok(b("2.01")) and ok(b("2.02")) else None, "plat": lambda: pct(div(b("2.03"), b("1"))),
        "dcp": lambda: pct(div(b("2.01.04"), dbr())),
        "cobjuros": lambda: div(ebit(u), -u("dre", "3.06.02.01")) if ok(u("dre", "3.06.02.01")) and u("dre", "3.06.02.01") < 0 else None,
        "pmr": lambda: fato("pmr", p, base), "pme": lambda: fato("pme", p, base), "pmp": lambda: fato("pmp", p, base),
        "cop": lambda: fato("pmr", p, base) + fato("pme", p, base) if ok(fato("pmr", p, base)) and ok(fato("pme", p, base)) else None,
        "cfin": lambda: fato("ciclo", p, base), "ncg": lambda: b("1.01.03") + b("1.01.04") - b("2.01.02") if None not in (b("1.01.03"), b("1.01.04"), b("2.01.02")) else None,
        "fco": lambda: t("dfc", "6.01"), "capex": lambda: t("dfc", "6.02.01"), "fcl": lambda: fato("fcl", p, base), "convfco": lambda: fato("conv", p, base),
        "capexda": lambda: div(-t("dfc", "6.02.01"), da()) if ok(da()) and da() > 0 and ok(t("dfc", "6.02.01")) else None, "prov": lambda: fato("prov", p, base),
        "acoes": lambda: acoes(p) / 1e6 if ok(acoes(p)) else None,
        "lpa": lambda: div(u("dre", "3.11.01") * 1e6, (acoes(p) + acoes(desloca(p, 4))) / 2) if ok(u("dre", "3.11.01")) and ok(acoes(p)) and ok(acoes(desloca(p, 4))) else None,
        "vpa": lambda: div(plc(p) * 1e6, acoes(p)) if ok(plc(p)) else None, "preco": lambda: preco(p), "mcap": mcap, "ev": ev,
        "pl": lambda: div(mcap(), u("dre", "3.11.01")) if ok(u("dre", "3.11.01")) and u("dre", "3.11.01") > 0 else None,
        "pvp": lambda: div(mcap(), plc(p)) if ok(plc(p)) and plc(p) > 0 else None, "evebitda": lambda: div(ev(), aj12()) if ok(aj12()) and aj12() > 0 else None,
        "fcfy": lambda: pct(div(u("dfc", "6.01") + u("dfc", "6.02.01"), mcap())) if ok(u("dfc", "6.01")) and ok(u("dfc", "6.02.01")) else None,
        "dy": lambda: pct(div(-u("dfc", "6.03.05"), mcap())) if ok(u("dfc", "6.03.05")) else None,
    }
    try:
        return F[i]()
    except (TypeError, ZeroDivisionError):
        return None


def parte4():
    dump = painel_indicadores()
    erros, n = [], 0
    for chave, v in dump.items():
        base, p, i = chave.split("|")
        mio = indicador(i, p, base)
        n += 1
        if (mio is None) != (v is None) or (mio is not None and abs(mio - v) > 1e-6 * max(1, abs(mio))):
            erros.append("%s %s %s: recalculado %s × painel %s" % (i, p, base, mio, v))
    return n, erros


def main():
    out = {"executado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    n1, e1 = parte1()
    n2, e2 = parte2()
    n3, e3, a3 = parte3()
    n4, e4 = parte4()
    n5, e5 = rad_x_aberta()
    out.update({"cvm": {"conferidos": n1, "divergencias": e1}, "fatos": {"conferidos": n2, "divergencias": e2},
                "textos": {"conferidos": n3, "divergencias": e3, "alertas": a3}, "indicadores": {"conferidos": n4, "divergencias": e4},
                "rad": {"conferidos": n5, "divergencias": e5}})
    json.dump(out, open(os.path.join(D, "auditoria.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log = ["# Auditoria independente dos cálculos — %s" % out["executado_em"], "",
           "- CVM (arquivos brutos × séries do painel): %d valores, %d divergências" % (n1, len(e1)),
           "- MD&A (fatos recalculados e textos refeitos): %d fatos, %d divergências" % (n2, len(e2)),
           "- MD&A (textos aprovados): %d textos, %d divergências, %d alertas de número em frase de outro assunto" % (n3, len(e3), len(a3)),
           "- Indicadores do painel (todos os períodos, trimestre e ano): %d valores, %d divergências" % (n4, len(e4)),
           "- ITR/DFP lidos direto do RAD × base aberta da CVM (quando as duas fontes existem): %d valores, %d divergências" % (n5, len(e5)), ""]
    for t, lst in (("Divergências CVM", e1), ("Divergências dos fatos", e2), ("Divergências dos textos", e3), ("Divergências dos indicadores", e4), ("Divergências RAD × base aberta", e5), ("Alertas dos textos", a3)):
        if lst:
            log += ["## " + t, ""] + ["- " + x for x in lst[:200]] + [""]
    open(os.path.join(RAIZ, "logs", "auditoria.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log[:7]))
    return 1 if (e1 or e2 or e3 or e4 or e5) else 0


if __name__ == "__main__":
    sys.exit(main())
