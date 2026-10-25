"""MD&A redigido: integra os números das demonstrações e as explicações da Companhia num texto único.

Entrada:
  data/mda_fatos.json      números de cada par de períodos (calculados com o motor do painel), já formatados
  data/releases_texto.json parágrafos dos releases por tema (explicações da Companhia)
  data/fre_item10.json     item 10 do Formulário de Referência (comentários dos diretores)
Saída:
  data/mda_ia.json         texto aprovado por par de períodos; logs/mda-ia.md

Modelo: Claude (API da Anthropic), com a chave no segredo ANTHROPIC_API_KEY do repositório. Sem a chave, nada é feito
e o painel usa o texto por regras. (O GitHub Models, usado na primeira versão, foi descontinuado pelo GitHub em 30/07/2026.)

Trava de publicação, por par:
  - todo valor em R$ do texto tem de estar entre os números fornecidos;
  - todo outro número (percentual, volume, dias, múltiplo) tem de estar nos números fornecidos ou nos trechos da Companhia;
  - sem aspas ou citação literal. Se falhar, uma nova tentativa com a lista dos números recusados; se falhar de novo,
    o par fica sem texto redigido e o painel usa o texto por regras.
"""
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://api.anthropic.com/v1/messages"
MODELO = os.environ.get("MDA_IA_MODELO", "claude-sonnet-5-5")
MAX_POR_EXECUCAO = int(os.environ.get("MDA_IA_MAX", "12"))
SO_PARES = [p for p in os.environ.get("MDA_IA_PARES", "").split(",") if p]
REFAZER = os.environ.get("MDA_IA_REFAZER", "") == "1"
VERSAO_PROMPT = 6   # mudar força a reescrita de todos os pares

SECOES = [("sumario", "Sumário executivo", ["MSG"]),
          ("operacional", "Desempenho operacional", ["REDE", "B2B", "REN"]),
          ("resultado", "Resultado", ["CONS", "FIN", "LUCRO"]),
          ("balanco", "Balanço, capital de giro e endividamento", ["DIV"]),
          ("caixa", "Fluxo de caixa", ["CAIXA", "CAPEX"]),
          ("perspectivas", "Visão da administração", ["MSG"])]

INSTRUCOES = """Você redige o Comentário do Desempenho (MD&A) da Vibra Energia S.A. em português do Brasil, no tom de um relatório da administração: terceira pessoa ("a Companhia"), frases claras, parágrafos curtos, sem adjetivos promocionais. O texto deve ser completo e analítico: explicar a formação do desempenho, dos fluxos de caixa e da estrutura de capital, como um relatório único.

Regras obrigatórias:
1. NÚMEROS: use somente os números da lista FATOS, escritos exatamente como aparecem lá (pode escolher a forma em milhões ou em bilhões quando as duas forem dadas). Não calcule, não arredonde de outro jeito e não crie números novos. Valores em R$ dos TRECHOS DA COMPANHIA não podem ser usados (eles podem seguir conceitos diferentes das demonstrações).
2. EXPLICAÇÕES E EVENTOS: explique as variações e qualifique os eventos importantes do período (contexto de mercado, decisões estratégicas, aquisições, efeitos não recorrentes, captações e amortizações de dívida, distribuição de proventos, investimentos) usando apenas o que está nos TRECHOS DA COMPANHIA e nos EVENTOS DO PERÍODO. Siga a mensagem central (o "pitch") do release, mas sem tom promocional. Não invente causas nem eventos. Quando não houver explicação verificável para uma variação, descreva-a e contextualize-a com os próprios números (por exemplo, composição por segmento, efeito de preço e volume, peso no total), sem atribuir causa.
3. ESCOPO DA COMPARAÇÃO: as explicações dos trechos podem se referir a outra comparação (por exemplo, trimestre contra trimestre anterior, ou só o último trimestre de um semestre). Use-as apenas quando se aplicarem à comparação em análise; se a explicação for de um trimestre dentro do período, diga isso explicitamente.
4. Integre números e explicações no mesmo parágrafo. Não cite documentos, não use aspas, não escreva "segundo o release" nem "de acordo com o Formulário de Referência". Nunca comente a ausência de explicação, os trechos, as fontes ou a verificabilidade (evite frases como "não há causa verificável" ou "os trechos não trazem"): quando não houver causa, apenas descreva e contextualize a variação, como faria um relatório da administração.
5. Cada variação deve indicar a comparação ("frente ao {B}"). A margem por m³ da distribuição exclui Renováveis. O EBITDA Ajustado é o da nota de informações por segmento. A dívida líquida é a divulgada pela Companhia.
6. Se um fato tiver o campo "atencao", siga a orientação dele.
7. Entregue o texto chamando obrigatoriamente a ferramenta registrar_mda (não escreva o texto fora dela), com as seções: sumario (contexto, pitch e principais números), operacional (volumes, EBITDA e margens por segmento), resultado (da receita ao lucro), balanco (dívida, alavancagem, capital de giro, patrimônio e eventos de estrutura de capital), caixa (geração, investimentos, proventos e destino do caixa) e perspectivas (visão da administração; lista vazia se os trechos não a trouxerem). Use de 2 a 4 parágrafos por seção, exceto perspectivas."""


def ler(nome):
    try:
        return json.load(open(os.path.join(RAIZ, "data", nome), encoding="utf-8"))
    except (OSError, ValueError):
        return None


def corta(t, n):
    """Até n caracteres, terminando numa frase completa."""
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) <= n:
        return t
    c = t[:n]
    i = max(c.rfind(". "), c.rfind("; "))
    return c[:i + 1] if i > n * 0.4 else c.rsplit(" ", 1)[0] + "…"


def trechos(par, rel, fre):
    A = par["A"]
    tri = (rel or {}).get("trimestres", {}).get(A["p"], {})
    temas = tri.get("temas", {})
    blocos, vistos = {}, set()
    for sid, _, ts in SECOES:
        ps = []
        for t in ts:
            for p in temas.get(t, [])[:3]:
                k = p[:80]
                if k in vistos and sid != "perspectivas":
                    continue
                vistos.add(k)
                ps.append(corta(p, 650))
        blocos[sid] = ps
    # exercício: comentários dos diretores no FRE do ano seguinte (comenta o exercício anterior)
    if par["tipo"] == "exercicio" and fre:
        ano = 2000 + int(A["p"][2:])
        f = (fre.get("anos") or {}).get(str(ano + 1))
        if f and f.get("subitens"):
            for k, sid in (("a", "sumario"), ("c", "balanco"), ("f", "balanco"), ("h", "resultado")):
                ps = (f["subitens"].get(k) or {}).get("paragrafos") or []
                bons = [p for p in ps if ("31 de dezembro de %d" % ano) in p or len(ps) <= 2][:2]
                blocos[sid] += [corta(p, 650) for p in bons]
    total = 0
    for sid in blocos:   # limite de tamanho do pedido
        out = []
        for p in blocos[sid]:
            if total + len(p) > 11000:
                break
            out.append(p); total += len(p)
        blocos[sid] = out
    return blocos, tri.get("release"), tri.get("link")


def eventos(par, ipe, data_release):
    """Fatos relevantes e comunicados entregues entre o início do período e a divulgação do release."""
    A = par["A"]; ano = 2000 + int(A["p"][2:]); q = int(A["p"][0])
    n = {"T": 1, "S": 2, "9M": 3, "AN": 4}.get(A["base"], 1)
    q0 = q - n + 1
    ini = "%d-%02d-01" % (ano, (q0 - 1) * 3 + 1)
    fim = data_release or "%d-%02d-31" % (ano, q * 3)
    out = []
    for d in (ipe or {}).get("documentos", []):
        if d.get("categoria") in ("Fato Relevante", "Comunicado ao Mercado") and ini <= (d.get("data_entrega") or "") <= fim and d.get("assunto"):
            out.append("%s — %s: %s" % (d["data_entrega"], d["categoria"], d["assunto"]))
    out = sorted(set(out))
    fr = [e for e in out if "Fato Relevante" in e]
    cm = [e for e in out if "Fato Relevante" not in e][-max(0, 25 - len(fr)):] if len(fr) < 25 else []
    return sorted(fr[-25:] + cm)


def fatos_txt(par):
    linhas = []
    for f in par["fatos"]:
        d = {"secao": f["secao"], "fato": f["rotulo"], par["A"]["curto"]: " ou ".join(f["a"])}
        if f.get("b"):
            d[par["B"]["curto"]] = " ou ".join(f["b"])
        if f.get("variacao"):
            d["variacao"] = f["variacao"]
        if f.get("diferenca"):
            d["diferenca"] = " ou ".join(f["diferenca"])
        if f["id"] == "outras" and f.get("variacao") is None:
            d["atencao"] = "linha que mudou de sinal: descreva os dois valores, sem percentual"
        if f["id"] == "prov" and f.get("valor_a") == 0:
            d["atencao"] = "não houve pagamento no período"
        linhas.append(d)
    return json.dumps(linhas, ensure_ascii=False)


# ---------- trava de números ----------
RX_NUM = re.compile(r"(R\$\s?)?[−-]?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)")


def limpa_rotulos(t):
    t = re.sub(r"\b[1-4][TS]\d{2}\b|\b9M\d{2}\b|\b(19|20)\d{2}\b", " ", t)
    t = re.sub(r"\b\d+[ºª]", " ", t)
    t = re.sub(r"\b\d{1,2}/\d{1,2}(/\d{2,4})?\b", " ", t)
    t = re.sub(r"\b\d{1,2} de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b", " ", t, flags=re.I)
    return t


def numeros(t):
    for m in RX_NUM.finditer(limpa_rotulos(t)):
        yield bool(m.group(1)), m.group(2)


def permitidos(par, blocos):
    """(valores em R$ dos fatos, demais números dos fatos, números dos trechos que não são R$)."""
    rs_fat, fat, exc = set(), set(), set()
    for f in par["fatos"]:
        for campo in ("a", "b", "diferenca"):
            for s in f.get(campo) or []:
                for rs, n in numeros(s):
                    (rs_fat if rs else fat).add(n)
        if f.get("variacao"):
            fat |= {n for _, n in numeros(f["variacao"])}
    for ps in blocos.values():
        for p in ps:
            exc |= {n for rs, n in numeros(p) if not rs}
    return rs_fat, fat, exc


def confere(secoes, rs_fat, fat, exc):
    recusados = []
    for sid, ps in secoes.items():
        for p in ps:
            if re.search(r"[“”\"]", p):
                recusados.append("aspas em %s" % sid)
            for rs, n in numeros(p):
                if rs:
                    if n not in rs_fat:
                        recusados.append("R$ " + n)
                    continue
                if n in fat or n in exc or n in rs_fat:
                    continue
                if not rs and n in {"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12"}:
                    continue   # contagens pequenas ("três segmentos", "12 meses")
                recusados.append(n)
    return recusados


FERRAMENTA = {
    "name": "registrar_mda",
    "description": "Registra o texto do MD&A, um parágrafo por item de cada lista.",
    "input_schema": {"type": "object", "properties": {k: {"type": "array", "items": {"type": "string"}} for k, _, _ in SECOES},
                     "required": [k for k, _, _ in SECOES]},
}


def chama(mensagens):
    """mensagens: [{"role": "system"|"user"|"assistant", "content": str}] → dict com as seções.
    A resposta vem por "ferramenta" (tool use), o que garante JSON válido."""
    sistema = "\n".join(m["content"] for m in mensagens if m["role"] == "system")
    conversa = [m for m in mensagens if m["role"] != "system" and m["content"]]
    corpo = json.dumps({"model": MODELO, "max_tokens": 12000, "system": sistema, "messages": conversa,
                        "tools": [FERRAMENTA], "tool_choice": {"type": "auto"}}).encode()
    req = urllib.request.Request(URL, data=corpo, headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
                                                           "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        bruto = r.read().decode("utf-8", "ignore")
    j = json.loads(bruto)
    if j.get("stop_reason") == "max_tokens":
        raise RuntimeError("resposta cortada pelo limite de tamanho")
    for b in j.get("content", []):
        if b.get("type") == "tool_use" and b.get("name") == "registrar_mda":
            return b.get("input") or {}
    # sem a ferramenta: aceita o JSON escrito no texto (tolerante a quebras de linha dentro das frases)
    txt = "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text").strip()
    txt = re.sub(r"^```(?:json)?\s*|\s*```$", "", txt)
    i, k = txt.find("{"), txt.rfind("}")
    if i >= 0 and k > i:
        try:
            return json.loads(txt[i:k + 1], strict=False)
        except ValueError:
            pass
    raise RuntimeError("resposta sem o texto estruturado: %r … %r" % (txt[:200], txt[-200:]))


def main():
    agora = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(os.path.join(RAIZ, "logs"), exist_ok=True)
    try:
        os.remove(os.path.join(RAIZ, "logs", "mda-ia-alerta.md"))
    except OSError:
        pass
    log = ["# MD&A redigido — %s" % agora, "", "Modelo: %s" % MODELO, ""]
    fatos = ler("mda_fatos.json")
    if not fatos or not os.environ.get("ANTHROPIC_API_KEY"):
        print("mda_ia: sem fatos ou sem a chave ANTHROPIC_API_KEY; o painel usa o texto por regras")
        return 0
    rel, fre, ipe = ler("releases_texto.json"), ler("fre_item10.json"), ler("ipe.json")
    est = ler("mda_ia.json") or {"pares": {}, "recusados": {}}
    ordem = sorted(fatos["pares"].items(), key=lambda kv: (-(int(kv[1]["A"]["p"][2:]) * 4 + int(kv[1]["A"]["p"][0])),
                                                          {"anual": 0, "exercicio": 1, "semestre": 2, "nove_meses": 3, "trimestral": 4}.get(kv[1]["tipo"], 9)))
    # reconfere os textos já aprovados com os números atuais (reapresentações): se não baterem, saem até serem refeitos
    for k in list(est["pares"]):
        par = fatos["pares"].get(k)
        if not par:
            continue
        bl, _, _ = trechos(par, rel, fre)
        evs = eventos(par, ipe, (rel or {}).get("trimestres", {}).get(par["A"]["p"], {}).get("data"))
        if evs:
            bl["eventos"] = evs
        r_ = confere(est["pares"][k]["secoes"], *permitidos(par, bl))
        if r_:
            log.append("- %s: texto aprovado anteriormente não confere mais com os números atuais (%s); retirado" % (k, ", ".join(sorted(set(r_))[:5])))
            del est["pares"][k]
    feitos = 0
    for k, par in ordem:
        if SO_PARES and k not in SO_PARES:
            continue
        blocos, rel_nome, rel_link = trechos(par, rel, fre)
        evs = eventos(par, ipe, (rel or {}).get("trimestres", {}).get(par["A"]["p"], {}).get("data"))
        if evs:
            blocos["eventos"] = evs
        h = hashlib.sha256(json.dumps([VERSAO_PROMPT, MODELO, par["fatos"], blocos], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
        if not REFAZER and est["pares"].get(k, {}).get("hash") == h:
            continue
        rec = est["recusados"].get(k)
        if not REFAZER and rec and rec.get("hash") == h and rec.get("tentativas", 1) >= 3 and rec.get("data", "") > (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)).isoformat():
            continue   # três recusas seguidas: espera uma semana (ou mudança nos dados) para tentar de novo
        if feitos >= MAX_POR_EXECUCAO:
            break
        feitos += 1
        rs_fat, fat, exc = permitidos(par, blocos)
        trechos_txt = "\n".join("[%s]\n%s" % (sid, "\n".join("- " + p for p in ps)) for sid, ps in blocos.items() if ps and sid != "eventos") or "(sem trechos para este período)"
        if blocos.get("eventos"):
            trechos_txt += "\n\nEVENTOS DO PERÍODO (fatos relevantes e comunicados ao mercado; use para contextualizar, sem inventar detalhes):\n" + "\n".join("- " + e for e in blocos["eventos"])
        usuario = ("PERÍODO: %s, comparado com o %s.\n\nFATOS (únicos números permitidos):\n%s\n\nTRECHOS DA COMPANHIA (explicações; não use os valores em R$ daqui):\n%s"
                   % (par["A"]["rotulo"], par["B"]["rotulo"], fatos_txt(par), trechos_txt))
        msgs = [{"role": "system", "content": INSTRUCOES.replace("{B}", par["B"]["rotulo"])}, {"role": "user", "content": usuario}]
        secoes, recusados, txt = None, ["sem resposta"], ""
        for tentativa in range(2):
            try:
                bruto = chama(msgs)
                txt = json.dumps(bruto, ensure_ascii=False)
                secoes = {sid: [re.sub(r"(R\$ 1,\d) bilhões", r"\1 bilhão", p.strip()) for p in (bruto.get(sid) or []) if isinstance(p, str) and p.strip()] for sid, _, _ in SECOES}
                recusados = confere(secoes, rs_fat, fat, exc)
                if not secoes["resultado"] or not secoes["sumario"]:
                    recusados.append("seções obrigatórias vazias")
            except urllib.error.HTTPError as e:
                corpo_erro = e.read().decode("utf-8", "ignore")[:400]
                recusados = ["HTTP %d: %s" % (e.code, corpo_erro[:300])]
                if re.search(r"credit balance|billing|insufficient", corpo_erro, re.I) or e.code in (401, 403):
                    motivo = "o crédito da API da Anthropic acabou" if re.search(r"credit|billing|insufficient", corpo_erro, re.I) else "a chave da API foi recusada (HTTP %d)" % e.code
                    open(os.path.join(RAIZ, "logs", "mda-ia-alerta.md"), "w", encoding="utf-8").write(
                        "A redação automática do MD&A parou: %s.\n\nEnquanto isso, o painel mostra o texto por regras (números conferidos, sem as explicações redigidas).\n"
                        "Para retomar: em platform.claude.com, adicione crédito (Gerenciar créditos) ou gere uma nova chave e atualize o segredo ANTHROPIC_API_KEY do repositório.\n\nDetalhe: %s\n" % (motivo, corpo_erro))
                    log.append("- " + motivo + "; redação suspensa nesta execução")
                    feitos = MAX_POR_EXECUCAO
                    break
                if e.code == 429:
                    log.append("- limite de uso da API atingido; continua na próxima atualização")
                    feitos = MAX_POR_EXECUCAO
                    break
            except Exception as e:  # noqa: BLE001
                recusados = [type(e).__name__ + ": " + str(e)[:400]]
            if not recusados:
                break
            msgs = msgs + [{"role": "assistant", "content": txt if secoes else ""},
                           {"role": "user", "content": "Os seguintes números não estão na lista FATOS (ou são valores em R$ dos trechos) e não podem ser usados: %s. "
                                                        "Reescreva o JSON completo sem eles, usando só números da lista FATOS." % ", ".join(sorted(set(recusados)))}]
            time.sleep(5)
        if recusados:
            ant = est["recusados"].get(k) or {}
            est["recusados"][k] = {"hash": h, "data": agora, "motivo": sorted(set(recusados))[:20],
                                   "tentativas": (ant.get("tentativas", 1) + 1) if ant.get("hash") == h else 1}
            log.append("- %s: RECUSADO (%s)" % (k, ", ".join(sorted(set(recusados))[:10])))
        else:
            est["pares"][k] = {"hash": h, "gerado_em": agora, "modelo": MODELO, "tipo": par["tipo"], "secoes": secoes,
                               "release": rel_nome, "release_link": rel_link}
            est["recusados"].pop(k, None)
            log.append("- %s: ok" % k)
        time.sleep(15)   # limite de tokens por minuto da API
    est["atualizado_em"] = agora
    est["liberado"] = True   # estilo aprovado por Luís em 24/10/2026 (referência: 2T26 × 2T25); o painel mostra os textos aprovados pela trava
    json.dump(est, open(os.path.join(RAIZ, "data", "mda_ia.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log.append("")
    log.append("%d pares com texto aprovado; %d recusados." % (len(est["pares"]), len(est["recusados"])))
    os.makedirs(os.path.join(RAIZ, "logs"), exist_ok=True)
    open(os.path.join(RAIZ, "logs", "mda-ia.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))
    return 0


if __name__ == "__main__":
    sys.exit(main())
