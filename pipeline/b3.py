#!/usr/bin/env python3
"""Cotações diárias da ação da Vibra (BRDT3 até 21/10/2021, VBBR3 a partir de 22/10/2021, conforme o arquivo da B3) a partir das Séries Históricas da B3 (COTAHIST).

Grava data/b3_cotacoes.json com o fechamento diário (preço NÃO ajustado por proventos ou bonificações, como negociado)
e logs/b3-ultima-execucao.md com o resultado de cada tentativa de download. Se nenhuma fonte responder, os dados
anteriores são mantidos e o erro fica no log; a falha não interrompe o restante do fluxo.

Uso: python pipeline/b3.py [--saida DIR]    (B3_LOCAL_DIR lê arquivos COTAHIST_A<ano>.ZIP locais, para testes)
"""
import argparse
import datetime as dt
import io
import json
import os
import sys
import time
import traceback
import urllib.error
import urllib.request
import zipfile

ANO_INICIAL = 2017  # IPO em 15/12/2017
TICKERS = ("BRDT3", "VBBR3")
INDICE = "BOVA11"   # ETF do Ibovespa (reinveste proventos), referência para o retorno total
URLS = [
    "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{ano}.ZIP",
    "https://www.b3.com.br/data/files/COTAHIST_A{ano}.ZIP",
]
UA = {"User-Agent": "Mozilla/5.0 (compatible; painel-vbbr3/1.0)"}


def baixar(url, tentativas=3):
    ultimo = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read(), "HTTP %s, %d bytes" % (r.status, int(r.headers.get("Content-Length") or 0))
        except Exception as e:  # noqa: BLE001
            ultimo = "%s: %s" % (type(e).__name__, e)
            time.sleep(2 * (i + 1))
    return None, ultimo


def analisa_linha(l):
    """Registro de cotação do COTAHIST (245 colunas). Devolve (data, ticker, fechamento, volume R$, negocios) ou None."""
    if len(l) < 188 or l[0:2] != "01":
        return None
    ticker = l[12:24].strip()
    if (ticker not in TICKERS and ticker != INDICE) or l[24:27] != "010":  # 010 = mercado à vista (ações e ETFs)
        return None
    data = "%s-%s-%s" % (l[2:6], l[6:8], l[8:10])
    return data, ticker, int(l[108:121]) / 100.0, int(l[170:188]) / 100.0, int(l[147:152])


def le_zip(conteudo):
    out = []
    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        for nome in z.namelist():
            with z.open(nome) as f:
                for bruto in io.TextIOWrapper(f, encoding="latin-1"):
                    r = analisa_linha(bruto.rstrip("\r\n"))
                    if r:
                        out.append(r)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default="data")
    ap.add_argument("--completo", action="store_true", help="baixa todos os anos de novo")
    a = ap.parse_args()
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    saida = a.saida if os.path.isabs(a.saida) else os.path.join(raiz, a.saida)
    os.makedirs(saida, exist_ok=True)
    os.makedirs(os.path.join(raiz, "logs"), exist_ok=True)
    local = os.environ.get("B3_LOCAL_DIR")
    log = ["# B3 — última execução", "", "Executado em %s UTC" % dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M"), ""]
    por_dia, bova = {}, {}
    erros = 0
    hoje = dt.date.today()
    # incremental: reaproveita os anos fechados já gravados e baixa só o ano corrente (e o anterior em janeiro)
    anterior = os.path.join(saida, "b3_cotacoes.json")
    anos_reuso = set()
    if os.path.exists(anterior) and not a.completo and not local:
        try:
            ant = json.load(open(anterior, encoding="utf-8"))
            if "bova11" not in ant:
                raise ValueError("arquivo anterior sem BOVA11: baixa tudo de novo")
            limite = hoje.year - (1 if hoje.month == 1 else 0)
            for x in ant["dias"]:
                if int(x[0][:4]) < limite:
                    por_dia[x[0]] = x
                    anos_reuso.add(int(x[0][:4]))
            for x in ant["bova11"]:
                if int(x[0][:4]) < limite:
                    bova[x[0]] = x
            if anos_reuso:
                log.append("- anos reaproveitados do arquivo anterior: %s" % ", ".join(map(str, sorted(anos_reuso))))
        except Exception:  # noqa: BLE001
            por_dia, anos_reuso = {}, set()
    for ano in range(ANO_INICIAL, hoje.year + 1):
        if ano in anos_reuso:
            continue
        conteudo, info = None, None
        if local:
            p = os.path.join(local, "COTAHIST_A%d.ZIP" % ano)
            if os.path.exists(p):
                conteudo, info = open(p, "rb").read(), "arquivo local"
        else:
            for u in URLS:
                conteudo, info = baixar(u.format(ano=ano))
                log.append("- %d %s → %s" % (ano, u.format(ano=ano), info if conteudo is None else "ok (%s)" % info))
                if conteudo:
                    break
        if not conteudo:
            erros += 1
            continue
        try:
            for d, t, fech, vol, neg in le_zip(conteudo):
                if t == INDICE:
                    bova[d] = [d, fech]
                else:
                    por_dia[d] = [d, t, fech, vol, neg]
        except Exception:  # noqa: BLE001
            erros += 1
            log.append("- %d: erro ao ler o arquivo\n```\n%s\n```" % (ano, traceback.format_exc()))
    dias = [por_dia[k] for k in sorted(por_dia)]
    log += ["", "Dias com cotação: %d" % len(dias)]
    if dias:
        log.append("Primeiro: %s (%s) · último: %s (%s) a R$ %.2f" % (dias[0][0], dias[0][1], dias[-1][0], dias[-1][1], dias[-1][2]))
    log.append("Anos sem arquivo ou com erro: %d" % erros)
    open(os.path.join(raiz, "logs", "b3-ultima-execucao.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    if not dias:
        print("Nenhuma cotação obtida; dados anteriores mantidos.")
        return 0
    doc = {"fonte": "B3 — Séries Históricas (COTAHIST), mercado à vista, preço de fechamento sem ajuste por proventos",
           "atualizado_em": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
           "campos": ["data", "ticker", "fechamento_rs", "volume_rs", "negocios"], "dias": dias,
           "bova11": [bova[k] for k in sorted(bova)]}
    with open(os.path.join(saida, "b3_cotacoes.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print("OK: %d dias" % len(dias))
    return 0


if __name__ == "__main__":
    sys.exit(main())
