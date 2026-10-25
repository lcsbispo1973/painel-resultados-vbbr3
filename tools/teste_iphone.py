"""Teste temporário: no site publicado, como iPhone (WebKit), baixa PDF e Excel de algumas abas."""
import json, os
from playwright.sync_api import sync_playwright
os.makedirs("diag", exist_ok=True)
out = {}
with sync_playwright() as p:
    b = p.webkit.launch(); ctx = b.new_context(**p.devices["iPhone 13"], accept_downloads=True); pg = ctx.new_page()
    erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto("https://vibraemnumeros.github.io/", wait_until="networkidle"); pg.wait_for_timeout(3000)
    for aba in ("Visão geral", "MD&A", "Dívida"):
        pg.get_by_role("tab", name=aba, exact=True).click(); pg.wait_for_timeout(2000)
        for fmt in ("PDF", "Excel"):
            try:
                with pg.expect_download(timeout=120000) as d:
                    pg.locator("#exportar").get_by_role("button", name=fmt, exact=True).click()
                caminho = "diag/" + d.value.suggested_filename; d.value.save_as(caminho)
                out[aba + " " + fmt] = [d.value.suggested_filename, os.path.getsize(caminho)]
            except Exception as e:
                out[aba + " " + fmt] = "ERRO " + str(e)[:200]
        pg.screenshot(path="diag/iphone_" + aba.replace(" ", "_").replace("&", "") + ".png")
    out["erros_js"] = erros
    b.close()
json.dump(out, open("diag/iphone.json", "w"), ensure_ascii=False, indent=1); print(out)
