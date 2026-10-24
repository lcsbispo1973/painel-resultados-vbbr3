"""Diagnóstico: o runner consegue baixar o FRE completo (item 10, comentários dos diretores) e o PDF da ITR (comentário do
desempenho e nota de segmentos)? Grava logs/diag-mda.md com metadados e trechos curtos."""
import io, json, os, re, subprocess, tempfile, urllib.request, zipfile
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
alv = json.load(open(os.path.join(raiz, "diag", "alvos.json"), encoding="utf-8"))
log = ["# Diagnóstico MD&A", ""]
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120) as r:
            b = r.read(); log.append("- %s → HTTP %s | %s | %s | %d bytes | início %r" % (u[:150], r.status, r.headers.get("Content-Type"), r.headers.get("Content-Disposition"), len(b), b[:8])); return b
    except Exception as e:
        log.append("- ERRO %s → %s: %s" % (u[:150], type(e).__name__, str(e)[:150])); return None
def texto_pdf(b):
    with tempfile.TemporaryDirectory() as t:
        p = os.path.join(t, "x.pdf"); open(p, "wb").write(b)
        return subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", p, "-"], capture_output=True).stdout.decode("utf-8", "ignore")
log.append("## FRE (%s v%s)" % (alv["fre"]["dt_refer"], alv["fre"]["versao"]))
for u in [alv["fre"]["link"], alv["fre"]["link"].replace("http://", "https://")]:
    b = get(u)
    if not b: continue
    if b[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(b)); nomes = z.namelist(); log.append("  zip: %d arquivos: %s" % (len(nomes), nomes[:12]))
        for n in nomes:
            d = z.read(n)
            if d[:2] == b"PK":
                z2 = zipfile.ZipFile(io.BytesIO(d)); log.append("  zip interno %s: %s" % (n, z2.namelist()[:15]))
                for n2 in z2.namelist():
                    d2 = z2.read(n2); s = d2.decode("utf-8", "ignore") if not d2.startswith(b"%PDF") else texto_pdf(d2)
                    if re.search(r"Comentários dos diretores|condições financeiras e patrimoniais|10\.1", s, re.I):
                        i = re.search(r"condições financeiras e patrimoniais", s, re.I)
                        log.append("  ✓ item 10 encontrado em %s (%d chars); trecho: %r" % (n2, len(s), s[i.start():i.start()+500] if i else s[:300]))
                        break
            else:
                s = d.decode("utf-8", "ignore") if not d.startswith(b"%PDF") else texto_pdf(d)
                if re.search(r"condições financeiras e patrimoniais", s, re.I):
                    i = re.search(r"condições financeiras e patrimoniais", s, re.I)
                    log.append("  ✓ item 10 encontrado em %s (%d chars); trecho: %r" % (n, len(s), s[i.start():i.start()+500]))
        break
    elif b.startswith(b"%PDF"):
        s = texto_pdf(b); i = re.search(r"condições financeiras e patrimoniais", s, re.I)
        log.append("  PDF de %d chars; item 10: %s" % (len(s), repr(s[i.start():i.start()+500]) if i else "não encontrado"))
        break
    else:
        log.append("  HTML/outro: %r" % re.sub(r"\s+", " ", b.decode("utf-8", "ignore"))[:400])
log += ["", "## ITR/DF (%s %s)" % (alv["itr"]["data_entrega"], alv["itr"]["assunto"])]
b = get(alv["itr"]["link"])
if b and b.startswith(b"%PDF"):
    s = texto_pdf(b); log.append("  texto: %d chars" % len(s))
    for rx in [r"coment[áa]rio d[eo] desempenho", r"informa[çc][õo]es por segmento", r"ebitda ajustado"]:
        ms = [m.start() for m in re.finditer(rx, s, re.I)]
        log.append("  '%s': %d ocorrências" % (rx, len(ms)))
    i = [m.start() for m in re.finditer(r"ebitda ajustado", s, re.I)]
    for k in i[:3]:
        log.append("  trecho EBITDA: %r" % s[max(0, k-300):k+700])
open(os.path.join(raiz, "logs", "diag-mda.md"), "w", encoding="utf-8").write("\n".join(log) + "\n")
print("\n".join(log))
