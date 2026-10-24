"""Registro de mudanças do painel.

Compara o que já se conhecia (data/registro.json) com os dados desta execução e registra o que é novo:
trimestres nas demonstrações (DFP/ITR), releases de resultados, fatos relevantes, Formulários de Referência
e EBITDA Ajustado por segmento. Na primeira execução monta o histórico sem gerar alerta.

Saídas:
  data/registro.json     histórico (o painel mostra em Metodologia > Registro de mudanças)
  logs/novidades.md      só o que entrou nesta execução (vira o texto do alerta); vazio se nada mudou
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, "data")
LOGS = os.path.join(RAIZ, "logs")
ARQ = os.path.join(DATA, "registro.json")
NOV = os.path.join(LOGS, "novidades.md")
MAX_EVENTOS = 400


def ler(nome):
    try:
        with open(os.path.join(DATA, nome), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def nome_tri(p):
    return f"{p[0]}º trimestre de 20{p[2:]}"


def fmt(v):
    if v is None:
        return "—"
    s = f"{abs(v):,.0f}".replace(",", ".")
    return ("−" if v < 0 else "") + "R$ " + s + " mi"


def var(a, b):
    if a is None or b is None or b == 0 or (a < 0) != (b < 0):
        return ""
    return f" ({(a / b - 1) * 100:+.1f}% sobre o mesmo trimestre do ano anterior)".replace(".", ",")


def valor_dre(dre, cd, p):
    for l in dre.get("linhas", []):
        if l.get("cd_conta") == cd:
            return l.get(p)
    return None


def candidatos():
    """Tudo o que existe nos dados agora: chave -> evento."""
    ev = {}
    dre = ler("cvm_dre.json") or {}
    aj = ler("ebitda_ajustado.json") or {}
    for p in dre.get("periodos", []):
        ano_ant = p[:2] + str(int(p[2:]) - 1).zfill(2)
        rec, luc = valor_dre(dre, "3.01", p), valor_dre(dre, "3.11", p)
        e = (aj.get("series", {}).get(p, {}) or {}).get("CONS") or {}
        fonte = e.get("fonte") or {}
        partes = [f"receita líquida de {fmt(rec)}{var(rec, valor_dre(dre, '3.01', ano_ant))}",
                  f"lucro líquido de {fmt(luc)}{var(luc, valor_dre(dre, '3.11', ano_ant))}"]
        if e.get("v") is not None:
            ea = ((aj.get("series", {}).get(ano_ant, {}) or {}).get("CONS") or {}).get("v")
            partes.insert(0, f"EBITDA Ajustado de {fmt(e['v'])}{var(e['v'], ea)}")
        ev["df:" + p] = {
            "data": fonte.get("data") or "", "tipo": "Demonstrações financeiras",
            "titulo": ("DFP" if p.startswith("4T") else "ITR") + " do " + nome_tri(p),
            "detalhe": "; ".join(partes) + ".", "link": fonte.get("link") or ""}
    rt = ler("releases_texto.json") or {}
    for p, t in (rt.get("trimestres") or {}).items():
        ev["release:" + p] = {"data": t.get("data") or "", "tipo": "Release de resultados",
                              "titulo": t.get("release") or ("Release " + p), "detalhe": "", "link": t.get("link") or ""}
    ipe = ler("ipe.json") or {}
    for d in ipe.get("documentos", []):
        if d.get("categoria") != "Fato Relevante":
            continue
        ev["fr:" + str(d.get("protocolo"))] = {"data": d.get("data_entrega") or "", "tipo": "Fato relevante",
                                               "titulo": d.get("assunto") or d.get("tipo") or "Fato relevante",
                                               "detalhe": "", "link": d.get("link") or ""}
    pv = ler("proventos.json") or {}
    for l in pv.get("linhas", []):
        if not l.get("aviso"):
            continue
        dc = l.get("data_com") or l.get("data_ex") or ""
        dcf = f"{dc[8:10]}/{dc[5:7]}/{dc[:4]}" if dc else "—"
        pg = l.get("data_pagamento") or ""
        ev["prov:%s:%s" % (dc, l["valor_acao"])] = {
            "data": l.get("aviso_data") or dc, "tipo": "Proventos",
            "titulo": "%s de R$ %s mi (R$ %s por ação)" % (l["provento"], f"{l['valor_total'] / 1e6:,.1f}".replace(",", "X").replace(".", ",").replace("X", "."),
                                                          f"{l['valor_acao']:.5f}".replace(".", ",")),
            "detalhe": "Data com %s; pagamento em %s; exercício de %s." % (dcf, f"{pg[8:10]}/{pg[5:7]}/{pg[:4]}" if pg else "—", l.get("referencia")),
            "link": l["aviso"]}
    fre = ler("fre_item10.json") or {}
    for ano, f in (fre.get("anos") or {}).items():
        ev[f"fre:{ano}:v{f.get('versao')}"] = {"data": f.get("recebido") or "", "tipo": "Formulário de Referência",
                                               "titulo": f"Formulário de Referência {ano}, versão {f.get('versao')}",
                                               "detalhe": "", "link": f.get("link") or ""}
    return ev


def main():
    agora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    reg = ler("registro.json")
    atual = candidatos()
    os.makedirs(LOGS, exist_ok=True)
    if not atual:
        print("registro: nenhum dado encontrado; nada a fazer")
        open(NOV, "w", encoding="utf-8").close()
        return 0
    primeira = reg is None
    reg = reg or {"conhecidos": [], "eventos": []}
    conhecidos = set(reg.get("conhecidos", []))
    novos = [(k, v) for k, v in atual.items() if k not in conhecidos]
    novos.sort(key=lambda kv: (kv[1]["data"], kv[0]))
    for k, v in novos:
        reg["eventos"].append(dict(v, chave=k, registrado_em=agora, historico=primeira))
    reg["eventos"].sort(key=lambda e: (e.get("data") or "", e.get("chave")), reverse=True)
    reg["eventos"] = reg["eventos"][:MAX_EVENTOS]
    reg["conhecidos"] = sorted(conhecidos | set(atual))
    reg["atualizado_em"] = agora
    with open(ARQ, "w", encoding="utf-8") as f:
        json.dump(reg, f, ensure_ascii=False, indent=1)

    # alerta só do que é recente (documento com até 20 dias): itens antigos que passam a ser lidos entram no histórico sem alerta
    limite = (datetime.now(timezone.utc).date() - timedelta(days=20)).isoformat()
    novos = [(k, v) for k, v in novos if (v.get("data") or "") >= limite]
    with open(NOV, "w", encoding="utf-8") as f:
        if novos and not primeira:
            f.write("Novidades encontradas na atualização de " + agora[:10] + ":\n\n")
            for k, v in novos:
                d = v["data"]
                f.write(f"- **{v['tipo']}** — {v['titulo']}" + (f" (entregue em {d[8:10]}/{d[5:7]}/{d[:4]})" if d else "") + "\n")
                if v["detalhe"]:
                    f.write(f"  {v['detalhe']}\n")
                if v["link"]:
                    f.write(f"  [Documento na CVM]({v['link']})\n")
            f.write("\nPainel: https://lcsbispo1973.github.io/painel-resultados-vbbr3/\n")
    print(f"registro: {len(novos)} novidade(s)" + (" (histórico inicial, sem alerta)" if primeira else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
