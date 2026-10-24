"""Verifica se os links do painel abrem o documento certo.

Junta todos os endereços que o painel mostra (data/*.json, índices de documentos e links fixos em docs/) e abre cada um:
  ok        resposta 200 com documento (PDF, ZIP, XML ou planilha) ou página da CVM sem mensagem de erro
  quebrado  erro HTTP, falha de conexão ou página de erro da CVM
Saídas: data/links.json (resumo e lista de quebrados) e logs/links.md. Sai com código 0 sempre (o alerta é feito pelo workflow).
"""
import concurrent.futures as cf
import datetime as dt
import glob
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
AMOSTRAS = {}
ERRO_CVM = re.compile(r"(documento n[ãa]o (foi )?encontrado|n[ãa]o foi poss[íi]vel|erro inesperado|acesso negado|p[áa]gina n[ãa]o encontrada|object reference)", re.I)


def coletar():
    links = {}

    def anda(o, origem):
        if isinstance(o, dict):
            for v in o.values():
                if isinstance(v, str) and v.startswith("http"):
                    links.setdefault(v, origem)
                else:
                    anda(v, origem)
        elif isinstance(o, list):
            for v in o:
                anda(v, origem)

    arquivos = glob.glob(os.path.join(RAIZ, "data", "*.json")) + glob.glob(os.path.join(RAIZ, "data", "fre", "indice.json"))
    for f in arquivos:
        if f.endswith("links.json"):
            continue
        try:
            anda(json.load(open(f, encoding="utf-8")), os.path.relpath(f, RAIZ))
        except (OSError, ValueError):
            pass
    for f in glob.glob(os.path.join(RAIZ, "docs", "*.html")) + glob.glob(os.path.join(RAIZ, "docs", "js", "*.js")):
        for u in re.findall(r"https?://[^\s'\"<>)]+", open(f, encoding="utf-8").read()):
            if "w3.org" not in u:
                links.setdefault(u.rstrip(".,;"), os.path.relpath(f, RAIZ))
    return links


def abre(alvo):
    with urllib.request.urlopen(urllib.request.Request(alvo, headers=UA), timeout=60) as r:
        ini = r.read(6000)
        ct = (r.headers.get("Content-Type") or "").lower()
        if ini[:4] == b"%PDF" or ini[:2] == b"PK" or ini[:5] == b"<?xml" or "pdf" in ct or "zip" in ct or "octet" in ct or "excel" in ct:
            return "documento", None
        ini += r.read(200000)
    txt = ini.decode("utf-8", "ignore")
    corpo = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(script|style).*?</\1>", " ", txt))).strip()
    if ERRO_CVM.search(corpo):
        return "erro", corpo[:160]
    return "pagina", corpo[:160]


def testa(url):
    """Abre o link. Se a CVM devolver a página intermediária vazia, tenta de novo (ela costuma entregar o arquivo depois)."""
    alvo = url.replace("http://", "https://", 1)
    ultimo, paginas = None, 0
    for tentativa in range(4):
        try:
            tipo, info = abre(alvo)
            if tipo == "documento":
                return "ok", "documento" if paginas == 0 else "documento após nova tentativa"
            if tipo == "erro":
                return "quebrado", "página de erro da CVM: " + info
            paginas += 1
            AMOSTRAS[url] = info
        except urllib.error.HTTPError as e:
            ultimo = "HTTP %d" % e.code
            if e.code in (404, 410):
                break
        except Exception as e:  # noqa: BLE001
            ultimo = type(e).__name__
        time.sleep(4 * (tentativa + 1))
    if paginas:
        return "ok", "página da CVM sem o arquivo (persistente)"
    return "quebrado", ultimo or "falha"


def main():
    links = coletar()
    res = {}
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        fut = {ex.submit(testa, u): u for u in links}
        for f in cf.as_completed(fut):
            res[fut[f]] = f.result()
    quebrados = sorted([{"url": u, "motivo": m, "origem": links[u]} for u, (s, m) in res.items() if s == "quebrado"], key=lambda x: x["origem"])
    agora = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    tipos = {}
    for s_, m in res.values():
        if s_ == "ok":
            tipos[m] = tipos.get(m, 0) + 1
    paginas = sorted(u for u, (s_, m) in res.items() if s_ == "ok" and m.startswith("página"))
    grupos = {}
    for u in paginas:
        grupos.setdefault(AMOSTRAS.get(u, ""), []).append(u)
    json.dump({"verificado_em": agora, "total": len(res), "ok": len(res) - len(quebrados), "por_tipo": tipos, "paginas": [{"amostra": k, "n": len(v), "exemplo": v[0]} for k, v in sorted(grupos.items(), key=lambda kv: -len(kv[1]))], "quebrados": quebrados},
              open(os.path.join(RAIZ, "data", "links.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log = ["# Verificação de links — %s" % agora, "", "%d links verificados; %d ok (%s); %d quebrados." % (
        len(res), len(res) - len(quebrados), ", ".join("%d %s" % (v, k) for k, v in sorted(tipos.items())), len(quebrados)), ""]
    log += ["- %s — %s (em %s)" % (q["url"], q["motivo"], q["origem"]) for q in quebrados]
    os.makedirs(os.path.join(RAIZ, "logs"), exist_ok=True)
    open(os.path.join(RAIZ, "logs", "links.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log[:60]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
