/* KENDINI KALDIRAN SERVICE WORKER — Caglayan karari 02.09.2026: "siteyi indirme
   islemini de iptal et."

   01.09.2026'da site "ana ekrana eklenebilir" yapilmisti (manifest + bu dosya).
   Karar degisti: sitenin hicbir kopyasi cihaza inmez. Ziyaretci siteye girer,
   kullanir, gider — arkasinda dosya kalmaz.

   Dosya SILINMEDI cunku canliya cikmisti: kuran tarayicilar onu calistirmaya
   devam eder ve sayfayi kendi onbelleginden sunar. Silinirse bazi tarayicilar
   eski surumu aylarca tasiyabilir. Bu surum kendini kayittan siler, butun
   onbellegi bosaltir ve acik sekmeleri tazeler.

   Kaldirilma yayildiktan sonra (bir kac hafta) bu dosya da silinebilir.       */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const adlar = await caches.keys();
    await Promise.all(adlar.map(a => caches.delete(a)));
    await self.registration.unregister();
    const sekmeler = await self.clients.matchAll({ type: 'window' });
    for (const s of sekmeler) { try { s.navigate(s.url); } catch (_) {} }
  })());
});

/* Hicbir istegi yakalama — her sey dogrudan aga gitsin. */
