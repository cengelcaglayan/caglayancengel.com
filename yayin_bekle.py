#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Canliya YENI surumun yayilmasini bekler; ancak ondan sonra denetim kosar.

Neden var (01.09.2026): push tetikli denetim, GitHub Pages deploy'undan 13 saniye
sonra kosup canlida ESKI sayfayi olctu ve kirmizi yakti. Site saglamdi, denetim
yanlis ani olctu — yanlis alarm da sessiz kirilma kadar zararlidir, cunku bir
sonraki gercek kirmizi "yine o hatadir" diye gecistirilir.

Repodaki hesaplamalar.html ile canlidaki ayni olana kadar bekler (max ~4 dk).
Yerel kosuda (GitHub Actions disinda) da calisir; zaman asiminda 1 doner."""
import hashlib, pathlib, ssl, sys, time, urllib.request

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CTX = ssl.create_default_context()

URL   = "https://caglayancengel.com/hesaplamalar.html"
KOK   = pathlib.Path(__file__).resolve().parent
YEREL = KOK / "hesaplamalar.html"
TUR, ARA = 24, 10          # 24 deneme x 10 sn = 4 dakika

def ozet(b):
    return hashlib.sha256(b).hexdigest()[:12]

if not YEREL.exists():
    print("  hesaplamalar.html bulunamadi — beklenecek bir sey yok")
    sys.exit(1)

beklenen = ozet(YEREL.read_bytes())
print("  beklenen surum   %s (repo)" % beklenen)

for i in range(1, TUR + 1):
    try:
        canli = ozet(urllib.request.urlopen(URL, timeout=20, context=SSL_CTX).read())
    except Exception as e:
        canli = "ALINAMADI"
        print("  deneme %2d/%d      sayfa alinamadi: %s" % (i, TUR, str(e)[:50]))
    else:
        if canli == beklenen:
            print("  deneme %2d/%d      yayin tamam — canli surum repoyla ayni" % (i, TUR))
            sys.exit(0)
        print("  deneme %2d/%d      canli %s ≠ repo %s, bekleniyor" % (i, TUR, canli, beklenen))
    if i < TUR:
        time.sleep(ARA)

print("  🔴 %d saniyede yayin tamamlanmadi — denetim ESKI sayfayi olcerdi, durduruldu."
      % (TUR * ARA))
print("     GitHub Pages deploy'u kontrol edilmeli.")
sys.exit(1)
