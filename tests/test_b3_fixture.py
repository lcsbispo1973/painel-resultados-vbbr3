"""Confere a leitura do layout COTAHIST com um registro sintético (sem rede)."""
import io, os, sys, zipfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))
import b3


def registro(data, ticker, tpmerc, fech_cent, vol_cent, neg):
    l = [" "] * 245
    def put(a, b, s, num=False):
        s = (s.rjust(b - a + 1, "0") if num else s.ljust(b - a + 1))
        l[a - 1:b] = list(s)
    put(1, 2, "01"); put(3, 10, data); put(11, 12, "02"); put(13, 24, ticker); put(25, 27, tpmerc)
    put(109, 121, str(fech_cent), True); put(148, 152, str(neg), True); put(171, 188, str(vol_cent), True)
    return "".join(l)

linhas = [registro("20260630", "VBBR3", "010", 2345, 123456789, 4321),
          registro("20260630", "VBBR3", "070", 999, 1, 1),      # opção: ignorar
          registro("20260630", "PETR4", "010", 3000, 1, 1),     # outro ticker: ignorar
          registro("20210104", "BRDT3", "010", 2767, 5000000, 10),
          registro("20260630", "BOVA11", "010", 13550, 1000, 5)]
assert all(len(x) == 245 for x in linhas)
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as z:
    z.writestr("COTAHIST_A2026.TXT", "00COTAHIST.2026\r\n" + "\r\n".join(linhas) + "\r\n99COTAHIST.2026\r\n")
r = b3.le_zip(buf.getvalue())
assert r == [("2026-06-30", "VBBR3", 23.45, 1234567.89, 4321), ("2021-01-04", "BRDT3", 27.67, 50000.0, 10), ("2026-06-30", "BOVA11", 135.5, 10.0, 5)], r
print("TESTE B3 OK")
