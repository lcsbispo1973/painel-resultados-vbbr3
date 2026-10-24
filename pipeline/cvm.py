#!/usr/bin/env python3
"""Baixa as demonstrações consolidadas (DFP e ITR) da Vibra nos Dados Abertos da CVM,
monta séries trimestrais em R$ milhões (DRE, balanço e fluxo de caixa) e roda
conferências de fechamento. Usa apenas a biblioteca padrão do Python.

Uso:
  python pipeline/cvm.py                 # atualiza os 2 últimos anos e os anos que faltam no cache
  python pipeline/cvm.py --completo      # refaz todos os anos
  python pipeline/cvm.py --anos 2025 2026
  python pipeline/cvm.py --saida DIR     # grava data/ e logs/ em outro diretório (testes)
Variável CVM_LOCAL_DIR: lê os .zip de uma pasta local em vez de baixar (testes).
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict

CNPJ = "34.274.233/0001-02"
ANO_INICIAL = 2016
TOL = 2.0  # tolerância de arredondamento, em R$ milhões
DEMOS = {"DRE": "DRE_con", "BPA": "BPA_con", "BPP": "BPP_con", "DFC": "DFC_MI_con",
         "DVA": "DVA_con", "DRA": "DRA_con", "DMPL": "DMPL_con"}
COLUNAS_RAW = ["tipo", "demo", "ano", "DT_REFER", "VERSAO", "ESCALA_MOEDA", "ORDEM_EXERC",
               "DT_INI_EXERC", "DT_FIM_EXERC", "CD_CONTA", "DS_CONTA", "VL_CONTA", "ST_CONTA_FIXA", "COLUNA_DF"]
COLUNAS_ACOES = ["tipo", "ano", "DT_REFER", "VERSAO", "ON", "PN", "TOTAL", "ON_TESOURO", "PN_TESOURO", "TOTAL_TESOURO"]
SALDO_INI, SALDO_FIM = "6.05.01", "6.05.02"

# Valores já conferidos nos releases de resultados (R$ milhões), usados só como teste cruzado.
REFERENCIA_RELEASE = {
    "dre": {
        # Na CVM a conta 3.01 inclui a marcação a mercado do trading de energia, que o release mostra em linha separada.
        # Valor esperado = receita do release + marcação a mercado (1T25: 44.906 - 47; 3T25: 48.423 - 78; 4T25: 50.318 + 8; 1T26: 48.100 - 96).
        "3.01": {"3T24": 46271, "4T24": 44293, "1T25": 44859, "3T25": 48345, "4T25": 50326, "1T26": 48004},
        "3.11": {"3T24": 4201, "4T24": 510, "1T25": 601, "2T25": 292, "3T25": 407, "4T25": 679, "1T26": 1613},
    },
    "bp": {
        "1": {"4T24": 49000, "1T25": 62234, "3T25": 60987, "4T25": 60963, "1T26": 64225},
        "1.01.01": {"4T24": 10480, "1T25": 5473, "3T25": 5936, "4T25": 3647, "1T26": 5107},
    },
    "dfc": {
        # Fluxo de caixa operacional (6.01) do release = DFC da CVM, exceto 1T26 (diferença conhecida de 738, ver README).
        "6.01": {"1T25": 945, "2T25": 808, "3T25": 3508, "4T25": 1405},
        "6.02": {"1T25": -3379, "2T25": -259, "3T25": -274, "4T25": -230, "1T26": -174},
    },
}
NOME_DEMO = {"dre": "DRE", "bp": "Balanço", "dfc": "Fluxo de caixa"}


# ----------------------------------------------------------------------------- utilidades
def rotulo(d):
    return f"{(d.month - 1) // 3 + 1}T{d.year % 100:02d}"


def ordem_periodo(p):
    return (int(p[2:]), int(p[0]))


def chave_conta(cd):
    return [int(x) if x.isdigit() else 0 for x in cd.split(".")]


def para_data(s):
    return dt.datetime.strptime(s.strip()[:10], "%Y-%m-%d").date()


def para_numero(s):
    s = (s or "").strip()
    if not s:
        return 0.0
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    return float(s)


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


# ----------------------------------------------------------------------------- coleta e cache
def extrair_zip(caminho, tipo, ano, pasta_raw, log):
    contagem = {}
    with zipfile.ZipFile(caminho) as zf:
        for demo, sufixo in DEMOS.items():
            nomes = [n for n in zf.namelist() if f"_{sufixo}_" in n and n.lower().endswith(".csv")]
            linhas = []
            for n in nomes:
                with zf.open(n) as bruto:
                    leitor = csv.DictReader(io.TextIOWrapper(bruto, encoding="latin-1", newline=""), delimiter=";")
                    for r in leitor:
                        if r.get("CNPJ_CIA", "").strip() != CNPJ:
                            continue
                        linhas.append({"tipo": tipo, "demo": demo, "ano": ano, **{k: r.get(k, "") for k in COLUNAS_RAW[3:]}})
            with open(os.path.join(pasta_raw, f"{tipo}_{demo}_{ano}.csv"), "w", encoding="utf-8", newline="") as f:
                w = csv.DictWriter(f, fieldnames=COLUNAS_RAW)
                w.writeheader()
                w.writerows(linhas)
            contagem[demo] = len(linhas)
        nomes = [n for n in zf.namelist() if "composicao_capital" in n and n.lower().endswith(".csv")]
        acoes = []
        for n in nomes:
            with zf.open(n) as bruto:
                leitor = csv.DictReader(io.TextIOWrapper(bruto, encoding="latin-1", newline=""), delimiter=";")
                for r in leitor:
                    if r.get("CNPJ_CIA", "").strip() != CNPJ:
                        continue
                    g = lambda k: (r.get(k) or "").strip()  # noqa: E731
                    acoes.append({"tipo": tipo, "ano": ano, "DT_REFER": g("DT_REFER"), "VERSAO": g("VERSAO"),
                                  "ON": g("QT_ACAO_ORDIN_CAP_INTEGR"), "PN": g("QT_ACAO_PREF_CAP_INTEGR"),
                                  "TOTAL": g("QT_ACAO_TOTAL_CAP_INTEGR"), "ON_TESOURO": g("QT_ACAO_ORDIN_TESOURO"),
                                  "PN_TESOURO": g("QT_ACAO_PREF_TESOURO"), "TOTAL_TESOURO": g("QT_ACAO_TOTAL_TESOURO")})
        with open(os.path.join(pasta_raw, f"{tipo}_ACOES_{ano}.csv"), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLUNAS_ACOES)
            w.writeheader()
            w.writerows(acoes)
        contagem["ações"] = len(acoes)
    log.append(f"- {tipo} {ano}: linhas da Vibra por demonstração: {contagem}")


def coletar(anos_forcados, completo, pasta_raw, log):
    os.makedirs(pasta_raw, exist_ok=True)
    hoje = dt.date.today()
    todos = list(range(ANO_INICIAL, hoje.year + 1))
    recentes = {hoje.year, hoje.year - 1}
    local = os.environ.get("CVM_LOCAL_DIR")
    for tipo in ("DFP", "ITR"):
        for ano in todos if not anos_forcados else anos_forcados:
            faltam = not all(os.path.exists(os.path.join(pasta_raw, f"{tipo}_{d}_{ano}.csv")) for d in DEMOS)
            if not (completo or anos_forcados or faltam or ano in recentes):
                continue
            nome = f"{tipo.lower()}_cia_aberta_{ano}.zip"
            if local:
                caminho = os.path.join(local, nome)
                if not os.path.exists(caminho):
                    log.append(f"- {tipo} {ano}: arquivo local inexistente")
                    continue
                extrair_zip(caminho, tipo, ano, pasta_raw, log)
                continue
            url = f"https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/{tipo}/DADOS/{nome}"
            with tempfile.TemporaryDirectory() as tmp:
                destino = os.path.join(tmp, nome)
                if not baixar(url, destino):
                    log.append(f"- {tipo} {ano}: não publicado na CVM (404)")
                    continue
                extrair_zip(destino, tipo, ano, pasta_raw, log)


def carregar_linhas(pasta_raw):
    brutas = []
    for nome in sorted(os.listdir(pasta_raw)):
        if not nome.endswith(".csv") or "_ACOES_" in nome:
            continue
        with open(os.path.join(pasta_raw, nome), encoding="utf-8", newline="") as f:
            brutas.extend(csv.DictReader(f))
    versao_max = defaultdict(int)
    for r in brutas:
        k = (r["tipo"], r["demo"], r["DT_REFER"])
        versao_max[k] = max(versao_max[k], int(r["VERSAO"] or 0))
    linhas, comparativos = [], {}
    for r in brutas:
        k = (r["tipo"], r["demo"], r["DT_REFER"])
        if int(r["VERSAO"] or 0) != versao_max[k]:
            continue
        escala = {"MIL": 1e3, "UNIDADE": 1.0}.get(r["ESCALA_MOEDA"].strip().upper(), 1.0)
        ordem = r["ORDEM_EXERC"].upper()
        pen = "PEN" in ordem and "ANTE" not in ordem
        item = {
            "tipo": r["tipo"], "demo": r["demo"], "ref": para_data(r["DT_REFER"]),
            "ini": para_data(r["DT_INI_EXERC"]) if r["DT_INI_EXERC"].strip() else None,
            "fim": para_data(r["DT_FIM_EXERC"]), "ultimo": "LTIMO" in ordem and "PEN" not in ordem,
            "cd": r["CD_CONTA"].strip(), "ds": r["DS_CONTA"].strip(),
            "fixa": r["ST_CONTA_FIXA"].strip().upper() == "S",
            "col": (r.get("COLUNA_DF") or "").strip(),
            "val": para_numero(r["VL_CONTA"]) * escala / 1e6,
        }
        if item["cd"].startswith("3.99"):  # lucro por ação já vem em R$ por ação, sem escala
            item["val"] = para_numero(r["VL_CONTA"])
        if item["ultimo"]:
            linhas.append(item)
        elif pen and item["demo"] not in ("DMPL",):
            # comparativo do exercício anterior: só será usado onde não existe demonstração própria
            chave = (item["demo"], item["ini"], item["fim"], item["cd"], item["col"])
            if chave not in comparativos or comparativos[chave]["ref"] < item["ref"]:
                comparativos[chave] = item
    proprios = {(r["demo"], r["ini"], r["fim"]) for r in linhas}
    for item in comparativos.values():
        if (item["demo"], item["ini"], item["fim"]) in proprios:
            continue
        linhas.append({**item, "ref": item["fim"], "ultimo": True, "comparativo": True})
    return linhas


def carregar_acoes(pasta_raw):
    """Quantidade de ações por data de referência (DFP/ITR, arquivo composicao_capital)."""
    por_data = {}
    for nome in sorted(os.listdir(pasta_raw)):
        if "_ACOES_" not in nome or not nome.endswith(".csv"):
            continue
        with open(os.path.join(pasta_raw, nome), encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                if not r["DT_REFER"]:
                    continue
                k = para_data(r["DT_REFER"])
                v = int(r["VERSAO"] or 0)
                if k in por_data and por_data[k][0] > v:
                    continue
                # a CVM informa a composição do capital em milhares de ações
                num = lambda c: float(r[c].replace(",", ".")) * 1000 if r.get(c, "").strip() else None  # noqa: E731
                tot = num("TOTAL")
                if tot is None and num("ON") is not None:
                    tot = (num("ON") or 0) + (num("PN") or 0)
                tes = num("TOTAL_TESOURO")
                if tes is None and num("ON_TESOURO") is not None:
                    tes = (num("ON_TESOURO") or 0) + (num("PN_TESOURO") or 0)
                por_data[k] = (v, {"total": tot, "tesouro": tes})
    res = {rotulo(d): v for d, (_, v) in por_data.items() if v["total"]}
    return {p: res[p] for p in sorted(res, key=ordem_periodo)}


# ----------------------------------------------------------------------------- séries trimestrais
def descricoes(linhas):
    desc = {}
    for r in sorted(linhas, key=lambda x: x["ref"]):
        desc[r["cd"]] = (r["ds"], r["fixa"])
    return desc


def serie_dre(linhas):
    trimestre, ytd = defaultdict(dict), defaultdict(dict)
    for r in linhas:
        if not r["ultimo"] or r["fim"] != r["ref"] or r["ini"] is None:
            continue
        dur = (r["fim"] - r["ini"]).days + 1
        if 85 <= dur <= 95:
            trimestre[r["fim"]][r["cd"]] = r["val"]
        if r["ini"].month == 1 and r["ini"].day == 1:
            ytd[r["fim"]][r["cd"]] = r["val"]
    res = {rotulo(d): dict(v) for d, v in trimestre.items()}
    for d, anual in ytd.items():
        if d.month == 12 and d.day == 31:
            nove = ytd.get(dt.date(d.year, 9, 30))
            if nove is None:
                continue
            res[rotulo(d)] = {cd: anual.get(cd, 0.0) - nove.get(cd, 0.0)
                              for cd in set(anual) | set(nove) if not cd.startswith("3.99")}
    return res


def serie_bp(linhas):
    res = defaultdict(dict)
    for r in linhas:
        if r["ultimo"] and r["fim"] == r["ref"]:
            res[rotulo(r["fim"])][r["cd"]] = r["val"]
    return dict(res)


def serie_dfc(linhas, log):
    ytd = defaultdict(dict)
    for r in linhas:
        if r["ultimo"] and r["fim"] == r["ref"] and r["ini"] and r["ini"].month == 1 and r["ini"].day == 1:
            ytd[(r["fim"].year, r["fim"].month)][r["cd"]] = r["val"]
    res = {}
    for (ano, mes), vals in sorted(ytd.items()):
        anterior = ytd.get((ano, mes - 3))
        if mes > 3 and anterior is None:
            log.append(f"- DFC {ano}: sem acumulado de {mes - 3:02d}/{ano}; trimestre de {mes:02d}/{ano} não calculado")
            continue
        saida = {}
        for cd, v in vals.items():
            if cd == SALDO_INI:
                continue
            saida[cd] = v if cd == SALDO_FIM else v - (anterior.get(cd, 0.0) if anterior else 0.0)
        ini = vals.get(SALDO_INI) if mes == 3 else (anterior.get(SALDO_FIM) if anterior else None)
        if ini is not None:
            saida[SALDO_INI] = ini
        res[rotulo(dt.date(ano, mes, 28))] = saida
    return res


def serie_dmpl(linhas):
    """Mutações do patrimônio líquido (acumulado do ano até cada data), por conta e coluna."""
    cont = {}
    for r in linhas:
        if r["ultimo"] and r["fim"] == r["ref"] and r["ini"]:
            cont[(rotulo(r["fim"]), r["cd"], r["col"])] = (r["ds"], r["val"])
    periodos = sorted({k[0] for k in cont}, key=ordem_periodo)
    colunas = sorted({k[2] for k in cont})
    contas = {}
    for (p, cd, col), (ds, v) in cont.items():
        contas.setdefault(cd, ds)
    return {"unidade": "R$ milhões", "observacao": "acumulado do ano até a data de referência",
            "periodos": periodos, "colunas": colunas,
            "contas": [{"cd_conta": cd, "conta": contas[cd]} for cd in sorted(contas, key=chave_conta)],
            "valores": [[p, cd, col, round(v, 3)] for (p, cd, col), (ds, v) in sorted(
                cont.items(), key=lambda x: (ordem_periodo(x[0][0]), chave_conta(x[0][1]), x[0][2]))]}


def larga(series, desc):
    periodos = sorted(series, key=ordem_periodo)
    cds = sorted({cd for s in series.values() for cd in s}, key=chave_conta)
    linhas = []
    for cd in cds:
        ds, fixa = desc.get(cd, ("", False))
        linha = {"cd_conta": cd, "conta": ds, "nivel": cd.count(".") + 1, "fixa": fixa}
        for p in periodos:
            v = series[p].get(cd)
            linha[p] = None if v is None else round(v, 3)
        linhas.append(linha)
    return {"unidade": "R$ milhões", "periodos": periodos, "linhas": linhas}


# ----------------------------------------------------------------------------- conferências
def conferir(dre, bp, dfc, dva=None, dra=None):
    out = []

    def registrar(demo, teste, p, esperado, reportado):
        if esperado is None or reportado is None:
            status, dif = "sem dados", None
        else:
            dif = round(esperado - reportado, 3)
            status = "ok" if abs(dif) <= TOL else "divergente"
        out.append({"demo": demo, "teste": teste, "periodo": p, "esperado": esperado, "reportado": reportado,
                    "diferenca": dif, "status": status})

    def soma(s, p, cds, opcionais=()):
        v = 0.0
        for cd in cds:
            x = s.get(p, {}).get(cd)
            if x is None:
                if cd in opcionais:
                    continue
                return None
            v += x
        return v

    for p in sorted(dre, key=ordem_periodo):
        g = lambda cd: dre[p].get(cd)  # noqa: E731
        registrar("DRE", "3.01 + 3.02 = 3.03 (resultado bruto)", p, soma(dre, p, ["3.01", "3.02"]), g("3.03"))
        registrar("DRE", "3.03 + 3.04 = 3.05 (resultado antes do financeiro)", p, soma(dre, p, ["3.03", "3.04"]), g("3.05"))
        registrar("DRE", "3.05 + 3.06 = 3.07 (resultado antes dos tributos)", p, soma(dre, p, ["3.05", "3.06"]), g("3.07"))
        registrar("DRE", "3.07 + 3.08 = 3.09 (resultado das operações continuadas)", p, soma(dre, p, ["3.07", "3.08"]), g("3.09"))
        registrar("DRE", "3.09 + 3.10 = 3.11 (lucro do período)", p, soma(dre, p, ["3.09", "3.10"], opcionais=("3.10",)), g("3.11"))
    for p in sorted(bp, key=ordem_periodo):
        g = lambda cd: bp[p].get(cd)  # noqa: E731
        registrar("Balanço", "Ativo total (1) = passivo total (2)", p, g("1"), g("2"))
        registrar("Balanço", "1.01 + 1.02 = 1", p, soma(bp, p, ["1.01", "1.02"]), g("1"))
        registrar("Balanço", "2.01 + 2.02 + 2.03 = 2", p, soma(bp, p, ["2.01", "2.02", "2.03"]), g("2"))
    periodos_dfc = sorted(dfc, key=ordem_periodo)
    for p in periodos_dfc:
        g = lambda cd: dfc[p].get(cd)  # noqa: E731
        registrar("Fluxo de caixa", "6.01 + 6.02 + 6.03 + 6.04 = 6.05", p, soma(dfc, p, ["6.01", "6.02", "6.03", "6.04"], opcionais=("6.04",)), g("6.05"))
        registrar("Fluxo de caixa", "Saldo inicial + variação = saldo final", p, soma(dfc, p, [SALDO_INI, "6.05"]), g(SALDO_FIM))
        if p in bp:
            registrar("Cruzado", "Caixa final do fluxo = caixa do balanço (1.01.01)", p, g(SALDO_FIM), bp[p].get("1.01.01"))
    for a, b in zip(periodos_dfc, periodos_dfc[1:]):
        if ordem_periodo(b) == (ordem_periodo(a)[0] + (1 if a[0] == "4" else 0), 1 if a[0] == "4" else int(a[0]) + 1):
            registrar("Fluxo de caixa", f"Saldo final de {a} = saldo inicial de {b}", b, dfc[b].get(SALDO_INI), dfc[a].get(SALDO_FIM))
    for p in sorted(dva or {}, key=ordem_periodo):
        g = lambda cd: dva[p].get(cd)  # noqa: E731
        registrar("DVA", "7.01 + 7.02 = 7.03 (valor adicionado bruto)", p, soma(dva, p, ["7.01", "7.02"]), g("7.03"))
        registrar("DVA", "7.03 + 7.04 = 7.05 (valor adicionado líquido)", p, soma(dva, p, ["7.03", "7.04"]), g("7.05"))
        registrar("DVA", "7.05 + 7.06 = 7.07 (valor adicionado total a distribuir)", p, soma(dva, p, ["7.05", "7.06"]), g("7.07"))
        registrar("DVA", "7.08 (distribuição) = 7.07 (valor adicionado total)", p, g("7.08"), g("7.07"))
    for p in sorted(dra or {}, key=ordem_periodo):
        g = lambda cd: dra[p].get(cd)  # noqa: E731
        registrar("DRA", "4.01 + 4.02 = 4.03 (resultado abrangente)", p, soma(dra, p, ["4.01", "4.02"]), g("4.03"))
        if p in dre:
            registrar("Cruzado", "Lucro da DRA (4.01) = lucro da DRE (3.11)", p, g("4.01"), dre[p].get("3.11"))
    series = {"dre": dre, "bp": bp, "dfc": dfc}
    for chave, por_conta in REFERENCIA_RELEASE.items():
        for cd, valores in por_conta.items():
            for p, ref in valores.items():
                registrar("Release", f"{NOME_DEMO[chave]} {cd} da CVM = valor do release", p, series[chave].get(p, {}).get(cd), ref)
    return out


# ----------------------------------------------------------------------------- execução
def gravar_json(caminho, obj):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def principal(args):
    raiz = args.saida or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pasta_dados, pasta_logs = os.path.join(raiz, "data"), os.path.join(raiz, "logs")
    log = [f"# Atualização dos dados da CVM", "", f"Execução (UTC): {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M:%S}", "", "## Coleta"]
    os.makedirs(pasta_logs, exist_ok=True)
    try:
        coletar(args.anos, args.completo, os.path.join(pasta_dados, "cvm_raw"), log)
        linhas = carregar_linhas(os.path.join(pasta_dados, "cvm_raw"))
        if not linhas:
            raise RuntimeError("nenhuma linha da Vibra encontrada nos arquivos da CVM (CNPJ ou layout mudou?)")
        por = lambda *demos: [r for r in linhas if r["demo"] in demos]  # noqa: E731
        dre = serie_dre(por("DRE"))
        bp = serie_bp(por("BPA", "BPP"))
        dfc = serie_dfc(por("DFC"), log)
        dva = serie_dfc(por("DVA"), log)
        dra = serie_dre(por("DRA"))
        acoes = carregar_acoes(os.path.join(pasta_dados, "cvm_raw"))
        n_comp = len({(r["demo"], r["fim"]) for r in linhas if r.get("comparativo")})
        log.append(f"- Períodos completados por comparativos do ano seguinte (sem demonstração própria na CVM): {n_comp}")
        gravar_json(os.path.join(pasta_dados, "cvm_dre.json"), larga(dre, descricoes(por("DRE"))))
        gravar_json(os.path.join(pasta_dados, "cvm_balanco.json"), larga(bp, descricoes(por("BPA", "BPP"))))
        gravar_json(os.path.join(pasta_dados, "cvm_fluxo_caixa.json"), larga(dfc, descricoes(por("DFC"))))
        gravar_json(os.path.join(pasta_dados, "cvm_dva.json"), larga(dva, descricoes(por("DVA"))))
        gravar_json(os.path.join(pasta_dados, "cvm_dra.json"), larga(dra, descricoes(por("DRA"))))
        gravar_json(os.path.join(pasta_dados, "cvm_dmpl.json"), serie_dmpl(por("DMPL")))
        gravar_json(os.path.join(pasta_dados, "cvm_acoes.json"), {"unidade": "ações (a CVM informa em milhares; aqui já multiplicado)", "periodos": list(acoes), "valores": acoes})
        testes = conferir(dre, bp, dfc, dva, dra)
        gravar_json(os.path.join(pasta_dados, "cvm_conferencias.json"), testes)
        div = [t for t in testes if t["status"] == "divergente"]
        sem = [t for t in testes if t["status"] == "sem dados"]
        status = {
            "gerado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "periodos": {"dre": sorted(dre, key=ordem_periodo), "balanco": sorted(bp, key=ordem_periodo),
                         "fluxo_caixa": sorted(dfc, key=ordem_periodo), "dva": sorted(dva, key=ordem_periodo),
                         "dra": sorted(dra, key=ordem_periodo), "acoes": list(acoes)},
            "testes": len(testes), "divergentes": len(div), "sem_dados": len(sem), "validado": not div,
        }
        gravar_json(os.path.join(pasta_dados, "cvm_status.json"), status)
        log += ["", "## Cobertura"]
        for k, v in status["periodos"].items():
            log.append(f"- {k}: {len(v)} trimestres ({v[0] if v else '—'} a {v[-1] if v else '—'})")
        log += ["", "## Conferências",
                f"- Testes: {len(testes)} | divergentes: {len(div)} | sem dados: {len(sem)} | validado: {status['validado']}"]
        for t in div[:60]:
            log.append(f"  - DIVERGENTE [{t['demo']}] {t['periodo']}: {t['teste']} — esperado {t['esperado']}, reportado {t['reportado']}, dif. {t['diferenca']}")
        for t in sem[:30]:
            log.append(f"  - sem dados [{t['demo']}] {t['periodo']}: {t['teste']}")
        codigo = 0
    except Exception:  # noqa: BLE001
        log += ["", "## ERRO", "```", traceback.format_exc(), "```"]
        codigo = 1
    with open(os.path.join(pasta_logs, "cvm-ultima-execucao.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(log) + "\n")
    print("\n".join(log))
    return codigo


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--completo", action="store_true")
    ap.add_argument("--anos", type=int, nargs="*")
    ap.add_argument("--saida")
    sys.exit(principal(ap.parse_args()))
