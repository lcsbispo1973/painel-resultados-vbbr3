#!/usr/bin/env python3
"""Vigia: decide se vale disparar a atualização completa do painel agora (roda a cada 15 minutos, leve e sem gravar nada).

Dispara quando:
1. o Plantão de Notícias da B3 traz documento da Vibra que ainda não está em data/plantao.json (fato relevante,
   comunicado, release, ITR/DFP, aviso aos acionistas…); ou
2. a B3 já publicou o arquivo de cotações do último pregão e data/b3_cotacoes.json ainda não o tem.

Escreve disparar=1|0 e motivo=<texto> em GITHUB_OUTPUT (ou na tela).
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
import plantao  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
DIARIO = ["https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D{d}.ZIP", "https://www.b3.com.br/data/files/COTAHIST_D{d}.ZIP"]


def existe(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
            return r.status == 200 and r.read(4) == b"PK\x03\x04"
    except Exception:  # noqa: BLE001
        return False


def novidades_plantao():
    p = os.path.join(RAIZ, "data", "plantao.json")
    conhecidos = {str(n["id"]) for n in json.load(open(p, encoding="utf-8")).get("noticias", [])} if os.path.exists(p) else set()
    hoje = dt.datetime.now(dt.timezone.utc).date()
    b, erro = plantao.baixar(plantao.LISTA.format(ini=(hoje - dt.timedelta(days=10)).isoformat(), fim=hoje.isoformat()), tentativas=2)
    try:
        itens = json.loads(b.decode("utf-8")) if b else None
    except ValueError:
        itens, erro = None, "resposta não é JSON"
    if not isinstance(itens, list):
        return [], "Plantão indisponível (%s)" % erro
    novos = [x["NwsMsg"]["headline"] for x in itens
             if str(x["NwsMsg"]["id"]) not in conhecidos and re.match(r"VIBRA\b", x["NwsMsg"].get("headline") or "")]
    return novos, None


def pregao_novo():
    """Data (dd/mm) do pregão já publicado pela B3 que ainda não está no painel, ou None."""
    p = os.path.join(RAIZ, "data", "b3_cotacoes.json")
    if not os.path.exists(p):
        return None
    ult = dt.date.fromisoformat(json.load(open(p, encoding="utf-8"))["dias"][-1][0])
    agora = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3)))   # Brasília
    dia = ult + dt.timedelta(days=1)
    while dia <= agora.date():
        if dia.weekday() < 5 and not (dia == agora.date() and agora.hour < 18):   # pregão do dia: só depois das 18h
            if any(existe(u.format(d=dia.strftime("%d%m%Y"))) for u in DIARIO):
                return dia.strftime("%d/%m")
        dia += dt.timedelta(days=1)
    return None


def main():
    motivos = []
    novos, erro = novidades_plantao()
    if novos:
        motivos.append("%d documento(s) novo(s) no Plantão da B3: %s" % (len(novos), "; ".join(novos[:3])))
    elif erro:
        print(erro)
    d = pregao_novo()
    if d:
        motivos.append("cotação do pregão de %s publicada pela B3" % d)
    saida = "disparar=%d\nmotivo=%s\n" % (1 if motivos else 0, " | ".join(motivos)[:900])
    if os.environ.get("GITHUB_OUTPUT"):
        open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8").write(saida)
    print(saida.strip() if motivos else "Nada novo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
