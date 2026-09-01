/* Service worker — siteyi telefonda "ana ekrana ekle" ile uygulama gibi
   calistirir ve cevrimdisi aciyor.
   Neden var (01.09.2026, Caglayan karari "ara yolu da yap"): magaza uygulamasi
   yapilmadi — maliyeti var, karsiligi yok. Bu dosya ayni isi sifir maliyetle
   goruyor: ana ekran ikonu, tam ekran acilis, cevrimdisi hesaplama.

   Strateji: AG ONCE. Site GitHub Pages'te durur ve sik guncellenir; onbellek
   once denenirse kullanici eski sayfayi gorur — bugun tam da bunun bir benzeri
   yasandi. Ag calisiyorsa daima taze icerik gelir, onbellek yalniz cevrimdisi
   yedegidir.                                                                  */
const SURUM = 'cc-2026-09-01';
const KABUK = [
  '/', '/hesaplamalar.html', '/ornek-rapor.html', '/kart.html', '/gizlilik.html',
  '/fonts.css', '/logo.png', '/icon-192.png', '/manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SURUM)
      .then(c => Promise.allSettled(KABUK.map(y => c.add(y))))  /* biri dusse digerleri kurulur */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(a => Promise.all(a.filter(x => x !== SURUM).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const istek = e.request;
  if (istek.method !== 'GET') return;
  const u = new URL(istek.url);
  if (u.origin !== self.location.origin) return;   /* sayac vb. disari — dokunma */

  e.respondWith(
    fetch(istek)
      .then(c => {
        if (c && c.ok) { const k = c.clone(); caches.open(SURUM).then(x => x.put(istek, k)); }
        return c;
      })
      .catch(() => caches.match(istek).then(c => c || caches.match('/hesaplamalar.html')))
  );
});
