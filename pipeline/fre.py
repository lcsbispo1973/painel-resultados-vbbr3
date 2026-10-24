#!/usr/bin/env python3
"""Baixa as tabelas do Formulário de Referência (FRE) da Vibra nos Dados Abertos da CVM.

Para cada ano, usa apenas a ÚLTIMA versão entregue de cada documento. Grava:
  data/fre/<ano>.json   tabelas do FRE do ano (colunas e linhas), sem CPF, datas de nascimento ou currículos
  data/fre/indice.json  anos, documentos (versão, data de recebimento, link na CVM) e tabelas
  data/fre_series.json  séries entre anos (remuneração, dividendos, capital, acionistas)
O texto do FRE (por exemplo o item 10, comentários dos diretores) não faz parte dos Dados Abertos;
o painel mostra o link para o documento original.

Uso: python pipeline/fre.py [--completo] [--saida DIR]     (CVM_LOCAL_DIR lê .zip locais, para testes)
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.request
import zipfile

CNPJ = "34.274.233/0001-02"
ANO_INICIAL = 2010
csv.field_size_limit(2**30)  # alguns campos de texto do FRE passam do limite padrão
MAX_TEXTO = 600
# colunas que não vão para o repositório público (dados pessoais ou texto longo de currículo)
PROIBIDAS = re.compile(r"(^|_)CPF|Nascimento|Experiencia_Profissional|Documento_Parte_Relacionada|Representante_Legal|"
                       r"^CNPJ_Companhia$|^Nome_Companhia$|^ID_Documento$|^Data_Referencia$", re.I)
NOMES = {
    "capital_social": "Capital social", "capital_social_aumento": "Aumentos de capital", "capital_social_reducao": "Reduções de capital",
    "capital_social_desdobramento": "Desdobramentos e grupamentos", "capital_social_titulo_conversivel": "Títulos conversíveis",
    "capital_social_classe_acao": "Capital social por classe", "distribuicao_capital": "Distribuição do capital (acionistas e free float)",
    "posicao_acionaria": "Posição acionária", "posicao_acionaria_classe_acao": "Posição acionária por classe",
    "distribuicao_dividendos": "Dividendos distribuídos", "distribuicao_dividendos_classe_acao": "Dividendos por classe de ação",
    "remuneracao_total_orgao": "Remuneração total por órgão", "remuneracao_maxima_minima_media": "Remuneração máxima, mínima e média",
    "remuneracao_variavel": "Remuneração variável", "remuneracao_acao": "Remuneração baseada em ações",
    "administrador_membro_conselho_fiscal": "Administradores e conselho fiscal", "membro_comite": "Membros de comitês",
    "auditor": "Auditor independente", "auditor_responsavel": "Auditor responsável", "responsavel": "Responsáveis pelo formulário",
    "transacao_parte_relacionada": "Transações com partes relacionadas", "participacao_sociedade": "Participações em sociedades",
    "participacao_sociedade_valorizacao_acao": "Valorização das participações", "endividamento": "Endividamento",
    "historico_emissor": "Histórico do emissor", "informacao_financeira": "Informações financeiras selecionadas",
    "ativo_imobilizado": "Ativos imobilizados (propriedades)", "ativo_intangivel": "Ativos intangíveis", "obrigacao": "Obrigações (valores mobiliários de dívida)",
    "outro_valor_mobiliario": "Outros valores mobiliários", "plano_recompra": "Planos de recompra", "politica_negociacao": "Política de negociação",
    "politica_negociacao_cargo": "Política de negociação por cargo", "relacao_subordinacao": "Relações de subordinação (organograma)",
    "relacao_familiar": "Relações familiares", "direito_acao": "Direitos das ações", "volume_valor_mobiliario": "Volume negociado de valores mobiliários",
    "titular_valor_mobiliario": "Titulares de valores mobiliários", "mercado_estrangeiro": "Mercado estrangeiro", "titulo_exterior": "Títulos no exterior",
    "valor_mobiliario_tesouraria_movimentacao": "Ações em tesouraria", "acao_entregue": "Ações entregues",
    "administrador_PCD": "Administradores PCD", "administrador_declaracao_genero": "Administradores por gênero", "administrador_declaracao_raca": "Administradores por raça",
    "empregado_PCD": "Empregados PCD", "empregado_local_declaracao_genero": "Empregados por local e gênero", "empregado_local_declaracao_raca": "Empregados por local e raça",
    "empregado_local_faixa_etaria": "Empregados por local e faixa etária", "empregado_posicao_declaracao_genero": "Empregados por posição e gênero",
    "empregado_posicao_declaracao_raca": "Empregados por posição e raça", "empregado_posicao_faixa_etaria": "Empregados por posição e faixa etária",
    "empregado_posicao_local": "Empregados por posição e local",
}


def baixar(url, destino, tentativas=3):
    ultimo = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "painel-resultados-vbbr3/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r, open(destino, "wb") as f:
                while True:
                    bloco = r.read(1 << 20)
                    if not bloco:
                        break
                    f.write(bloco)
            return True
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            ultimo = e
        except Exception as e:  # noqa: BLE001
            ultimo = e
        time.sleep(5 * (i + 1))
    raise RuntimeError(f"falha ao baixar {url}: {ultimo}")


def numero(s):
    s = (s or "").strip()
    if not s:
        return None
    try:
        if "," in s and "." in s:
            s = s.replace(".", "").replace(",", ".")
        elif "," in s:
            s = s.replace(",", ".")
        return float(s)
    except ValueError:
        return None


def ler_csv(zf, nome):
    with zf.open(nome) as bruto:
        yield from csv.DictReader(io.TextIOWrapper(bruto, encoding="latin-1", newline=""), delimiter=";")


def extrair_ano(caminho, ano):
    """Retorna {'documentos': [...], 'tabelas': {nome: {'colunas': [...], 'linhas': [[...]]}}} só com a última versão de cada documento."""
    with zipfile.ZipFile(caminho) as zf:
        principal = f"fre_cia_aberta_{ano}.csv"
        docs = {}
        for r in ler_csv(zf, principal):
            if r.get("CNPJ_CIA", "").strip() != CNPJ:
                continue
            k = r["DT_REFER"]
            v = int(r["VERSAO"] or 0)
            if k not in docs or v > docs[k]["versao"]:
                docs[k] = {"dt_refer": k, "versao": v, "id": r["ID_DOC"].strip(), "dt_receb": r["DT_RECEB"], "link": r["LINK_DOC"].strip(),
                           "categoria": r.get("CATEG_DOC", "").strip(), "versoes_no_ano": 0}
        for r in ler_csv(zf, principal):
            if r.get("CNPJ_CIA", "").strip() == CNPJ:
                docs[r["DT_REFER"]]["versoes_no_ano"] += 1
        ids = {d["id"] for d in docs.values()}
        tabelas = {}
        for nome in sorted(zf.namelist()):
            if nome == principal or not nome.lower().endswith(".csv"):
                continue
            tab = re.sub(rf"^fre_cia_aberta_|_{ano}\.csv$", "", nome)
            cols, linhas = None, []
            for r in ler_csv(zf, nome):
                if r.get("CNPJ_Companhia", "").strip() != CNPJ or r.get("ID_Documento", "").strip() not in ids:
                    continue
                if cols is None:
                    cols = [c for c in r.keys() if c and not PROIBIDAS.search(c)]
                lin = {c: (r.get(c) or "").strip() for c in cols}
                # pessoas físicas aparecem sem identificação na posição acionária
                if tab.startswith("posicao_acionaria"):
                    for campo, tipo in (("Acionista", "Tipo_Pessoa_Acionista"), ("Acionista_Relacionado", "Tipo_Pessoa_Acionista_Relacionado")):
                        if campo in lin and "sica" in lin.get(tipo, "") and lin[campo]:
                            lin[campo] = "Pessoa física (não identificada)"
                linhas.append([lin[c][:MAX_TEXTO] for c in cols])
            if linhas:
                # remove colunas totalmente vazias
                usar = [i for i in range(len(cols)) if any(l[i] for l in linhas)]
                tabelas[tab] = {"colunas": [cols[i] for i in usar], "linhas": [[l[i] for i in usar] for l in linhas]}
    return {"ano": ano, "documentos": sorted(docs.values(), key=lambda d: d["dt_refer"]), "tabelas": tabelas}


def linhas_dict(ano_json, tab):
    t = ano_json["tabelas"].get(tab)
    if not t:
        return []
    return [dict(zip(t["colunas"], l)) for l in t["linhas"]]


def montar_series(anos_json):
    """Séries entre anos. Quando o mesmo exercício aparece em vários formulários, vale o mais recente."""
    rem, div, cap, acc, emp = {}, {}, {}, {}, {}
    for aj in sorted(anos_json, key=lambda a: a["ano"]):
        ref = aj["documentos"][-1]["dt_refer"] if aj["documentos"] else str(aj["ano"])
        for r in linhas_dict(aj, "remuneracao_total_orgao"):
            fim = r.get("Data_Fim_Exercicio_Social", "")
            orgao = r.get("Orgao_Administracao", "")
            if fim and orgao:
                rem[(fim, orgao)] = {"exercicio": fim[:4], "orgao": orgao, "fonte_fre": aj["ano"],
                                     "total_rs_mi": None if numero(r.get("Total_Remuneracao_Orgao")) is None else round(numero(r["Total_Remuneracao_Orgao"]) / 1e6, 3),
                                     "membros": numero(r.get("Numero_Membros")), "membros_remunerados": numero(r.get("Numero_Membros_Remunerados")),
                                     "fixa_rs_mi": None, "variavel_rs_mi": None}
                fixa = sum(numero(r.get(c)) or 0 for c in ("Salario", "Beneficios_Diretos_Indiretos", "Participacoes_Comites", "Outros_Valores_Fixos"))
                var = sum(numero(r.get(c)) or 0 for c in ("Bonus", "Participacao_Resultados", "Participacao_Reunioes", "Comissoes", "Outros_Valores_Variaveis"))
                rem[(fim, orgao)]["fixa_rs_mi"] = round(fixa / 1e6, 3)
                rem[(fim, orgao)]["variavel_rs_mi"] = round(var / 1e6, 3)
                rem[(fim, orgao)]["baseada_acoes_rs_mi"] = round((numero(r.get("Baseada_Acoes")) or 0) / 1e6, 3)
        for r in linhas_dict(aj, "distribuicao_dividendos"):
            fim = r.get("Data_Fim_Exercicio_Social", "")
            if fim:
                div[fim] = {"exercicio": fim[:4], "fonte_fre": aj["ano"],
                            "lucro_ajustado_rs_mi": None if numero(r.get("Lucro_Liquido_Ajustado")) is None else round(numero(r["Lucro_Liquido_Ajustado"]) / 1e6, 3),
                            "dividendo_total_rs_mi": None if numero(r.get("Dividendo_Distribuido_Total")) is None else round(numero(r["Dividendo_Distribuido_Total"]) / 1e6, 3),
                            "payout_pct": numero(r.get("Dividendo_Distribuido_Lucro_Liquido_Ajustado")),
                            "retido_rs_mi": None if numero(r.get("Lucro_Liquido_Retido")) is None else round(numero(r["Lucro_Liquido_Retido"]) / 1e6, 3),
                            "retorno_pl_pct": numero(r.get("Taxa_Retorno_Patrimonio_Liquido_Emissor"))}
        caps = linhas_dict(aj, "capital_social")
        if caps:
            c = caps[-1] if all(x.get("Tipo_Capital") == caps[0].get("Tipo_Capital") for x in caps) else \
                next((x for x in caps if "ubscrito" in x.get("Tipo_Capital", "")), caps[-1])
            cap[aj["ano"]] = {"ano_fre": aj["ano"], "dt_refer": ref, "tipo": c.get("Tipo_Capital"),
                              "capital_rs_mi": None if numero(c.get("Valor_Capital")) is None else round(numero(c["Valor_Capital"]) / 1e6, 3),
                              "acoes_total": numero(c.get("Quantidade_Total_Acoes"))}
        for r in linhas_dict(aj, "distribuicao_capital"):
            acc[aj["ano"]] = {"ano_fre": aj["ano"], "pf": numero(r.get("Quantidade_Acionistas_PF")), "pj": numero(r.get("Quantidade_Acionistas_PJ")),
                              "institucionais": numero(r.get("Quantidade_Acionistas_Investidores_Institucionais")),
                              "circulacao_pct": numero(r.get("Percentual_Total_Acoes_Circulacao")),
                              "acoes_circulacao": numero(r.get("Quantidade_Total_Acoes_Circulacao")),
                              "ultima_assembleia": r.get("Data_Ultima_Assembleia")}
        # empregados (a partir do FRE 2023)
        tot = 0
        for r in linhas_dict(aj, "empregado_posicao_local"):
            tot += sum(numero(r.get(c)) or 0 for c in ("Quantidade_Norte", "Quantidade_Nordeste", "Quantidade_Centro_Oeste", "Quantidade_Sudeste", "Quantidade_Sul", "Quantidade_Exterior"))
        if tot:
            emp[aj["ano"]] = {"ano_fre": aj["ano"], "empregados": tot}
    ordena = lambda d: [d[k] for k in sorted(d, key=str)]  # noqa: E731
    return {"remuneracao": ordena(rem), "dividendos": ordena(div), "capital": ordena(cap), "acionistas": ordena(acc), "empregados": ordena(emp)}


def gravar_json(caminho, obj, compacto=False):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        if compacto:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def principal(args):
    raiz = args.saida or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pasta, pasta_logs = os.path.join(raiz, "data", "fre"), os.path.join(raiz, "logs")
    os.makedirs(pasta_logs, exist_ok=True)
    log = ["# Atualização do Formulário de Referência (CVM)", "", f"Execução (UTC): {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M:%S}", ""]
    codigo = 0
    try:
        hoje = dt.date.today()
        local = os.environ.get("CVM_LOCAL_DIR")
        anos = args.anos or list(range(ANO_INICIAL, hoje.year + 1))
        for ano in anos:
            destino_json = os.path.join(pasta, f"{ano}.json")
            if os.path.exists(destino_json) and not (args.completo or args.anos or ano >= hoje.year - 1):
                continue
            nome = f"fre_cia_aberta_{ano}.zip"
            with tempfile.TemporaryDirectory() as tmp:
                if local:
                    caminho = os.path.join(local, nome)
                    if not os.path.exists(caminho):
                        log.append(f"- {ano}: arquivo local inexistente")
                        continue
                else:
                    caminho = os.path.join(tmp, nome)
                    if not baixar(f"https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/{nome}", caminho):
                        log.append(f"- {ano}: não publicado na CVM (404)")
                        continue
                aj = extrair_ano(caminho, ano)
            if not aj["documentos"]:
                log.append(f"- {ano}: sem formulário da Vibra")
                if os.path.exists(destino_json):
                    os.remove(destino_json)
                continue
            gravar_json(destino_json, aj, compacto=True)
            log.append(f"- {ano}: {len(aj['documentos'])} documento(s), última versão v{aj['documentos'][-1]['versao']} "
                       f"(recebida em {aj['documentos'][-1]['dt_receb']}); {len(aj['tabelas'])} tabelas")
        anos_json = []
        for nome in sorted(os.listdir(pasta)):
            if re.fullmatch(r"\d{4}\.json", nome):
                with open(os.path.join(pasta, nome), encoding="utf-8") as f:
                    anos_json.append(json.load(f))
        if not anos_json:
            raise RuntimeError("nenhum formulário de referência da Vibra encontrado")
        indice = {"gerado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                  "nomes_tabelas": NOMES,
                  "anos": [{"ano": a["ano"], "documentos": a["documentos"],
                            "tabelas": {t: len(v["linhas"]) for t, v in a["tabelas"].items()}} for a in sorted(anos_json, key=lambda x: x["ano"])]}
        gravar_json(os.path.join(pasta, "indice.json"), indice)
        series = montar_series(anos_json)
        gravar_json(os.path.join(raiz, "data", "fre_series.json"), series)
        log += ["", "## Séries", *(f"- {k}: {len(v)} registros" for k, v in series.items())]
    except Exception:  # noqa: BLE001
        log += ["", "## ERRO", "```", traceback.format_exc(), "```"]
        codigo = 1
    with open(os.path.join(pasta_logs, "fre-ultima-execucao.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(log) + "\n")
    print("\n".join(log))
    return codigo


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--completo", action="store_true")
    ap.add_argument("--anos", type=int, nargs="*")
    ap.add_argument("--saida")
    sys.exit(principal(ap.parse_args()))
