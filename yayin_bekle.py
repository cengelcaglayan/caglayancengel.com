#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Canliya YENI surumun yayilmasini bekler; ancak ondan sonra denetim kosar.

Neden var (01.09.2026): push tetikli denetim, GitHub Pages deploy'undan 13 saniye
sonra kosup canlida ESKI sayfayi olctu ve kirmizi yakti. Site saglamdi, denetim
yanlis ani olctu — yanlis alarm da sessiz kirilma kadar zararlidir, cunku bir
sonraki gercek kirmizi "yine o hatadir" diye gecistirilir.

02.09.2026 — TERS YONDE KIRILDI: betik yalniz hesaplamalar.html'e bakiyordu.
gizlilik.html degistirilip push edildiginde hesaplamalar.html degismemisti,
canli kopya repoyla zaten ayniydi ve betik ILK DENEMEDE "yayin tamam" dedi.
Denetim eski gizlilik.html'i olctu ve temiz raporladi. Yanlis guvence.
Artik SABIT bir dosyaya degil, repodaki BUTUN html dosyalarina bakilir;
hepsi eslesene kadar beklenir. Boylece hangi dosya degisirse degissin kapsar."""
import hashlib, pathlib, ssl, sys, time, urllib.request

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CTX = ssl.create_default_context()

SITE = "https://caglayancengel.com/"
KOK  = pathlib.Path(__file__).resolve().parent
TUR, ARA = 24, 10          # 24 deneme x 10 sn = 4 dakika


def ozet(b):
    return hashlib.sha256(b).hexdigest()[:12]


# Yayinlanan butun html dosyalari. 404.html canliya istenerek cagrilamaz
# (sunucu 404 doner), kapsam disi.
dosyalar = sorted(p for p in KOK.glob("*.html") if p.name != "404.html")
if not dosyalar:
    print("  html dosyasi bulunamadi — beklenecek bir sey yok")
    sys.exit(1)

beklenen = {p.name: ozet(p.read_bytes()) for p in dosyalar}
print("  izlenen dosya    %d: %s" % (len(beklenen), ", ".join(beklenen)))

for i in range(1, TUR + 1):
    bekleyen, alinamayan = [], []
    for ad, bek in beklenen.items():
        try:
            g = urllib.request.urlopen(SITE + ad, timeout=20, context=SSL_CTX).read()
        except Exception:
            alinamayan.append(ad)
            continue
        if ozet(g) != bek:
            bekleyen.append(ad)

    if not bekleyen and not alinamayan:
        print("  deneme %2d/%d      yayin tamam — %d dosyanin hepsi repoyla ayni"
              % (i, TUR, len(beklenen)))
        sys.exit(0)

    durum = []
    if bekleyen:
        durum.append("bekleyen: " + ", ".join(bekleyen))
    if alinamayan:
        durum.append("alinamayan: " + ", ".join(alinamayan))
    print("  deneme %2d/%d      %s" % (i, TUR, " · ".join(durum)))

    if i < TUR:
        time.sleep(ARA)

print("  🔴 %d saniyede yayin tamamlanmadi — denetim ESKI sayfayi olcerdi, durduruldu."
      % (TUR * ARA))
print("     GitHub Pages deploy'u kontrol edilmeli.")
sys.exit(1)
