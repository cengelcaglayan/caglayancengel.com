#!/bin/bash
# Siteyi Drive'a yedekler — tek dosya, tum gecmisiyle.
# 13.09.2026: o gune kadar site iki yerde duruyordu (bu Mac + GitHub) ve ikisi de
# ayni zincire bagliydi. Bu betik ucuncu kopyayi Drive'a koyar.
# Kullanim: bash ~/caglayancengel-site/yedek_al.sh
set -e
DEPO="$HOME/caglayancengel-site"
HEDEF="$HOME/Library/CloudStorage/GoogleDrive-cengel.caglayan@gmail.com/Drive'ım/A.DANISMANLIK/9.Markam/SiteYedek"
TARIH=$(date +%d.%m.%Y)
DOSYA="$HEDEF/Caglayan.SiteDeposu.v1.$TARIH.bundle"

cd "$DEPO"
git bundle create "$DOSYA" --all
echo "yedek alindi : $DOSYA"
echo "boyut        : $(du -h "$DOSYA" | cut -f1)"
echo "commit sayisi: $(git rev-list --count HEAD)"

# Uc aydan eski yedekleri temizle (en az uc tanesi her zaman kalir)
cd "$HEDEF"
ls -t *.bundle 2>/dev/null | tail -n +4 | while read -r e; do
  echo "eski yedek silindi: $e"; rm -f "$e"
done

echo
echo "GERI ALMA (site tamamen kaybolursa):"
echo "  git clone \"$DOSYA\" caglayancengel-site"
