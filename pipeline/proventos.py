"""Proventos: confere os eventos do site de RI (data/dividendos.json) com os avisos arquivados na CVM.

Para cada aviso de dividendos/JCP baixado por documentos.py (data/docs/vibra_proventos) extrai o valor por ação com todas
as casas decimais, a data da posição acionária (data com) e a data a partir da qual as ações são negociadas "ex".
Um evento do site de RI só é enriquecido quando a correspondência é inequívoca: mesmo valor por ação (arredondado a
2 casas) e data com/ex a até 5 dias da data informada no site. Eventos sem correspondência ficam como estão e são
listados no log.

Saída: data/proventos.json (mesmas linhas do site de RI, com data_com, data_ex, valor_acao exato e link do aviso)
Log: logs/proventos.md
"""
import json
import os
import re
import sys
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(RAIZ, "data", "docs", "vibra_proventos")
MESES = {m: i + 1 for i, m in enumerate(["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
                                          "setembro", "outubro", "novembro", "dezembro"])}
RX_DATA_EXT = r"(\d{1,2})º?\s+de\s+(%s)\s+de\s+(\d{4})" % "|".join(MESES)
RX_DATA_NUM = r"(\d{2})/(\d{2})/(\d{4})"
RX_VALOR = re.compile(r"(?<![\d,])(0,\d{5,})")


def portugues(t):
    """Texto em português (os avisos repetem o conteúdo em inglês no fim)."""
    m = re.search(r"\n\s*(Rio de Janeiro, \w+ \d|NOTICE TO SHAREHOLDERS|MATERIAL FACT|ANNOUNCEMENT|Notice to Shareholders|Material Fact)", t)
    return t[:m.start()] if m and m.start() > 400 else t


def datas(trecho):
    out = []
    for d, m, a in re.findall(RX_DATA_EXT, trecho, re.I):
        out.append(date(int(a), MESES[m.lower()], int(d)))
    for d, m, a in re.findall(RX_DATA_NUM, trecho):
        try:
            out.append(date(int(a), int(m), int(d)))
        except ValueError:
            pass
    return out


def ler_aviso(t):
    t = re.sub(r"[ \t]+", " ", portugues(t))
    plano = t.replace("\n", " ")
    valores = {float(v.replace(",", ".")) for v in RX_VALOR.findall(plano)}
    # "o valor por ação ... foi atualizado de R$ A para R$ B": vale B
    for a, _b in re.findall(r"de R\$ ?(0,\d{5,}) para R\$ ?(0,\d{5,})", plano):
        valores.discard(float(a.replace(",", ".")))
    valores = sorted(valores)
    com, ex = [], []
    for m in re.finditer(r"(posição acionária|registrados?|base acionária|data-base|titulares de ações)", plano, re.I):
        com += datas(plano[m.end(): m.end() + 140])[:1]
    for m in re.finditer(r"ex-(juros|dividendos?|direito)", plano, re.I):
        ex += datas(plano[m.end(): m.end() + 120])[:1]
    # tabela: valor por ação seguido da data da posição acionária
    for m in re.finditer(r"(0,\d{5,})\s+" + RX_DATA_NUM, plano):
        com.append(date(int(m.group(4)), int(m.group(3)), int(m.group(2))))
    return valores, sorted(set(com)), sorted(set(ex))


def evento_novo(t, aviso):
    """Evento completo a partir de um aviso (para proventos ainda ausentes do site de RI). None se faltar qualquer dado."""
    t = re.sub(r"[ \t]+", " ", portugues(t))
    plano = t.replace("\n", " ")
    cab = plano[:2500].lower()
    tipo = "JSCP" if re.search(r"juros sobre (o )?capital próprio", cab) else "Dividendo" if "dividend" in cab else None
    m = re.search(r"Total\s+([\d\.]+,\d{2})\s+(0,\d{5,})\s+" + RX_DATA_NUM + r"\s+" + RX_DATA_NUM, plano)
    if m:
        total = float(m.group(1).replace(".", "").replace(",", "."))
        acao = float(m.group(2).replace(",", "."))
        com = date(int(m.group(5)), int(m.group(4)), int(m.group(3)))
        pag = date(int(m.group(8)), int(m.group(7)), int(m.group(6)))
    else:
        mt = re.search(r"valor (?:bruto )?(?:total )?(?:bruto )?de R\$ ?([\d\.]+,\d{2})", plano, re.I)
        valores, coms, _ = ler_aviso(t)
        mp = re.search(r"pagamento[^.]{0,220}?(?:em|no dia|até)\s+(" + RX_DATA_EXT + "|" + RX_DATA_NUM + ")", plano, re.I)
        if not (mt and len(valores) == 1 and len(coms) == 1 and mp):
            return None
        total = float(mt.group(1).replace(".", "").replace(",", "."))
        acao, com = valores[0], coms[0]
        pd = datas(mp.group(1))
        if not pd:
            return None
        pag = pd[0]
    me = re.search(r"exerc[íi]cio (?:social )?(?:de |encerrado em 31 de dezembro de )(\d{4})", plano, re.I)
    ref = int(me.group(1)) if me else com.year
    if not tipo or not (0.95e9 <= total / acao <= 1.35e9) or pag < com:
        return None
    return {"provento": tipo, "referencia": ref, "data_ex": None, "data_com": com.isoformat(), "valor_total": total, "valor_acao": acao,
            "data_pagamento": pag.isoformat(), "aviso": aviso["link"], "aviso_data": aviso["data_entrega"], "origem": "aviso CVM"}


def main():
    base = json.load(open(os.path.join(RAIZ, "data", "dividendos.json"), encoding="utf-8"))
    idx = os.path.join(PASTA, "indice.json")
    avisos = []
    if os.path.exists(idx):
        for d in json.load(open(idx, encoding="utf-8"))["documentos"]:
            p = os.path.join(PASTA, d["arquivo"])
            if os.path.exists(p):
                txt = open(p, encoding="utf-8").read()
                v, c, e = ler_aviso(txt)
                avisos.append(dict(d, valores=v, com=c, ex=e, texto=txt))
    log = ["# Proventos — conferência com os avisos da CVM", "", f"{len(avisos)} avisos lidos; {len(base['linhas'])} eventos no site de RI.", ""]
    linhas, casados = [], 0
    for l in base["linhas"]:
        ref = date.fromisoformat(l["data_ex"])
        cands = []
        for a in avisos:
            for v in a["valores"]:
                if abs(round(v, 2) - l["valor_acao"]) > 0.0051 and abs(int(v * 100) / 100 - l["valor_acao"]) > 1e-9:
                    continue
                perto = [d for d in a["com"] + a["ex"] if abs((d - ref).days) <= 5]
                if perto:
                    cands.append((a, v))
        # vale o aviso mais recente (reapresentações e atualizações de valor por ação); dentro dele, um único valor
        if cands:
            ult = max(a["data_entrega"] for a, _ in cands)
            cands = [(a, v) for a, v in cands if a["data_entrega"] == ult]
        vals = {round(v, 8) for _, v in cands}
        n = dict(l)
        if len(vals) == 1:
            a, v = cands[0]
            com = [d for d in a["com"] if abs((d - ref).days) <= 5]
            exd = [d for d in a["ex"] if abs((d - ref).days) <= 5]
            if com:
                n.update(valor_acao=v, data_com=com[0].isoformat(), aviso=a["link"], aviso_data=a["data_entrega"])
                n["data_ex"] = exd[0].isoformat() if exd and exd[0] > com[0] else None
                casados += 1
                log.append(f"- {l['provento']} {l['data_ex']}: R$ {v} por ação, data com {com[0].isoformat()}" +
                           (f", ex {n['data_ex']}" if n["data_ex"] else "") + f" (aviso de {a['data_entrega']})")
                linhas.append(n)
                continue
        n["data_com"] = None
        log.append(f"- {l['provento']} {l['data_ex']}: sem aviso inequívoco ({len(vals)} candidato(s)); mantido o site de RI")
        linhas.append(n)
    # proventos anunciados depois do último evento do site de RI e ainda ausentes: entram pelo aviso da CVM
    ult_ri = max(l["data_ex"] for l in base["linhas"])
    for a in sorted(avisos, key=lambda x: x["data_entrega"]):
        if a["data_entrega"] <= ult_ri:
            continue
        ev = evento_novo(a["texto"], a)
        if not ev:
            continue
        dc = date.fromisoformat(ev["data_com"])
        dup = [l for l in linhas if abs(l["valor_acao"] - ev["valor_acao"]) < 0.006 and
               abs((date.fromisoformat(l.get("data_com") or l["data_ex"]) - dc).days) <= 10]
        if dup:
            continue
        linhas.append(ev)
        log.append(f"- NOVO pelo aviso de {a['data_entrega']}: {ev['provento']} de R$ {ev['valor_total']:,.2f} (R$ {ev['valor_acao']} por ação), data com {ev['data_com']}, pagamento {ev['data_pagamento']}")
    out = {"fonte": base.get("fonte", "") + "; valores por ação e datas conferidos com os avisos arquivados na CVM quando disponíveis",
           "linhas": linhas}
    json.dump(out, open(os.path.join(RAIZ, "data", "proventos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log.insert(3, f"{casados} eventos conferidos com o aviso.")
    os.makedirs(os.path.join(RAIZ, "logs"), exist_ok=True)
    open(os.path.join(RAIZ, "logs", "proventos.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))
    return 0


if __name__ == "__main__":
    sys.exit(main())
