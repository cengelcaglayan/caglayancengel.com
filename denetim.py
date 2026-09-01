#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gunluk site denetimi — GitHub Actions uzerinde calisir, yerel makine gerekmez.
Yalnizca OKUR; hicbir sey degistirmez. Bir kontrol kirmizi cikarsa is basarisiz
biter ve GitHub hesaba e-posta gonderir."""
import sys, ssl, socket, urllib.request, datetime, re, os, shutil, subprocess
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CTX = ssl.create_default_context()

SITE  = "https://caglayancengel.com"
SAYFA = ["/", "/hesaplamalar.html", "/ornek-rapor.html", "/gizlilik.html", "/kart.html"]
hata, uyari = [], []

def al(yol):
    r = urllib.request.urlopen(SITE + yol, timeout=25, context=SSL_CTX)
    return r.status, r.read().decode("utf-8", "replace"), dict(r.headers)

print("=" * 66)
print("SITE DENETIMI ·", datetime.datetime.now(datetime.timezone.utc).strftime("%d.%m.%Y %H:%M UTC"))
print("=" * 66)

# 1 · sayfalar ayakta mi
govde = {}
for y in SAYFA:
    try:
        k, g, _ = al(y)
        govde[y] = g
        print("  %-22s %s · %6d bayt" % (y, k, len(g)))
        if k != 200: hata.append("%s HTTP %s" % (y, k))
        if len(g) < 4000: hata.append("%s beklenenden kucuk (%d bayt)" % (y, len(g)))
    except Exception as e:
        hata.append("%s ACILMIYOR: %s" % (y, str(e)[:70])); print("  %-22s HATA" % y)

# 2 · sertifika suresi
try:
    with SSL_CTX.wrap_socket(socket.socket(), server_hostname="caglayancengel.com") as s:
        s.settimeout(15); s.connect(("caglayancengel.com", 443))
        bit = datetime.datetime.strptime(s.getpeercert()["notAfter"], "%b %d %H:%M:%S %Y %Z")
    kalan = (bit - datetime.datetime.utcnow()).days
    print("\n  sertifika              %d gun kaldi (%s)" % (kalan, bit.strftime("%d.%m.%Y")))
    if kalan < 10:  hata.append("Sertifikaya %d gun kaldi" % kalan)
    elif kalan < 25: uyari.append("Sertifikaya %d gun kaldi" % kalan)
except Exception as e:
    uyari.append("Sertifika okunamadi: " + str(e)[:60])

# 3 · marka ve icerik butunlugu
KONTROL = [
    ("sayac kodu",         "goatcounter.com/count",              SAYFA),
    ("marka adi",          "ÇAĞLAYAN ÇENGEL",                    SAYFA),
    ("unvan",              "Finansal Yönetim Danışmanı",         SAYFA),
    ("slogan",             "KOBİ'lere Güven Veren",              SAYFA),
    ("mail gizleme",       'style="display:none">nospam',        SAYFA),
    ("WhatsApp",           "wa.me/905337619443",                 SAYFA),
    ("kartvizit dosyasi",  "caglayan-cengel.vcf",                ["/", "/kart.html"]),
    ("karekod",            "hero-qr",                            ["/"]),
    ("olcut listesi",      'class="olc"',                        ["/"]),
]
print()
for ad, iz, nerede in KONTROL:
    olculemeyen = [y for y in nerede if y not in govde]
    eksik       = [y for y in nerede if y in govde and iz not in govde[y]]
    if olculemeyen:
        print("  %-22s OLCULEMEDI (%s acilmadi)" % (ad, ", ".join(olculemeyen)))
        hata.append("%s olculemedi — sayfa acilmadi: %s" % (ad, ", ".join(olculemeyen)))
    elif eksik:
        print("  %-22s EKSIK: %s" % (ad, ", ".join(eksik)))
        hata.append("%s eksik: %s" % (ad, ", ".join(eksik)))
    else:
        print("  %-22s tamam" % ad)

# 4 · sayilabilir ogeler
if "/hesaplamalar.html" in govde:
    g = govde["/hesaplamalar.html"]
    arac = len(re.findall(r'<section[^>]*id="a([1-9]|10)"', g))
    cta  = g.count("arac-cta")
    print("\n  hesaplama araci        %d (beklenen 10)" % arac)
    print("  gorusme cagrisi        %d (beklenen 10)" % cta)
    if arac != 10: hata.append("Arac sayisi %d, 10 olmali" % arac)
    if cta  <  10: hata.append("Gorusme cagrisi %d, 10 olmali" % cta)

# 5 · vCard dogru tiple sunuluyor mu
try:
    k, g, h = al("/caglayan-cengel.vcf")
    tip = h.get("Content-Type", "")
    print("  vCard                  %s · %s" % (k, tip))
    if "vcard" not in tip.lower(): hata.append("vCard yanlis tiple sunuluyor: " + tip)
    if "BEGIN:VCARD" not in g:     hata.append("vCard icerigi bozuk")
except Exception as e:
    hata.append("vCard alinamadi: " + str(e)[:60])

# 6 · sitemap ve robots
for y in ["/sitemap.xml", "/robots.txt"]:
    try:
        k, g, _ = al(y); print("  %-22s %s" % (y, k))
        if k != 200: hata.append("%s HTTP %s" % (y, k))
    except Exception:
        hata.append("%s alinamadi" % y)

# 7 · http -> https yonlendirmesi
try:
    r = urllib.request.urlopen("http://caglayancengel.com", timeout=20, context=SSL_CTX)
    print("  http yonlendirmesi     %s" % ("https" if r.url.startswith("https") else "YOK"))
    if not r.url.startswith("https"): hata.append("http https'e yonlendirmiyor")
except Exception as e:
    uyari.append("http kontrolu yapilamadi: " + str(e)[:50])

# 8 · hesap kontrolu — araclar CALISIYOR MU
# Yukaridaki kontroller sayfanin VARLIGINI olcer. 01.09.2026'da Arac 04 hic hesap
# yapmazken bu denetim her kosuda "TEMIZ" dedi: varlik olculuyordu, islev degil.
# Asagidaki adim sayfadaki hesap kodunu Node'da kosturup referans sonuclarla
# karsilastirir. Girdiler Turkce yazimla (virgullu) verilir — arizanin ciktigi bicim.
KOK = os.path.dirname(os.path.abspath(__file__))
TEST = os.path.join(KOK, "hesap_testi.js")
print()
if not os.path.exists(TEST):
    hata.append("hesap_testi.js bulunamadi — hesap kontrolu YAPILMADI")
    print("  hesap kontrolu         🔴 hesap_testi.js yok")
elif not shutil.which("node"):
    hata.append("node kurulu degil — hesap kontrolu YAPILMADI (denetim eksik kosuyor)")
    print("  hesap kontrolu         🔴 node yok")
else:
    try:
        p = subprocess.run(["node", TEST], capture_output=True, text=True, timeout=180)
        for satir in (p.stdout or "").rstrip().splitlines():
            print("  " + satir)
        if p.returncode != 0:
            hata.append("Hesap kontrolu KIRMIZI — araclar referans degerleri tutturamiyor")
            for satir in (p.stderr or "").rstrip().splitlines()[:5]:
                print("  " + satir)
    except Exception as e:
        hata.append("Hesap kontrolu kosturulamadi: " + str(e)[:70])
        print("  hesap kontrolu         🔴 kosturulamadi")

print("\n" + "=" * 66)
for u in uyari: print("  UYARI  ·", u)
if hata:
    print("  %d SORUN BULUNDU:" % len(hata))
    for h in hata: print("   🔴", h)
    print("=" * 66); sys.exit(1)
print("  TEMIZ — butun kontroller gecti")
print("=" * 66)
