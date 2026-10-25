#!/usr/bin/env python3
"""Etapa 2 dos releases: lê os textos extraídos (data/releases/texto) e monta as séries operacionais.

Para cada trimestre, a partir do próprio release do trimestre:
  consolidado: volume (mil m³), EBITDA Ajustado (R$ mi), margem EBITDA Ajustada (R$/m³),
               EBITDA Ajustado recorrente e margem recorrente (quando divulgados)
  segmentos:   Rede de Postos, B2B, Grandes Consumidores, Aviação, Outros (conforme a época), com volume,
               EBITDA Ajustado e margem (R$/m³)

Portões de qualidade (o valor só entra se passar):
  1. o trimestre do release é identificado no cabeçalho da tabela e confere com o assunto ou a data de entrega;
  2. margem (R$/m³) ≈ EBITDA ÷ volume × 1000, com tolerância de arredondamento;
  3. comparação com o mesmo número publicado depois (coluna "trimestre anterior" e "mesmo trimestre do ano
     anterior" dos releases seguintes): diferenças ficam registradas como reapresentação.
Grava data/release_operacional.json e logs/releases-leitura.md.

Uso: python pipeline/releases_ler.py
"""
import datetime as dt
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(RAIZ, "data", "releases")

RE_PER = re.compile(r"\b([1-4])T ?(\d{2})\b")


def ord_t(p):
    return int(p[2:]) * 4 + int(p[0])
RE_VOL = re.compile(r"^\s*volumes?\s+de\s+vendas?\s*\(mil\s*m", re.I)
RE_TOKEN = re.compile(r"\(?-?\d[\d.,]*\)?(?:\s?%|\s?p\.?\s?p\.?|x)?", re.I)
SEGMENTOS = [  # chave, rótulo, padrão do título da seção
    ("REDE", "Rede de Postos", re.compile(r"rede de postos|retail", re.I)),
    ("B2B", "B2B", re.compile(r"\bb2b\b", re.I)),
    ("GC", "Grandes Consumidores", re.compile(r"grandes consumidores", re.I)),
    ("AVI", "Aviação", re.compile(r"avia", re.I)),
    ("OUT", "Outros negócios", re.compile(r"outros neg", re.I)),
    ("REN", "Renováveis (Comerc)", re.compile(r"^renov", re.I)),
    ("DIST", "Distribuição (sem Renováveis)", re.compile(r"resultado distribui", re.I)),
    ("CONS", "Consolidado", re.compile(r"consolidado|destaques do resultado", re.I)),
]
ORDEM_ERA = {  # ordem das tabelas quando o título não aparece no texto extraído
    "ate2021": ["CONS", "REDE", "GC", "AVI", "OUT"],
    "2021a2023": ["CONS", "REDE", "B2B", "AVI"],
    "desde2023": ["CONS", "REDE", "B2B"],
}


def num(tok, milhar_virgula=False):
    t = tok.strip()
    if re.search(r"%|p\.?\s?p|x$", t, re.I):
        return None  # variação
    neg = t.startswith("(") and t.endswith(")") or t.startswith("-")
    t = t.strip("()-")
    if milhar_virgula and re.fullmatch(r"\d{1,3}(\.\d{3})+", t):
        t = t.replace(".", "")   # tabela mista (4T17: volume com vírgula, R$ com ponto de milhar)
    elif milhar_virgula:
        t = t.replace(",", "")
    else:
        t = t.replace(".", "").replace(",", ".")
    try:
        v = float(t)
    except ValueError:
        return None
    return -v if neg else v


def valores(linha, inicio, milhar_virgula):
    """Números da linha a partir da coluna `inicio`, sem as variações (%, p.p., x)."""
    out = []
    for m in RE_TOKEN.finditer(linha[inicio:]):
        v = num(m.group(0), milhar_virgula)
        if v is not None:
            out.append(v)
    return out


def rotulo_e_inicio(linha):
    """Separa o rótulo (texto à esquerda) do início dos números."""
    m = re.search(r"\s{2,}\(?-?\d", linha)
    if not m:
        return None, None
    rot = linha[:m.start()].strip()
    rot = re.sub(r"[\*¹²³⁴⁵\d]+$", "", rot).strip()
    return rot, m.start()


def trimestre_do_texto(L, i_vol):
    """Trimestre do release: o período mais frequente no cabeçalho da primeira tabela (o atual aparece também nas
    colunas de variação, como "2T26 x 2T25")."""
    cont = {}
    for j in range(i_vol, max(0, i_vol - 25), -1):
        for q, a in RE_PER.findall(L[j]):
            k = "%sT%s" % (q, a)
            cont[k] = cont.get(k, 0) + 1
    if not cont:
        return None
    melhor = max(cont.values())
    cands = [k for k, v in cont.items() if v == melhor]
    return max(cands, key=ord_t) if len(cands) > 1 else cands[0]


def trimestre_do_assunto(r):
    m = RE_PER.search(r["assunto"]) or re.search(r"\b([1-4])T ?20(\d{2})\b", r["assunto"])
    return "%sT%s" % m.groups() if m else None


RE_COL = re.compile(r"\b(?:[1-4]T ?\d{2}|[12]S ?\d{2}|9M ?\d{2}|20\d{2})\b")


def colunas(L, i, limite=45):
    """Períodos das colunas de valores da tabela cuja linha de dados é L[i], lidos do cabeçalho acima dela
    (pulando linhas de dados da mesma tabela). Ignora os grupos de comparação ("2T26 x 2T25"), que são as
    colunas de variação."""
    melhor, achou = [], None
    for j in range(i - 1, max(-1, i - limite), -1):
        s = L[j]
        rot, ini = rotulo_e_inicio(s)
        if rot and not RE_COL.search(s[ini:]) and len(valores(s, ini, False)) >= 2:
            if achou is not None:
                break  # já passou do bloco de cabeçalho
            continue   # linha de dados da mesma tabela
        s2 = re.sub(r"\S+\s*[xX]\s*\S+", " ", s)          # "2T26 x 2T25", "4T20X4T19"
        s2 = re.sub(r"\S+\s*[xX]\s*$", " ", s2)            # "4T19 x" (comparação quebrada em duas linhas)
        if re.search(r"\b[xX]\b", s2):
            continue
        toks = [x.replace(" ", "") for x in RE_COL.findall(s2)]
        if len(toks) >= 2:
            achou = j if achou is None else achou
            if len(toks) > len(melhor):
                melhor = toks
        if achou is not None and achou - j > 4:
            break
    return melhor


def lab(n):
    a, q = divmod(n - 1, 4)
    return "%dT%02d" % (q + 1, a)


def titulo_secao(L, i):
    for j in range(i - 1, max(0, i - 25), -1):
        s = L[j].strip()
        if not s or re.search(r"\d{2}|milh|exceto|pública|publica|adr|^x |em r\$", s, re.I):
            continue
        if len(s) < 60:
            return s
    return ""


def junta_rotulos_quebrados(L):
    """Une rótulos quebrados em linhas: "Margem EBITDA ajustada" / valores / "(R$/m³)" → uma linha só."""
    L = list(L)
    for i in range(len(L) - 2):
        a, b, c = L[i].strip(), L[i + 1], L[i + 2].strip()
        if a and not re.search(r"\d", a) and len(a) < 45 and re.match(r"^\s+\(?-?\d", b) and c.startswith("(") is False and c and len(c) < 30 and not re.search(r"\d{2}", c):
            pass
        if a and not re.search(r"\d", a) and len(a) < 45 and re.match(r"^\s+\(?-?\d", b):
            sufixo = c if (c and len(c) < 30 and re.match(r"^\(|^da ", c) and not re.search(r"\d{2}", c)) else ""
            if not sufixo and a.count("(") > a.count(")") and re.fullmatch(r"[^\d()]{1,10}\)", c or ""):
                sufixo = c   # "Volume de vendas (mil" / valores / "m³)"
            rot = (a + " " + sufixo).strip()
            if sufixo and not rot.count("(") == rot.count(")"):
                rot = rot.replace("(% da", "(% da")
            L[i + 1] = rot + "   " + b.strip()
            L[i] = ""
            if sufixo:
                L[i + 2] = ""
    return L


def ler_release(texto, data_entrega):
    L = junta_rotulos_quebrados(texto.split("\n"))
    ivols = [i for i, l in enumerate(L) if RE_VOL.match(l)]
    if not ivols:
        return None, "sem tabela de volume"
    per = trimestre_do_texto(L, ivols[0])
    milhar_virgula = bool(re.search(r"\b\d{1,2},\d{3}\s", L[ivols[0]])) and not re.search(r"\b\d{1,3}\.\d{3}\b", L[ivols[0]])
    era = "ate2021" if data_entrega < "2021-08-01" else ("2021a2023" if data_entrega < "2023-05-01" else "desde2023")
    secoes, usados = [], set()
    for k, i in enumerate(ivols):
        fim = ivols[k + 1] if k + 1 < len(ivols) else min(len(L), i + 60)
        tit = titulo_secao(L, i)
        chave = next((c for c, _, rx in SEGMENTOS if rx.search(tit)), None)
        if chave is None:
            ordem = [c for c in ORDEM_ERA[era] if c not in usados]
            chave = ordem[0] if ordem else None
        if chave is None or chave in usados:
            continue
        usados.add(chave)
        if chave == "DIST":
            usados.add("CONS")  # nas releases de 2025 a primeira tabela é a da Distribuição
        cols = colunas(L, i)
        met = {}
        for l in L[i:fim]:
            rot, ini = rotulo_e_inicio(l)
            if not rot:
                continue
            vs = valores(l, ini, milhar_virgula)
            if len(vs) < 2:
                continue
            r = rot.lower()
            nome = None
            if RE_VOL.match(l):
                nome = "vol"
            elif re.match(r"^ebitda ajustado$", r):
                nome = "ebitda"
            elif re.match(r"^margem ebitda ajust(ada|\.)? ?\(r\$ ?/ ?m", r):
                nome = "margem_m3"
            elif re.match(r"^ebitda ajustado distribui", r):
                nome = "ebitda_dist"
            elif re.match(r"^ebitda ajustado recorrente$", r):
                nome = "ebitda_rec"
            elif re.match(r"^margem ebitda ajust(ada|\.)? recorrente ?\(r\$ ?/ ?m", r):
                nome = "margem_rec_m3"
            if nome and nome not in met:
                met[nome] = list(zip(cols, vs))
        secoes.append((chave, tit, met))
    # EBITDA Ajustado consolidado: primeira linha "EBITDA Ajustado" com números no documento
    ebitda_cons = None
    for n, l in enumerate(L):
        rot, ini = rotulo_e_inicio(l)
        if rot and re.match(r"^ebitda ajustado$", rot.lower()):
            vs = valores(l, ini, milhar_virgula)
            if len(vs) >= 2:
                ebitda_cons = list(zip(colunas(L, n), vs))
                break
    # EBITDA Ajustado de Renováveis (Comerc): linha "Ebitda Ajustado Comerc" ou bloco "Comerc" seguido de "Ebitda Ajustado"
    ebitda_ren = None
    for n, l in enumerate(L):
        rot, ini = rotulo_e_inicio(l)
        alvo = None
        if rot and re.match(r"^ebitda ajustado comerc$", rot.lower()):
            alvo = n
        elif l.strip().lower() == "comerc":
            for m in range(n + 1, min(len(L), n + 3)):
                r2, i2 = rotulo_e_inicio(L[m])
                if r2 and re.match(r"^ebitda ajustado$", r2.lower()):
                    alvo = m
                    break
        if alvo is not None:
            r2, i2 = rotulo_e_inicio(L[alvo])
            vs = valores(L[alvo], i2, milhar_virgula)
            if len(vs) >= 2:
                ebitda_ren = list(zip(colunas(L, alvo, 80), vs))
                break
    c0 = colunas(L, ivols[0])
    if c0 and re.match(r"^[1-4]T\d{2}$", c0[0]):
        per = c0[0]
    return {"periodo": per, "secoes": secoes, "ebitda_cons": ebitda_cons, "ebitda_ren": ebitda_ren}, None


def main():
    os.makedirs(os.path.join(RAIZ, "logs"), exist_ok=True)
    indice = json.load(open(os.path.join(PASTA, "indice.json"), encoding="utf-8"))["releases"]
    log = ["# Releases — leitura dos números", "", "Executado em %s UTC" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), ""]
    por_periodo = {}   # período → release mais recente entregue para ele (versão em português)
    lidos = []
    for r in sorted(indice, key=lambda x: x["data_entrega"]):
        p = os.path.join(PASTA, "texto", r["arquivo"])
        if not os.path.exists(p):
            continue
        res, erro = ler_release(open(p, encoding="utf-8").read(), r["data_entrega"])
        if not res:
            log.append("- %s %s: ignorado (%s)" % (r["data_entrega"], r["assunto"][:50], erro))
            continue
        pa = trimestre_do_assunto(r)
        per = res["periodo"]
        # portão 1: trimestre identificado e coerente com o assunto (ou com a data de entrega: até 4 meses depois)
        if not per and pa:
            per = res["periodo"] = pa
        if not per or (pa and pa != per):
            log.append("- %s %s: trimestre incerto (tabela %s, assunto %s)" % (r["data_entrega"], r["assunto"][:50], per, pa))
            continue
        fimq = dt.date(2000 + int(per[2:]), int(per[0]) * 3, 1)
        dias = (dt.date.fromisoformat(r["data_entrega"]) - fimq).days
        if not (0 <= dias <= 130):
            log.append("- %s: trimestre %s incompatível com a data de entrega" % (r["data_entrega"], per))
            continue
        res["release"] = r
        lidos.append(res)
        por_periodo[per] = res
    # monta séries: valor do próprio release (coluna 0); confirmações nas colunas 1 (ano anterior) e 2 (trimestre anterior)
    series, confirm = {}, {}

    def guarda(per, seg, met, v, fonte):
        series.setdefault(per, {}).setdefault(seg, {})[met] = {"v": v, "fonte": fonte}

    anuais = {}   # exercício completo (colunas "2017", "2016" dos releases do 4º trimestre)

    def registra(per, seg, nome, pares, fonte, own, data):
        for k, (col, v) in enumerate(pares):
            if re.match(r"^20\d{2}$", col or "") and per.startswith("4T") and int(col[2:]) in (int(per[2:]), int(per[2:]) - 1):
                anuais.setdefault(col, {}).setdefault(seg, {}).setdefault(nome, []).append((v, data, fonte))
                continue
            if not re.match(r"^[1-4]T\d{2}$", col or ""):
                continue
            if col == per:
                if own and k == 0:
                    guarda(per, seg, nome, v, fonte)
            else:
                confirm.setdefault((col, seg, nome), []).append((v, data, fonte))

    for res in lidos:
        per, r = res["periodo"], res["release"]
        fonte = {"data": r["data_entrega"], "assunto": r["assunto"], "link": r["link"]}
        own = por_periodo.get(per) is res
        for seg, tit, met in res["secoes"]:
            for nome, pares in met.items():
                registra(per, seg, nome, pares, fonte, own, r["data_entrega"])
        if res["ebitda_cons"]:
            registra(per, "CONS", "ebitda", res["ebitda_cons"], fonte, own, r["data_entrega"])
        if res.get("ebitda_ren"):
            registra(per, "REN", "ebitda", res["ebitda_ren"], fonte, own, r["data_entrega"])
    # trimestres sem release próprio (antes do IPO: 4T16 a 3T17): comparativo publicado nos releases seguintes,
    # o mais antigo; marcado como comparativo. Os demais comparativos do mesmo número servem de confirmação.
    sem_proprio = sorted({k[0] for k in confirm} - set(series), key=ord_t)
    for per in sem_proprio:
        for (col, seg, nome), lst in confirm.items():
            if col != per:
                continue
            v, data, f = sorted(lst, key=lambda x: x[1])[0]
            guarda(per, seg, nome, v, dict(f, como="comparativo publicado no release de %s" % data))
    # exercícios: valor do release do 4º trimestre do próprio ano (o mais antigo) e confirmação pelo do ano seguinte
    ex = {}
    for ano, segs in anuais.items():
        for seg, mets in segs.items():
            for nome, lst in mets.items():
                lst = sorted(lst, key=lambda x: x[1])
                v, data, f = lst[0]
                x = {"v": v, "fonte": dict(f, como="exercício completo, release do 4º trimestre")}
                outros = [(v2, d2) for v2, d2, _ in lst[1:]]
                x["confirmado"] = sum(1 for v2, _ in outros if abs(v2 - v) <= max(1, abs(v) * 0.005))
                dif = [(v2, d2) for v2, d2 in outros if abs(v2 - v) > max(1, abs(v) * 0.005)]
                if dif:
                    x["reapresentado"] = [{"valor": v2, "release": d2} for v2, d2 in dif]
                ex.setdefault(ano, {}).setdefault(seg, {})[nome] = x
    # portão: soma dos 4 trimestres = exercício (EBITDA e volume) quando os 4 trimestres existem
    soma_ex = []
    for ano, segs in sorted(ex.items()):
        qs = ["%dT%s" % (q, ano[2:]) for q in (1, 2, 3, 4)]
        for seg, mets in segs.items():
            for nome in ("ebitda", "vol"):
                if nome in mets and all(series.get(q, {}).get(seg, {}).get(nome) for q in qs):
                    tot = sum(series[q][seg][nome]["v"] for q in qs)
                    okk = abs(tot - mets[nome]["v"]) <= max(2, abs(mets[nome]["v"]) * 0.0002)   # arredondamento
                    mets[nome]["soma_trimestres"] = tot
                    if not okk:
                        mets[nome]["alerta"] = True
                    soma_ex.append("%s %s %s: soma dos trimestres %s × exercício %s%s" % (ano, seg, nome, tot, mets[nome]["v"], "" if okk else "  ← diferença (reclassificação entre segmentos ou reapresentação nos comparativos)"))
    # portões 2 e 3
    alertas, reap = [], []
    for per, segs in series.items():
        for seg, mets in segs.items():
            base_m = mets.get("ebitda_dist") or mets.get("ebitda")
            if "vol" in mets and base_m and "margem_m3" in mets and mets["vol"]["v"]:
                calc = base_m["v"] / mets["vol"]["v"] * 1000
                if abs(calc - mets["margem_m3"]["v"]) > max(3, abs(mets["margem_m3"]["v"]) * 0.03):
                    alertas.append("%s %s: margem divulgada %.0f vs EBITDA÷volume %.0f" % (per, seg, mets["margem_m3"]["v"], calc))
                    mets["margem_m3"]["alerta"] = True
            for nome, x in mets.items():
                outros = confirm.get((per, seg, nome), [])
                outros = [(v, d) for v, d, _ in outros if d != x["fonte"]["data"]]
                dif = [(v, d) for v, d in outros if abs(v - x["v"]) > max(1, abs(x["v"]) * 0.005)]
                x["confirmado"] = len(outros) - len(dif)
                if outros:
                    ult = max(outros, key=lambda vd: vd[1])
                    x["ultimo"] = ult[0]; x["ultimo_release"] = ult[1]   # última versão publicada
                if dif:
                    x["reapresentado"] = [{"valor": v, "release": d} for v, d in dif]
                    reap.append("%s %s %s: %s no próprio release; depois %s" % (per, seg, nome, x["v"], ", ".join("%s (%s)" % vd for vd in dif)))
    pers = sorted(series, key=ord_t)
    rotulos = {c: n for c, n, _ in SEGMENTOS}
    doc = {"fonte": "Releases de resultados da Vibra (IPE da CVM), leitura automática do texto",
           "atualizado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "unidades": {"vol": "mil m³", "ebitda": "R$ milhões", "margem_m3": "R$/m³", "ebitda_rec": "R$ milhões", "margem_rec_m3": "R$/m³"},
           "segmentos": rotulos, "periodos": pers, "series": {p: series[p] for p in pers},
           "exercicios": {a: ex[a] for a in sorted(ex)}}
    json.dump(doc, open(os.path.join(RAIZ, "data", "release_operacional.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    log += ["Releases lidos: %d · trimestres: %d (%s a %s)" % (len(lidos), len(pers), pers[0] if pers else "-", pers[-1] if pers else "-"), ""]
    log += ["## Alertas de consistência (margem ≠ EBITDA ÷ volume)", ""] + (["- " + a for a in alertas] or ["- nenhum"])
    log += ["", "## Trimestres anteriores ao IPO (comparativos)", ""] + (["- " + ", ".join(sem_proprio)] if sem_proprio else ["- nenhum"])
    log += ["", "## Exercício × soma dos trimestres", ""] + (["- " + a for a in soma_ex] or ["- nada a conferir"])
    log += ["", "## Reapresentações em releases posteriores", ""] + (["- " + a for a in reap] or ["- nenhuma"])
    open(os.path.join(RAIZ, "logs", "releases-leitura.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log[:8]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
