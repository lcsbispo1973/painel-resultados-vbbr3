"""Diagnóstico: abre links da CVM como um iPhone (WebKit) e como Chrome, e registra o que cada um mostra."""
import json, sys
from playwright.sync_api import sync_playwright
URLS = {
  "ipe_download": "https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo=1558260&numSequencia=1082966&numVersao=1",
  "ipe_exibir": "https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=1558260",
  "fre_download": "https://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento=126115",
  "fre_gerencia": "https://www.rad.cvm.gov.br/ENET/frmGerenciaPaginaFRE.aspx?NumeroSequencialDocumento=126115&CodigoTipoInstituicao=1",
}
out = {}
with sync_playwright() as p:
    for nav, launcher, ctxargs in (("iphone", p.webkit, dict(**p.devices["iPhone 13"])), ("chrome", p.chromium, {})):
        b = launcher.launch()
        for k, u in URLS.items():
            ctx = b.new_context(**ctxargs, accept_downloads=True)
            pg = ctx.new_page()
            r = {"url": u}
            dl = []
            pg.on("download", lambda d: dl.append(d.suggested_filename))
            try:
                resp = pg.goto(u, timeout=60000, wait_until="load")
                pg.wait_for_timeout(5000)
                r["status"] = resp.status if resp else None
                r["content_type"] = resp.headers.get("content-type") if resp else None
                r["disposition"] = resp.headers.get("content-disposition") if resp else None
                r["final_url"] = pg.url
                r["titulo"] = pg.title()
                r["texto"] = pg.inner_text("body")[:300] if pg.query_selector("body") else ""
                r["frames"] = [f.url for f in pg.frames][:5]
                pg.screenshot(path=f"diag/{nav}_{k}.png")
            except Exception as e:
                r["erro"] = str(e)[:300]
            r["downloads"] = dl
            out[f"{nav}:{k}"] = r
            ctx.close()
        b.close()
json.dump(out, open("diag/resultado.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1))
