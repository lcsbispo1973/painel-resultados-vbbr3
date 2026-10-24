#!/usr/bin/env python3
"""Item 10 do Formulário de Referência (comentários dos diretores) da última versão de cada ano.

O texto do item 10 vem como PDF anexado (base64) dentro do XML do FRE baixado da CVM. Este script decodifica os
anexos, extrai o texto e guarda os subitens do 10.1 (condições financeiras, estrutura de capital, capacidade de
pagamento, fontes de financiamento, endividamento, resultados) por ano. Só reprocessa anos novos ou alterados.
Grava data/fre_item10.json e logs/fre-item10.md.
"""
import base64, datetime as dt, io, json, os, re, subprocess, sys, tempfile, time, urllib.request, zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
SUBITENS = [("a", "Condições financeiras e patrimoniais gerais"), ("b", "Estrutura de capital"), ("c", "Capacidade de pagamento"),
            ("d", "Fontes de financiamento para capital de giro e investimentos"), ("e", "Fontes de financiamento para cobertura de deficiências de liquidez"),
            ("f", "Níveis de endividamento"), ("g", "Limites dos financiamentos contratados"), ("h", "Alterações significativas nas demonstrações financeiras")]


def baixar(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url.replace("http://", "https://"), headers=UA), timeout=180) as r:
                return r.read()
        except Exception:  # noqa: BLE001
            time.sleep(4 * (i + 1))
    return None


def pdf_texto(b):
    with tempfile.TemporaryDirectory() as t:
        p = os.path.join(t, "x.pdf"); open(p, "wb").write(b)
        r = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", p, "-"], capture_output=True)
        return r.stdout.decode("utf-8", "ignore") if r.returncode == 0 else ""


def tem_item10(t):
    return bool(t) and re.search(r"condi[çc][õo]es financeiras e patrimoniais gerais", t, re.I) and re.search(r"estrutura de capital", t, re.I)


def rtf_texto(b):
    t = b.decode("latin-1", "ignore")
    t = re.sub(r"\\'([0-9a-f]{2})", lambda m: bytes([int(m.group(1), 16)]).decode("latin-1"), t)
    t = re.sub(r"\\par[d]?\b", "\n", t)
    t = re.sub(r"\\[a-z]+-?\d* ?|[{}]", "", t)
    return t


def html_texto(t):
    import html as H
    t = H.unescape(H.unescape(t))
    t = re.sub(r"<\s*(br|/p|/div|/li|/h\d)[^>]*>", "\n\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return t


def conteudo(b, rastro, prof=0):
    """Gera (descrição, texto) de tudo o que houver no arquivo: PDF, XML (texto e anexos base64), RTF, HTML, zips aninhados."""
    if prof > 3 or not b:
        return
    if b.startswith(b"%PDF"):
        yield "pdf", pdf_texto(b)
    elif b[:2] == b"PK":
        try:
            z = zipfile.ZipFile(io.BytesIO(b))
        except Exception:  # noqa: BLE001
            return
        rastro.append("zip[%s]" % ", ".join("%s (%d)" % (i.filename, i.file_size) for i in z.infolist()[:15]))
        for i in sorted(z.infolist(), key=lambda i: -i.file_size):
            yield from conteudo(z.read(i.filename), rastro, prof + 1)
    elif b.lstrip()[:5] == b"{\\rtf":
        yield "rtf", rtf_texto(b)
    else:
        if b[:2] in (b"\xff\xfe", b"\xfe\xff"):
            t = b.decode("utf-16", "ignore")
        else:
            m = re.search(rb'encoding="([^"]+)"', b[:200])
            enc = m.group(1).decode() if m else "utf-8"
            try:
                t = b.decode(enc, "ignore")
            except LookupError:
                t = b.decode("utf-8", "ignore")
        if "<" in t[:400]:
            yield "xml/html", html_texto(t)
            for m in re.finditer(r">([A-Za-z0-9+/=\s]{2000,})<", t):
                try:
                    bb = base64.b64decode(re.sub(r"\s+", "", m.group(1)))
                except Exception:  # noqa: BLE001
                    continue
                yield from conteudo(bb, rastro, prof + 1)


def item10(b, rastro):
    """Texto (do pacote do FRE) que contém o item 10.1."""
    for como, t in conteudo(b, rastro):
        if tem_item10(t):
            rastro.append("item 10 em " + como)
            return t
    return None


def subitens(t):
    """Corta o texto do 10.1 nos subitens a) … h)."""
    t = re.sub(r"[ \t]+", " ", t)
    ini = re.search(r"10\.1\s*[-–.]?\s*(?:Condi|Coment)", t, re.I)
    fim = re.search(r"\n\s*10\.2\b", t)
    corpo = t[ini.start() if ini else 0: fim.start() if fim and (not ini or fim.start() > ini.start()) else len(t)]
    out = {}
    pos = []
    for letra, nome in SUBITENS:
        m = re.search(r"(?:^|\n)\s*\(?%s\)\s*%s" % (letra, re.escape(nome.split()[0])), corpo, re.I)
        if m:
            pos.append((m.start(), letra, nome))
    pos.sort()
    for k, (p0, letra, nome) in enumerate(pos):
        p1 = pos[k + 1][0] if k + 1 < len(pos) else len(corpo)
        txt = corpo[p0:p1]
        txt = re.sub(r"^\s*\(?%s\)\s*[^\n]*\n" % letra, "", txt)          # tira o título do subitem
        paras = [re.sub(r"\s+", " ", x).strip() for x in re.split(r"\n\s*\n", txt)]
        paras = [re.sub(r"(?<=[a-zà-ú])f (?=[a-zà-ú])|\bf (?=[a-zà-ú]{2,})", "f", x) for x in paras]   # ligadura "fi"/"fo" quebrada pelo PDF
        paras = [x for x in paras if len(x) > 80 and not re.match(r"^(PÁGINA|Página|Formulário de Referência)", x)]
        out[letra] = {"titulo": nome, "paragrafos": paras[:12]}
    return out


def main():
    os.makedirs(os.path.join(RAIZ, "logs"), exist_ok=True)
    idx = json.load(open(os.path.join(RAIZ, "data", "fre", "indice.json"), encoding="utf-8"))["anos"]
    caminho = os.path.join(RAIZ, "data", "fre_item10.json")
    atual = json.load(open(caminho, encoding="utf-8")) if os.path.exists(caminho) else {"anos": {}}
    log = ["# FRE item 10 — última execução", "", "Executado em %s UTC" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), ""]
    for a in idx:
        if not a["documentos"]:
            continue
        doc = a["documentos"][-1]
        ano = str(a["ano"])
        chave = "%s v%s" % (doc["id"], doc["versao"])
        if atual["anos"].get(ano, {}).get("chave") == chave and atual["anos"][ano].get("subitens"):
            continue
        b = baixar(doc["link"])
        if not b or b[:2] != b"PK":
            log.append("- %s: download falhou" % ano); continue
        rastro = []
        t = item10(b, rastro)
        if not t:
            log.append("- %s: item 10 não encontrado; pacote: %s" % (ano, " | ".join(rastro)[:1500])); continue
        sub = subitens(t)
        if not sub:   # formato não reconhecido: guarda o trecho do item 10 para diagnóstico
            os.makedirs(os.path.join(RAIZ, "logs", "fre10"), exist_ok=True)
            i0 = max(0, (re.search(r"condi[çc][õo]es financeiras e patrimoniais gerais", t, re.I) or re.search("", t)).start() - 3000)
            open(os.path.join(RAIZ, "logs", "fre10", "%s.txt" % ano), "w", encoding="utf-8").write(t[i0:i0 + 40000])
        atual["anos"][ano] = {"chave": chave, "versao": doc["versao"], "recebido": doc["dt_receb"], "link": doc["link"].replace("http://", "https://"), "subitens": sub}
        log.append("- %s v%s: subitens %s (%s)" % (ano, doc["versao"], ", ".join(sorted(sub)) or "nenhum", rastro[-1]))
    for v in atual["anos"].values():   # ligaduras quebradas também nos anos já gravados
        for sb in (v.get("subitens") or {}).values():
            sb["paragrafos"] = [re.sub(r"(?<=[a-zà-ú])f (?=[a-zà-ú])|\bf (?=[a-zà-ú]{2,})", "f", x) for x in sb["paragrafos"]]
    atual["fonte"] = "Formulário de Referência (CVM), item 10 — comentários dos diretores, última versão de cada ano"
    atual["atualizado_em"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    json.dump(atual, open(caminho, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    open(os.path.join(RAIZ, "logs", "fre-item10.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))
    return 0


if __name__ == "__main__":
    sys.exit(main())
