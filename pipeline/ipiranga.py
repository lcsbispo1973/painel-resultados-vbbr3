#!/usr/bin/env python3
"""Indicadores da Ipiranga (segmento da Ultrapar) a partir dos releases da Ultrapar arquivados na CVM.

Lê a tabela do segmento IPIRANGA de cada release (texto em data/docs/ultrapar_rel): volume total (mil m³),
EBITDA Ajustado e margem EBITDA Ajustada (R$/m³), e EBITDA Ajustado recorrente quando divulgado.
Portões: trimestre identificado no cabeçalho da tabela e coerente com o assunto; margem ≈ EBITDA ÷ volume;
comparativos dos releases seguintes registrados como reapresentação.
Grava data/ipiranga.json e logs/ipiranga.md.
"""
import datetime as dt, json, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
from releases_ler import rotulo_e_inicio, valores, ord_t, lab, junta_rotulos_quebrados  # noqa: E402

RE_T = re.compile(r"\b([1-4])[TQ] ?(\d{2})\b")
METRICAS = [
    ("vol", re.compile(r"^(volume total|volume de vendas|total volume)\b.*\(mil m|^volume total$|^volume \(mil m", re.I)),
    ("ebitda_rec", re.compile(r"^ebitda ajustado recorrente$|^recurring adjusted ebitda$", re.I)),
    ("margem_rec_m3", re.compile(r"^margem ebitda ajustad[oa] recorrente \(r\$ ?/ ?m", re.I)),
    ("ebitda", re.compile(r"^ebitda ajustado$|^adjusted ebitda$", re.I)),
    ("margem_m3", re.compile(r"^margem ebitda ajustad[oa] \(r\$ ?/ ?m|^adjusted ebitda margin \(r\$ ?/ ?m", re.I)),
]


def ler(texto):
    L = junta_rotulos_quebrados(texto.split("\n"))
    for i, l in enumerate(L):
        if (l.strip() == "Ipiranga" or l.strip()[:8] == "IPIRANGA") and not re.search(r"BALAN|CAPITAL|SHEET|DEMONSTRA|RESULTADO|INCOME", l, re.I):
            # cabeçalho: períodos nas linhas próximas (mesma linha ou até 4 abaixo)
            cab = []
            for j in range(i, min(len(L), i + 9)):
                s = re.sub(r"\S+\s*[xX]\s*\S+", " ", L[j])
                toks = ["%sT%s" % m for m in RE_T.findall(s)]
                if len(toks) >= 2:
                    cab = toks; break
            met = {}
            for l2 in L[i + 1:i + 40]:
                rot, ini = rotulo_e_inicio(l2)
                if not rot:
                    continue
                vs = valores(l2, ini, False)
                if len(vs) < 2:
                    continue
                r0 = re.sub(r"\s*\((r\$|R\$) ?(milh[õo]es|mm|million)\)\s*$", "", rot.strip(), flags=re.I)
                if re.match(r"^ebitda$", r0, re.I) and "ebitda" not in met:
                    met["ebitda"] = vs; met["_ebitda_sem_ajuste"] = True
                    continue
                for nome, rx in METRICAS:
                    if rx.search(r0) and nome not in met:
                        met[nome] = vs
                        break
            if "vol" in met and "ebitda" in met and cab:
                if met.pop("_ebitda_sem_ajuste", False):
                    met["ebitda_rotulo"] = "EBITDA"
                return cab, met
    return None, None


def main():
    pasta = os.path.join(RAIZ, "data", "docs", "ultrapar_rel")
    idx = json.load(open(os.path.join(pasta, "indice.json"), encoding="utf-8"))["documentos"]
    log = ["# Ipiranga — leitura dos releases da Ultrapar", "", "Executado em %s UTC" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), ""]
    serie, conf = {}, {}
    for d in sorted(idx, key=lambda x: x["data_entrega"]):
        p = os.path.join(pasta, d["arquivo"])
        if not os.path.exists(p):
            continue
        cab, met = ler(open(p, encoding="utf-8").read())
        if not cab:
            log.append("- %s %s: tabela da Ipiranga não encontrada" % (d["data_entrega"], d["assunto"][:40])); continue
        per = cab[0]
        m = RE_T.search(d["assunto"])
        if m and "%sT%s" % m.groups() != per:
            log.append("- %s: trimestre do cabeçalho %s ≠ assunto %s" % (d["data_entrega"], per, "%sT%s" % m.groups())); continue
        dias = (dt.date.fromisoformat(d["data_entrega"]) - dt.date(2000 + int(per[2:]), int(per[0]) * 3, 1)).days
        if not 0 <= dias <= 130:
            log.append("- %s: trimestre %s incompatível com a entrega" % (d["data_entrega"], per)); continue
        fonte = {"data": d["data_entrega"], "documento": d["assunto"], "link": d["link"]}
        rotulo = met.pop("ebitda_rotulo", "EBITDA Ajustado")
        serie.setdefault(per, {})["_rotulo"] = rotulo
        for nome, vs in met.items():
            for k, col in enumerate(cab[:len(vs)]):
                if k == 0:
                    serie.setdefault(per, {})[nome] = {"v": vs[0], "fonte": fonte}
                else:
                    conf.setdefault((col, nome), []).append((vs[k], d["data_entrega"]))
    # trimestres sem release próprio legível: comparativo publicado no release seguinte (marcado)
    for (per, nome), outros in conf.items():
        if per in serie and nome in serie[per]:
            continue
        v, dd = sorted(outros, key=lambda o: o[1])[0]
        serie.setdefault(per, {"_rotulo": "EBITDA Ajustado"})[nome] = {"v": v, "fonte": {"data": dd, "documento": "comparativo no release de %s" % dd, "link": None}, "comparativo": True}
    for per in list(serie):
        if "vol" not in serie[per] or "ebitda" not in serie[per]:
            del serie[per]
    alertas, reap = [], []
    for per, ms in serie.items():
        rot_e = ms.pop("_rotulo", "EBITDA Ajustado")
        if rot_e != "EBITDA Ajustado":
            ms["ebitda"]["rotulo"] = rot_e
        if "margem_m3" not in ms and ms["vol"]["v"]:
            ms["margem_m3"] = {"v": round(ms["ebitda"]["v"] / ms["vol"]["v"] * 1000), "fonte": ms["ebitda"]["fonte"], "calculado": True}
        if "margem_m3" in ms and ms["vol"]["v"]:
            calc = ms["ebitda"]["v"] / ms["vol"]["v"] * 1000
            if abs(calc - ms["margem_m3"]["v"]) > max(3, abs(ms["margem_m3"]["v"]) * 0.03):
                alertas.append("%s: margem %s × EBITDA÷volume %.0f" % (per, ms["margem_m3"]["v"], calc))
        for nome, x in ms.items():
            outros = conf.get((per, nome), [])
            dif = [o for o in outros if abs(o[0] - x["v"]) > max(1, abs(x["v"]) * 0.005)]
            if dif:
                x["reapresentado"] = [{"valor": v, "data": dd} for v, dd in dif]
                reap.append("%s %s: %s; depois %s" % (per, nome, x["v"], ", ".join("%s (%s)" % o for o in dif)))
    pers = sorted([p for p in serie if ord_t(p) >= ord_t("4T17")], key=ord_t)
    falt = [lab(n) for n in range(ord_t("4T17"), ord_t(pers[-1]) + 1) if lab(n) not in serie] if pers else []
    json.dump({"fonte": "Releases de resultados da Ultrapar (IPE da CVM), segmento Ipiranga; leitura automática",
               "atualizado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "periodos": pers, "series": {p: serie[p] for p in pers}},
              open(os.path.join(RAIZ, "data", "ipiranga.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    log += ["", "Trimestres: %d (%s a %s); faltando: %s" % (len(pers), pers[0] if pers else "-", pers[-1] if pers else "-", ", ".join(falt) or "nenhum"), "",
            "## Alertas de consistência", ""] + (["- " + a for a in alertas] or ["- nenhum"]) + ["", "## Reapresentações", ""] + (["- " + r for r in reap] or ["- nenhuma"])
    open(os.path.join(RAIZ, "logs", "ipiranga.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))
    return 0


if __name__ == "__main__":
    sys.exit(main())
