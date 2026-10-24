#!/usr/bin/env python3
"""Trechos qualitativos dos releases da Vibra, organizados por tema, para o MD&A do painel.

Para cada trimestre (release do próprio trimestre), separa os parágrafos de texto corrido por seção do release
(mensagem da administração, consolidado, Rede de Postos, B2B, Renováveis, resultado financeiro, lucro, endividamento,
fluxo de caixa, investimentos) e guarda até alguns parágrafos por tema, com o link do documento. Só texto da
Companhia; nada é reescrito aqui. Grava data/releases_texto.json.
"""
import datetime as dt, json, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
from releases_ler import ord_t  # noqa: E402

TEMAS = [
    ("MSG", re.compile(r"mensagem da administra|carta do|palavra do", re.I)),
    ("REDE", re.compile(r"^rede de postos|^retail|^varejo", re.I)),
    ("B2B", re.compile(r"^b2b|grandes consumidores", re.I)),
    ("REN", re.compile(r"^renov|^comerc", re.I)),
    ("FIN", re.compile(r"resultado financeiro", re.I)),
    ("LUCRO", re.compile(r"lucro l[ií]quido|resultado l[ií]quido", re.I)),
    ("DIV", re.compile(r"endividamento|d[ií]vida|alavancagem|estrutura de capital", re.I)),
    ("CAIXA", re.compile(r"fluxo de caixa|gera[çc][ãa]o de caixa|capital de giro", re.I)),
    ("CAPEX", re.compile(r"investimentos|capex", re.I)),
    ("CONS", re.compile(r"consolidado|destaques|desempenho|resultado distribui", re.I)),
]
PT = re.compile(r"\b(de|do|da|que|com|para|no|na|os|as|em|foi|pelo|pela)\b", re.I)
EN = re.compile(r"\b(the|and|of|with|for|was|which|by|in)\b", re.I)


def eh_titulo(s):
    s = s.strip()
    return 3 <= len(s) <= 60 and not s.endswith((".", ",", ";", ":")) and s[:1].isupper() and len(re.findall(r"\d", s)) <= 4 \
        and not re.search(r"\s{3,}\S", s) and len(s.split()) <= 8


def eh_prosa(l):
    s = l.strip()
    return len(s) >= 35 and len(re.findall(r"[A-Za-zÀ-ú]", s)) > 0.6 * len(s) and not re.search(r"\S\s{4,}\S.*\s{4,}\S", s)


def paragrafos(L):
    """[(índice da linha inicial, texto)] para blocos de prosa (linhas consecutivas)."""
    out, buf, ini = [], [], None
    for i, l in enumerate(L + [""]):
        if eh_prosa(l):
            if not buf:
                ini = i
            buf.append(l.strip())
        else:
            if buf and (l.strip() == "" or not eh_prosa(l)):
                t = re.sub(r"\s+", " ", " ".join(buf)).strip()
                t = re.sub(r"(\w)- (\w)", r"\1\2", t)
                t = re.sub(r"(?<=[a-zà-ú])f (?=[a-zà-ú])|\bf (?=[a-zà-ú]{2,})", "f", t)   # ligadura "fi"/"fo" quebrada pelo PDF
                if len(t) >= 120:
                    out.append((ini, t))
                buf = []
    return out


def main():
    pasta = os.path.join(RAIZ, "data", "releases")
    idx = json.load(open(os.path.join(pasta, "indice.json"), encoding="utf-8"))["releases"]
    oper = json.load(open(os.path.join(RAIZ, "data", "release_operacional.json"), encoding="utf-8"))
    # release próprio de cada trimestre = fonte usada na leitura dos números
    fonte_por_link = {}
    for p, s in oper["series"].items():
        c = s.get("CONS") or s.get("DIST") or {}
        f = (c.get("vol") or c.get("ebitda") or {}).get("fonte")
        if f:
            fonte_por_link[f["link"]] = p
    saida = {}
    for r in idx:
        p = fonte_por_link.get(r["link"])
        if not p:
            continue
        L = open(os.path.join(pasta, "texto", r["arquivo"]), encoding="utf-8").read().split("\n")
        titulos = [(i, l.strip()) for i, l in enumerate(L) if eh_titulo(l)]
        temas = {}
        for ini, t in paragrafos(L):
            if len(EN.findall(t)) > len(PT.findall(t)):
                continue   # parte em inglês
            if not t[:1].isupper() or re.match(r"^[\d\*¹²³⁴⁵⁶()]", t) or "|" in t or re.search(r"webcast|teleconfer|tradu[çc][ãa]o simult|download|disclaimer|declarações prospectivas|forward", t, re.I):
                continue   # notas de rodapé e avisos padrão
            tit = next((tt for i, tt in reversed(titulos) if i < ini), "")
            tema = next((k for k, rx in TEMAS if rx.search(tit)), None) or ("MSG" if ini < 140 else None)
            if not tema:
                continue
            lista = temas.setdefault(tema, [])
            if len(lista) < 5 and t not in lista:
                lista.append(t[:900] + ("…" if len(t) > 900 else ""))
        if temas:
            saida[p] = {"release": r["assunto"], "data": r["data_entrega"], "link": r["link"], "temas": temas}
    pers = sorted(saida, key=ord_t)
    json.dump({"fonte": "Releases de resultados da Vibra (IPE da CVM): trechos de texto da Companhia por tema",
               "atualizado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "periodos": pers, "trimestres": {p: saida[p] for p in pers}},
              open(os.path.join(RAIZ, "data", "releases_texto.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("Trimestres com texto: %d (%s a %s)" % (len(pers), pers[0] if pers else "-", pers[-1] if pers else "-"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
