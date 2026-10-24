#!/usr/bin/env python3
"""Perfil da dívida da Vibra: cronograma de vencimentos dos financiamentos (nota explicativa das ITRs/DFPs).

Lê a tabela "Informações sumarizadas sobre os vencimentos dos financiamentos" (texto em data/docs/vibra_df):
anos de vencimento, financiamentos no país e no exterior e total consolidado na data-base.
Portões: soma dos anos = total consolidado; país + exterior = total; data-base do texto = trimestre do documento.
Lista também os relatórios de agências de rating arquivados na CVM (data e link).
Grava data/divida.json e logs/divida.md.
"""
import datetime as dt, json, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
from releases_ler import rotulo_e_inicio, valores, ord_t  # noqa: E402

MESES = {"janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
         "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}


def ler(texto):
    L = texto.split("\n")
    for i, l in enumerate(L):
        if not re.search(r"vencimentos? dos financiamentos", l, re.I):
            continue
        # cabeçalho de anos: linha com 3+ anos nas 8 linhas seguintes; "em diante" pode estar quebrado em linhas
        anos, ini_dados, diante_ano = None, None, None
        for j in range(i + 1, min(len(L), i + 10)):
            ys = re.findall(r"\b(20\d{2})\b", L[j])
            if len(ys) >= 3:
                anos = [int(y) for y in ys]
                tem_diante = bool(re.search(r"diante", L[j], re.I))
                if not tem_diante:
                    for k in range(j - 3, j + 2):
                        if 0 <= k < len(L) and re.search(r"diante", L[k], re.I):
                            tem_diante = True
                acima = [int(y) for k in range(j - 3, j) for y in re.findall(r"\b(20\d{2})\b", L[k])]
                if tem_diante:
                    diante_ano = max(acima) if acima and max(acima) > max(anos) else max(anos) + 1
                ini_dados = j + 1
                break
        if not anos:
            continue
        cols = ["%d" % a for a in anos] + (["%d+" % diante_ano] if diante_ano else [])
        pais = ext = total = None
        data_base = None
        for l2 in L[ini_dados:ini_dados + 8]:
            l2 = re.sub(r"(?<=\s)[-–](?=\s|$)", "0", l2)   # "-" = sem vencimento no ano
            rot, ini = rotulo_e_inicio(l2)
            if not rot:
                continue
            vs = valores(l2, ini, False)
            if re.match(r"^financiamentos? (no )?pa[ií]s", rot, re.I):
                pais = vs
            elif re.match(r"^financiamentos? (no )?exterior", rot, re.I):
                ext = vs
            elif total is None:
                m = re.match(r"^\s*em (\d{1,2}) de ([a-zç]+) de (\d{4})(\s{2,}.*)$", l2, re.I)
                if m and m.group(2).lower() in MESES:
                    data_base = dt.date(int(m.group(3)), MESES[m.group(2).lower()], int(m.group(1)))
                    total = valores(m.group(4), 0, False)
        if not total or not data_base:
            continue
        n = len(cols)
        if len(total) < n + 1:
            return None, "linha de total com %d valores para %d colunas" % (len(total), n)
        venc, tot = total[:n], total[n]
        if abs(sum(venc) - tot) > 2:
            return None, "soma dos vencimentos %s ≠ total %s" % (sum(venc), tot)
        out = {"data_base": data_base.isoformat(), "colunas": cols, "total": venc, "total_consolidado": tot}
        if pais and ext and len(pais) >= n + 1 and len(ext) >= n + 1:
            if abs(pais[n] + ext[n] - tot) <= 2:
                out["pais"] = pais[n]; out["exterior"] = ext[n]
        return out, None
    return None, "tabela de vencimentos não encontrada"


def main():
    pasta = os.path.join(RAIZ, "data", "docs", "vibra_df")
    idx = json.load(open(os.path.join(pasta, "indice.json"), encoding="utf-8"))["documentos"]
    log = ["# Dívida — última execução", "", "Executado em %s UTC" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), ""]
    serie = {}
    for d in sorted(idx, key=lambda x: x["data_entrega"]):
        p = os.path.join(pasta, d["arquivo"])
        if not os.path.exists(p):
            continue
        r, erro = ler(open(p, encoding="utf-8").read())
        if not r:
            log.append("- %s %s: %s" % (d["data_entrega"], d["assunto"][:40], erro)); continue
        db = dt.date.fromisoformat(r["data_base"])
        per = "%dT%02d" % ((db.month - 1) // 3 + 1, db.year % 100)
        r["fonte"] = {"data": d["data_entrega"], "documento": d["assunto"] or d["tipo"], "link": d["link"]}
        serie[per] = r
    pers = sorted(serie, key=ord_t)
    rating = json.load(open(os.path.join(RAIZ, "data", "docs", "vibra_rating", "indice.json"), encoding="utf-8"))["documentos"] \
        if os.path.exists(os.path.join(RAIZ, "data", "docs", "vibra_rating", "indice.json")) else []
    json.dump({"fonte": "Notas explicativas das ITRs/DFPs da Vibra (CVM): vencimentos dos financiamentos",
               "atualizado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "periodos": pers, "cronograma": {p: serie[p] for p in pers},
               "rating": [{"data": x["data_entrega"], "documento": x["assunto"] or x["tipo"], "link": x["link"]} for x in rating]},
              open(os.path.join(RAIZ, "data", "divida.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    log += ["", "Datas-base lidas: %d (%s)" % (len(pers), ", ".join(pers))]
    open(os.path.join(RAIZ, "logs", "divida.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))
    return 0


if __name__ == "__main__":
    sys.exit(main())
