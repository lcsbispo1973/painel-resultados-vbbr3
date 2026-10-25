"""Trava de publicação: confere os números que o painel vai mostrar.

Roda antes de publicar. Se qualquer checagem falhar, sai com código 1 e o site não é publicado
(o GitHub Pages continua com a última versão aprovada). Gera data/validacao.json e logs/validacao.md.

Checagens:
  1. Demonstrações: conferências do pipeline da CVM sem divergência (cvm_status.json).
  2. EBITDA Ajustado: soma dos segmentos = total dos segmentos; total + Corporativo = Consolidado;
     série contínua de 4T16 até o último trimestre com nota de segmentos; onde a fonte é o release,
     o valor bate com o release lido.
  3. Dívida: soma dos vencimentos = total; país + exterior = total.
  4. Ipiranga: margem divulgada = EBITDA ÷ volume (tolerância de R$ 1/m³ pelo arredondamento).
  5. Cotações: datas em ordem, preços positivos, sem buracos maiores que 10 dias.
  6. Proventos: valor total ÷ valor por ação compatível com a quantidade de ações (1,0 a 1,3 bilhão).
  7. Arquivos obrigatórios presentes e legíveis.
"""
import json
import os
import sys
from datetime import date, datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, "data")
LOGS = os.path.join(RAIZ, "logs")
OBRIGATORIOS = ["cvm_dre.json", "cvm_balanco.json", "cvm_fluxo_caixa.json", "cvm_status.json",
                "cvm_conferencias.json", "ebitda_ajustado.json"]

falhas, avisos, n = [], [], [0]


def ler(nome):
    with open(os.path.join(DATA, nome), encoding="utf-8") as f:
        return json.load(f)


def checa(cond, msg):
    n[0] += 1
    if not cond:
        falhas.append(msg)


def ordem(p):
    return int(p[2:]) * 4 + int(p[0])


def opcional(nome):
    try:
        return ler(nome)
    except FileNotFoundError:
        avisos.append(f"{nome} ausente (a seção correspondente fica oculta no painel)")
    except ValueError as e:
        falhas.append(f"{nome} ilegível: {e}")
    return None


def main():
    for f in OBRIGATORIOS:
        try:
            ler(f)
            n[0] += 1
        except Exception as e:  # noqa: BLE001
            falhas.append(f"arquivo obrigatório {f}: {e}")
    if falhas:
        return fim()

    st = ler("cvm_status.json")
    checa(st.get("validado") is True and st.get("divergentes") == 0,
          f"conferências da CVM: {st.get('divergentes')} divergente(s)")

    # exercícios só anuais (2015, comparativo do DFP de 2016): conferências aritméticas próprias
    dre_j, dfc_j, dra_j = ler("cvm_dre.json"), ler("cvm_fluxo_caixa.json"), opcional("cvm_dra.json") or {}
    for a in dre_j.get("anuais", []):
        col = "AN" + a
        v = lambda j, cd: next((l.get(col) for l in j.get("linhas", []) if l["cd_conta"] == cd), None)  # noqa: E731
        r, c, b = v(dre_j, "3.01"), v(dre_j, "3.02"), v(dre_j, "3.03")
        checa(None not in (r, c, b) and abs(r + c - b) <= 1, f"DRE {a}: receita + custo ≠ resultado bruto")
        checa(v(dre_j, "3.11") is not None and abs(v(dre_j, "3.09") + v(dre_j, "3.10") - v(dre_j, "3.11")) <= 1, f"DRE {a}: operações continuadas + descontinuadas ≠ lucro")
        if dra_j.get("anuais") and a in dra_j["anuais"]:
            checa(abs((v(dra_j, "4.01") or 0) - v(dre_j, "3.11")) <= 1, f"DRA {a}: lucro ≠ DRE")
        if a in dfc_j.get("anuais", []):
            fl = sum(x or 0 for x in (v(dfc_j, "6.01"), v(dfc_j, "6.02"), v(dfc_j, "6.03"), v(dfc_j, "6.04")))
            checa(v(dfc_j, "6.05") is not None and abs(fl - v(dfc_j, "6.05")) <= 1, f"DFC {a}: fluxos ≠ variação do caixa")
            checa(abs(v(dfc_j, "6.05.02") - v(dfc_j, "6.05.01") - v(dfc_j, "6.05")) <= 1, f"DFC {a}: saldo final − inicial ≠ variação")
        bpj = ler("cvm_balanco.json")
        sb = next((l.get("4T" + a[2:]) for l in bpj["linhas"] if l["cd_conta"] == "1.01.01"), None)
        checa(sb is not None and abs(sb - v(dfc_j, "6.05.02")) <= 1, f"DFC {a}: saldo final ≠ caixa do balanço")

    # EBITDA Ajustado
    aj = ler("ebitda_ajustado.json")
    per = aj.get("periodos", [])
    checa(bool(per) and per[0] == "4T16", f"série de EBITDA Ajustado deveria começar em 4T16 (começa em {per[:1]})")
    # exercícios divulgados no release × soma dos 4 trimestres da série (2017: 1T a 3T vêm dos comparativos)
    for ano, segs in ((opcional("release_operacional.json") or {}).get("exercicios") or {}).items():
        qs = ["%dT%s" % (q, ano[2:]) for q in (1, 2, 3, 4)]
        x = (segs.get("CONS") or {}).get("ebitda")
        if x and all(q in aj["series"] for q in qs) and all(aj["series"][q]["CONS"]["fonte"].get("tipo") == "release" for q in qs):
            tot = sum(aj["series"][q]["CONS"]["v"] for q in qs)
            checa(abs(tot - x["v"]) <= 2, f"EBITDA Ajustado {ano}: soma dos trimestres {tot} ≠ exercício divulgado {x['v']}")
    for a, b in zip(per, per[1:]):
        checa(ordem(b) == ordem(a) + 1, f"EBITDA Ajustado: falta trimestre entre {a} e {b}")
    rel = (opcional("release_operacional.json") or {}).get("series", {})
    for p in per:
        s = {k: v.get("v") for k, v in aj["series"][p].items() if v.get("v") is not None}
        checa("CONS" in s, f"EBITDA Ajustado {p}: sem consolidado")
        if "SEG" in s:
            partes = sum(v for k, v in s.items() if k not in ("CONS", "SEG", "CORP"))
            checa(abs(partes - s["SEG"]) <= 1.5, f"EBITDA Ajustado {p}: segmentos somam {partes}, total dos segmentos {s['SEG']}")
            checa("CORP" in s and abs(s["SEG"] + s["CORP"] - s.get("CONS", 0)) <= 1.5,
                  f"EBITDA Ajustado {p}: segmentos + Corporativo ≠ Consolidado")
        fonte = aj["series"][p]["CONS"].get("fonte") or {}
        if fonte.get("tipo") == "release":
            r = ((rel.get(p) or {}).get("CONS") or {}).get("ebitda") or {}
            checa(r.get("v") is not None and abs(r["v"] - s.get("CONS", 0)) <= 1,
                  f"EBITDA Ajustado {p}: valor do release ({r.get('v')}) ≠ série ({s.get('CONS')})")
        checa(bool(fonte.get("link")), f"EBITDA Ajustado {p}: sem link para o documento de origem")
    dre_per = ler("cvm_dre.json").get("periodos", [])
    if dre_per and per and ordem(per[-1]) < ordem(dre_per[-1]):
        avisos.append(f"EBITDA Ajustado ainda sem a nota de segmentos de {dre_per[-1]} (o painel mostra '—' até o documento ser lido)")

    # Dívida
    dv = opcional("divida.json")
    if dv:
        for p, c in dv.get("cronograma", {}).items():
            checa(abs(sum(x or 0 for x in c["total"]) - c["total_consolidado"]) <= 2, f"dívida {p}: vencimentos não somam o total")
            if c.get("pais") is not None and c.get("exterior") is not None:
                checa(abs(c["pais"] + c["exterior"] - c["total_consolidado"]) <= 2, f"dívida {p}: país + exterior ≠ total")

    # Dívida líquida divulgada (releases): série contínua desde 4T16, valores positivos
    dr = opcional("divida_release.json")
    if dr:
        ps = [p for p in dr.get("periodos", []) if ordem(p) >= ordem("4T16")]
        # alavancagem divulgada × dívida líquida ÷ EBITDA Ajustado dos 12 meses (pega coluna trocada na leitura)
        for p in ps:
            a = dr["series"][p].get("alav_divulgada")
            qs = [p] + [x for x in per if ordem(p) - 3 <= ordem(x) < ordem(p)]
            if a is None or len(qs) < 4 or not all(q in aj["series"] for q in qs):
                continue
            e = sum(aj["series"][q]["CONS"]["v"] for q in qs)
            checa(e > 0 and abs(dr["series"][p]["v"] / e - a) <= 0.15,
                  f"dívida líquida {p}: {dr['series'][p]['v']} ÷ EBITDA UDM {e} = {dr['series'][p]['v'] / e:.2f}x, mas o release divulga {a}x")
        for a, b in zip(ps, ps[1:]):
            checa(ordem(b) == ordem(a) + 1, f"dívida líquida divulgada: falta trimestre entre {a} e {b}")
        for p in ps:
            v = dr["series"][p].get("v")
            checa(v is not None and 0 < v < 100000, f"dívida líquida divulgada {p}: valor {v}")
        if dre_per and ps and ordem(ps[-1]) < ordem(dre_per[-1]):
            avisos.append(f"dívida líquida de {dre_per[-1]} ainda sem release lido (o painel usa o balanço até lá)")

    # Ipiranga
    ip = opcional("ipiranga.json")
    if ip:
        for p in ip.get("periodos", []):
            s = ip["series"][p]
            g = lambda k: (s.get(k) or {}).get("v")  # noqa: E731
            v, e, m = g("vol"), g("ebitda"), g("margem_m3")
            if v and e is not None and m is not None:
                checa(abs(e / v * 1000 - m) <= 1, f"Ipiranga {p}: margem {m} ≠ EBITDA ÷ volume {e / v * 1000:.1f}")

    # Cotações
    b3 = opcional("b3_cotacoes.json")
    if b3:
        for nome, serie, ip_ in (("VBBR3", b3.get("dias", []), 2), ("BOVA11", b3.get("bova11", []), 1)):
            datas = [x[0] for x in serie]
            checa(datas == sorted(set(datas)), f"cotações {nome}: datas fora de ordem ou repetidas")
            checa(all(x[ip_] and x[ip_] > 0 for x in serie), f"cotações {nome}: preço não positivo")
            for a, b in zip(datas, datas[1:]):
                if (date.fromisoformat(b) - date.fromisoformat(a)).days > 10:
                    falhas.append(f"cotações {nome}: buraco entre {a} e {b}")
            n[0] += 1
            if datas and (date.today() - date.fromisoformat(datas[-1])).days > 7:
                avisos.append(f"cotações {nome}: último pregão em {datas[-1]}")

    # Proventos
    pv = opcional("proventos.json") or opcional("dividendos.json")
    if pv:
        for l in pv.get("linhas", []):
            if l.get("valor_acao") and l.get("valor_total"):
                q = l["valor_total"] / l["valor_acao"]
                checa(0.95e9 <= q <= 1.35e9, f"provento {l.get('data_ex')}: valor total ÷ valor por ação = {q / 1e9:.2f} bilhão de ações")
    return fim()


def fim():
    ok = not falhas
    agora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(LOGS, exist_ok=True)
    with open(os.path.join(DATA, "validacao.json"), "w", encoding="utf-8") as f:
        json.dump({"gerado_em": agora, "ok": ok, "checagens": n[0], "falhas": falhas, "avisos": avisos}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(LOGS, "validacao.md"), "w", encoding="utf-8") as f:
        f.write(f"# Trava de publicação — {agora}\n\n{n[0]} checagens; {'aprovado' if ok else 'REPROVADO'}.\n\n")
        if falhas:
            f.write("## Falhas\n\n" + "".join(f"- {x}\n" for x in falhas) + "\n")
        if avisos:
            f.write("## Avisos\n\n" + "".join(f"- {x}\n" for x in avisos) + "\n")
    print(f"validação: {n[0]} checagens, {len(falhas)} falha(s), {len(avisos)} aviso(s)")
    for x in falhas:
        print("FALHA:", x)
    for x in avisos:
        print("aviso:", x)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
