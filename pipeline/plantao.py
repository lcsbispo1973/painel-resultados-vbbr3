#!/usr/bin/env python3
"""Documentos da Vibra em tempo (quase) real, pelo Plantão de Notícias da B3.

As bases abertas da CVM (ITR, DFP, IPE) só são atualizadas uma vez por semana. O Plantão de Notícias da B3 publica cada
documento entregue pela Vibra minutos depois da entrega, com o link para o documento no sistema da CVM:
- documentos eventuais (IPE: fatos relevantes, comunicados, releases, avisos…): frmExibirArquivoIPEExterno.aspx?ID=<protocolo>
- demonstrações estruturadas (ITR/DFP): frmNBC.aspx?NSD=<número sequencial do documento>

Grava data/plantao.json (todas as notícias da Vibra, com protocolo/NSD) e logs/plantao-novos.md (as que apareceram nesta
execução). Com GITHUB_OUTPUT definido, escreve novos=<n> para o workflow de vigia decidir se dispara a atualização.

Uso: python pipeline/plantao.py [--dias N]
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
LISTA = "https://sistemasweb.b3.com.br/PlantaoNoticias/Noticias/ListarTitulosNoticias?agencia=18&palavra=VIBRA&dataInicial={ini}&dataFinal={fim}"
DETALHE = "https://sistemasweb.b3.com.br/PlantaoNoticias/Noticias/Detail?idNoticia={id}&agencia=18&dataNoticia={data}"
VISUALIZA = "https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega={p}"
DOWNLOAD = "https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo={p}{resto}"

# título do Plantão → (categoria, tipo) da base IPE da CVM (o que não estiver aqui fica com o próprio título como categoria)
MAPA = [
    (r"^Fato Relevante", ("Fato Relevante", "")),
    (r"^Outros Comunicados ao Mercado", ("Comunicado ao Mercado", "Outros Comunicados Não Considerados Fatos Relevantes")),
    (r"^Esclarecimentos", ("Comunicado ao Mercado", "Esclarecimentos sobre questionamentos da CVM/B3")),
    (r"^(Aquisicao|Alienacao) de Participacao", ("Comunicado ao Mercado", "Aquisição/Alienação de Participação Acionária (art. 12 da Instr. CVM nº 358)")),
    (r"^Apresentacao a analistas", ("Comunicado ao Mercado", "Apresentações a analistas/agentes do mercado")),
    (r"^Mudanca de Auditor", ("Comunicado ao Mercado", "Mudança de Auditor (art. 28, Instr. CVM nº308/99)")),
    (r"^Dados Financeiros - Press-release", ("Dados Econômico-Financeiros", "Press-release")),
    (r"^Dem\. Financeiras Anuais Completas", ("Dados Econômico-Financeiros", "Demonstrações Financeiras Anuais Completas")),
    (r"^Dem\. Financeiras Intermedi", ("Dados Econômico-Financeiros", "Demonstrações Financeiras Intermediárias")),
    (r"^Relatorio de Agencia de Rating", ("Dados Econômico-Financeiros", "Relatório de Agência de Rating")),
    (r"^Relatorio de Agente Fiduciario", ("Dados Econômico-Financeiros", "Relatório de Agente Fiduciário")),
    (r"^Aviso aos Acionistas", ("Aviso aos Acionistas", "Outros avisos")),
    (r"^Aviso Acionistas Art\.133", ("Aviso aos Acionistas", "Comunicado art.133 da Lei nº6.404/76")),
    (r"^Data prevista para assembleia", ("Aviso aos Acionistas", "Data prevista para a assembleia")),
    (r"^Aviso aos Debenturistas", ("Aviso aos Debenturistas", "")),
    (r"^(Ata|Sumario) (da )?Reuniao (do )?Conselho (de )?Administracao", ("Reunião da Administração", "Conselho de Administração")),
    (r"^Ata da Reuniao do Conselho Fiscal", ("Reunião da Administração", "Conselho Fiscal")),
    (r"^(Edital de Convocacao|Ata da|Proposta da Administracao|Manual para participacao|Mapa consolidado|Boletim de voto).*AG", ("Assembleia", "AGO/E")),
    (r"^VM Posicao Individual", ("Valores Mobiliários negociados e detidos (art. 11 da Instr. CVM nº 358)", "Posição Individual - Cia, Controladas e Coligadas")),
    (r"^VM Posicao Consolidada", ("Valores Mobiliários negociados e detidos (art. 11 da Instr. CVM nº 358)", "Posição Consolidada")),
    (r"^Transacao entre Partes Relacionadas", ("Comunicação sobre Transação entre Partes Relacionadas", "")),
    (r"^Calendario de Eventos", ("Calendário de Eventos Corporativos", "")),
    (r"^Estatuto Social", ("Estatuto Social", "")),
    (r"^Anuncio de Inicio Distribuicao", ("Documentos de Oferta de Distribuição Pública", "Anúncio de Início de Distribuição Pública")),
    (r"^Anuncio Encerramento Distribuicao", ("Documentos de Oferta de Distribuição Pública", "Anúncio de Encerramento de Distribuição Pública")),
    (r"^Aviso ao Mercado", ("Documentos de Oferta de Distribuição Pública", "Aviso ao Mercado")),
    (r"^Informe sobre Codigo de Governanca", ("Informe do Código de Governança", "")),
]


def baixar(url, tentativas=3, timeout=60):
    erro = None
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read(), None
        except Exception as e:  # noqa: BLE001
            erro = "%s: %s" % (type(e).__name__, e)
            time.sleep(2 * (i + 1))
    return None, erro


def classifica(titulo):
    """Título do Plantão ('VIBRA (VBBR-NM) - Fato Relevante - 13/10/26') → dicionário com tipo de documento e metadados."""
    t = re.sub(r"^VIBRA\s*(\([^)]*\))?\s*-\s*", "", titulo).strip()
    m = re.match(r"Demonstracoes Financeiras - (ITR|DFP) de (\d{2})/(\d{2})/(\d{2})", t)
    if m:
        return {"doc": m.group(1), "dt_refer": "20%s-%s-%s" % (m.group(4), m.group(3), m.group(2)), "assunto": t}
    data = None
    d = re.search(r"(\d{2})/(\d{2})/(\d{2})", t)
    if d:
        data = "20%s-%s-%s" % (d.group(3), d.group(2), d.group(1))
    nome = re.split(r"\s+-\s*\d{2}/\d{2}/\d{2}|\s*-\s*\d{2}/\d{2}/\d{2}", t)[0].strip(" -")
    cat, tipo = nome, ""
    for rx, (c, tp) in MAPA:
        if re.search(rx, nome, re.I):
            cat, tipo = c, tp
            break
    assunto = nome
    if tipo == "Press-release" and data and data[5:] in ("03-31", "06-30", "09-30", "12-31"):
        assunto = "Release %dT%s" % ({"03": 1, "06": 2, "09": 3, "12": 4}[data[5:7]], data[2:4])
    return {"doc": "IPE", "categoria": cat, "tipo": tipo, "data_ref": data, "assunto": assunto}


def detalhe(n):
    """Link do documento na CVM a partir da página de detalhe da notícia."""
    b, erro = baixar(DETALHE.format(id=n["id"], data=urllib.parse.quote(n["data_hora"])))
    if not b:
        return {"erro_detalhe": erro}
    t = html.unescape(b.decode("utf-8", "replace"))
    out = {}
    m = re.search(r"frmExibirArquivoIPEExterno\.aspx\?ID=(\d+)", t, re.I)
    if m:
        out["protocolo"] = m.group(1)
    m = re.search(r"frmNBC\.aspx\?NSD=(\d+)", t, re.I)
    if m:
        out["nsd"] = m.group(1)
    return out


def sequencia(protocolo):
    """numSequencia e numVersao do documento IPE (a página de visualização da CVM os traz), para montar o link de download."""
    b, _ = baixar(VISUALIZA.format(p=protocolo), tentativas=2)
    if not b:
        return {}
    t = b.decode("utf-8", "replace")
    s = re.search(r"numSequencia=(\d+)", t, re.I)
    v = re.search(r"numVersao=(\d+)", t, re.I)
    return {"seq": s.group(1) if s else None, "versao": v.group(1) if v else None}


def para_ipe(n):
    """Notícia de documento IPE → entrada provisória no formato de data/ipe.json (substituída pela base aberta da CVM)."""
    resto = ""
    if n.get("seq"):
        resto = "&numSequencia=%s&numVersao=%s" % (n["seq"], n.get("versao") or 1)
    return {"data_entrega": n["data_hora"][:10], "data_referencia": n.get("data_ref") or n["data_hora"][:10],
            "categoria": n["categoria"], "tipo": n["tipo"], "especie": "", "assunto": n["assunto"], "apresentacao": "",
            "protocolo": "RAD-%s" % n["protocolo"], "versao": int(n.get("versao") or 1),
            "link": DOWNLOAD.format(p=n["protocolo"], resto=resto), "provisorio": True, "fonte": "B3 — Plantão de Notícias"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=0, help="janela de busca (padrão: 20 dias, ou 400 na primeira execução)")
    a = ap.parse_args()
    caminho = os.path.join(RAIZ, "data", "plantao.json")
    os.makedirs(os.path.join(RAIZ, "logs"), exist_ok=True)
    ant = json.load(open(caminho, encoding="utf-8")) if os.path.exists(caminho) else {"noticias": []}
    por_id = {str(n["id"]): n for n in ant.get("noticias", [])}
    dias = a.dias or (20 if por_id else 400)
    hoje = dt.date.today() + dt.timedelta(days=1)   # o executor usa UTC
    novos, erros = [], 0
    k = 0
    while k * 30 < dias:
        fim = hoje - dt.timedelta(days=30 * k)
        ini = max(fim - dt.timedelta(days=30), hoje - dt.timedelta(days=dias))
        k += 1
        b, erro = baixar(LISTA.format(ini=ini.isoformat(), fim=fim.isoformat()))
        if not b:
            erros += 1
            print("Plantão indisponível (%s): %s" % (ini, erro))
            continue
        for x in json.loads(b.decode("utf-8")):
            m = x.get("NwsMsg") or {}
            i = str(m.get("id") or "")
            if not i or i in por_id or not re.match(r"VIBRA\b", m.get("headline") or ""):
                continue
            n = {"id": int(i), "data_hora": m.get("dateTime", ""), "titulo": (m.get("headline") or "").strip()}
            n.update(classifica(n["titulo"]))
            n.update(detalhe(n))
            if n["doc"] == "IPE" and n.get("protocolo"):
                n.update(sequencia(n["protocolo"]))
            por_id[i] = n
            novos.append(n)
            time.sleep(0.5)
    lista = sorted(por_id.values(), key=lambda n: n["data_hora"], reverse=True)
    json.dump({"fonte": "B3 — Plantão de Notícias (documentos entregues pela Vibra à CVM, com o link no sistema da CVM)",
               "atualizado_em": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "noticias": lista},
              open(caminho, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    linhas = ["- %s — %s%s" % (n["data_hora"], n["titulo"], "" if (n.get("protocolo") or n.get("nsd")) else " (sem link)") for n in novos]
    open(os.path.join(RAIZ, "logs", "plantao-novos.md"), "w", encoding="utf-8").write(
        ("# Novidades no Plantão de Notícias da B3\n\n" + "\n".join(linhas) + "\n") if novos else "")
    if os.environ.get("GITHUB_OUTPUT"):
        open(os.environ["GITHUB_OUTPUT"], "a").write("novos=%d\n" % len(novos))
    print("Plantão: %d notícias da Vibra, %d novas%s" % (len(lista), len(novos), " (%d janelas com erro)" % erros if erros else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
