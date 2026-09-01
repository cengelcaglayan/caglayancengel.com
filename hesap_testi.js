#!/usr/bin/env node
/* HESAP KONTROLU — hesaplamalar.html icindeki araclarin DOGRU CALISTIGINI olcer.
 *
 * Neden var (01.09.2026): denetim.py sayfanin VARLIGINI olcuyordu, ISLEDIGINI degil.
 * Arac 04 hic hesap yapmazken denetim her kosuda "TEMIZ" dedi. Sessiz aritmetik olum.
 * Bu dosya sayfadaki hesap kodunu cekip Node'da kosturur ve referans sonuclarla
 * karsilastirir. Sapma varsa KIRMIZI yanar ve exit 1 doner.
 *
 * Girdiler bilerek TURKCE YAZIMLA verilir (virgul ondalik, nokta binlik) — arizanin
 * ciktigi bicim budur. Nokta ile test etmek kullanicinin hatasini gizler.
 *
 * Kullanim:
 *   node hesap_testi.js                    canli siteyi olcer
 *   node hesap_testi.js --yerel dosya.html yerel dosyayi olcer
 *   node hesap_testi.js --yakma            hesabi bilerek bozar, KIRMIZI yanmali
 */
'use strict';
const vm = require('vm');
const fs = require('fs');

const CANLI = 'https://caglayancengel.com/hesaplamalar.html';
const arg = process.argv.slice(2);
const YAKMA = arg.includes('--yakma');
const yerelIdx = arg.indexOf('--yerel');
const YEREL = yerelIdx >= 0 ? arg[yerelIdx + 1] : null;

/* ---------- referans tablo ----------
   [OLCULDU · Code · 01.09.2026 · duzeltme sonrasi canli site]
   'bek' = sayisal beklenen (cikti metninden ilk sayi cekilir)
   'ara' = cikti metni bu diziyi icermeli                                */
const TESTLER = [
  { ad: 'a04 taksitli kredi', fn: 'taksit',
    gir: { k_ana:'2.175.234', k_faiz:'3,61', k_vade:'24', k_kul:'3,7', k_bsmv:'5',
           k_kom:'', k_sig:'' },
    olc: [ { id:'k_efektif', bek:4.18, tol:0.01, not:'efektif aylik oran' },
           { id:'k_alt',     ara:'139.623', not:'aylik taksit' },
           { id:'k_tablo',   ara:'84.508',  not:'pesin kesilen masraf' } ] },

  { ad: 'a05 rotatif · sade', fn: 'rotatif',
    gir: { r_ana:'1.000.000', r_faiz:'45', r_gun:'90', r_kom:'0,5', r_komay:'3',
           r_bsmv:'5', r_kul:'', r_tahsis:'' },
    olc: [ { id:'r_yil', bek:49.4, tol:0.1, not:'yillik maliyet' } ] },

  { ad: 'a05 rotatif · masrafli', fn: 'rotatif',
    gir: { r_ana:'1.000.000', r_faiz:'45', r_gun:'90', r_kom:'0,5', r_komay:'3',
           r_bsmv:'5', r_kul:'0,5', r_tahsis:'25.000' },
    olc: [ { id:'r_yil', bek:54.1, tol:0.1, not:'yillik maliyet' } ] },

  { ad: 'a06 spot · sade', fn: 'spot',
    gir: { s_ana:'1.000.000', s_faiz:'45', s_gun:'90', s_kul:'1', s_bsmv:'5' },
    olc: [ { id:'s_yil', bek:51.4, tol:0.1, not:'yillik maliyet' },
           { id:'s_alt', ara:'1.128.625', not:'vade sonu odeme' } ] },

  { ad: 'a07 cek/senet iskontosu', fn: 'iskonto',
    gir: { i_nom:'1.000.000', i_faiz:'45', i_gun:'90', i_kul:'1,1', i_bsmv:'5', i_esas:'360' },
    olc: [ { id:'i_yil', bek:74.3, tol:0.1, not:'yillik maliyet' },
           { id:'i_alt', ara:'870.325', not:'elinize gecen' } ] },

  { ad: 'a08 POS blokeli/ertesi gun', fn: 'pos',
    gir: { p_ciro:'500.000', p_k1:'2,5', p_k2:'2', p_gun:'30', p_maliyet:'4', p_bsmv:'5' },
    olc: [ { id:'p_fark',  bek:17375, tol:1, not:'toplam fark' },
           { id:'p_tablo', ara:'13.125', not:'kesilen toplam (1. secenek)' },
           { id:'p_tablo', ara:'10.500', not:'kesilen toplam (2. secenek)' } ] },

  { ad: 'a09 faktoring', fn: 'faktoring',
    gir: { fk_tut:'1.000.000', fk_gun:'90', fk_faiz:'45', fk_avans:'80', fk_kom:'1',
           fk_bsmv:'5', fk_kul:'0', fk_kredi:'' },
    olc: [ { id:'fk_yil', bek:75.6, tol:0.1, not:'yillik maliyet' },
           { id:'fk_alt', ara:'695.000', not:'elinize gecen' },
           { id:'fk_alt', ara:'60,4',    not:'basit yillik' } ] },

  { ad: 'a10 geriye dogru maliyet', fn: 'geriye',
    gir: { gt_nom:'100.000', gt_gun:'92', gt_net:'87.000', gt_bsmv:'5', gt_kredi:'' },
    olc: [ { id:'gt_denk', bek:55.7, tol:0.1, not:'denk kredi faizi' },
           { id:'gt_alt',  ara:'13.000', not:'kesinti' },
           { id:'gt_alt',  ara:'14,94',  not:'92 gunun maliyeti' } ] },

  { ad: 'a01 bilanco teshisi', fn: 'teshis',
    gir: { t_dv:'2.500.000', t_stok:'800.000', t_kvyk:'1.500.000', t_aktif:'6.000.000',
           t_ozk:'2.400.000', t_borc:'1.800.000', t_ns:'9.000.000',
           t_favok:'1.100.000,50', t_bs:'700.000', t_nk:'350.000' },
    olc: [ { id:'t_ozet',  ara:'9 oran ölçüldü, 9 tanesi', not:'skor satiri' },
           { id:'t_tablo', ara:'1,67',  not:'cari oran' },
           { id:'t_tablo', ara:'1,13',  not:'asit-test' },
           { id:'t_tablo', ara:'%40',   not:'ozkaynak orani' },
           { id:'t_tablo', ara:'%12,2', not:'FAVOK marji' } ] },

  { ad: 'a02 DSCR', fn: 'dscr',
    gir: { d_favok:'1.100.000,50', d_bs:'700.000', d_borc:'1.800.000', d_nakit:'200.000' },
    olc: [ { id:'d_dscr', bek:1.57, tol:0.01, not:'DSCR' },
           { id:'d_alt',  ara:'1,45', not:'net borc / FAVOK' } ] },

  { ad: 'a03 nakit dongusu', fn: 'ccc',
    gir: { n_dso:'75,5', n_dio:'60', n_dpo:'45', n_ns:'9.000.000' },
    olc: [ { id:'n_ccc', bek:91, tol:0.5, not:'gun sayisi' },
           { id:'n_alt', ara:'2.231.507', not:'baglanan isletme sermayesi' } ] },
];

/* ---------- yapisal kontrol ----------
   Bu alanlar 01.09.2026'da Caglayan karariyla SOKULDU: kredi hesaplama
   araclarinda kapanan krediden alinan masraf yer almaz. Kaynak: mevzuat
   takibi konusulurken site araclarina girdi olarak eklenmislerdi (6e61d89),
   kapsam hatasiydi. Geri gelirlerse bu kontrol kirmizi yakar.               */
const YASAK_ALAN = [
  { id:'k_kapama', ad:'a04 kapanis masrafi' },
  { id:'r_kapama', ad:'a05 kapanis masrafi' },
  { id:'s_kapama', ad:'a06 kapanis masrafi' },
];

/* ---------- kaynak ---------- */
async function kaynakAl(){
  if (YEREL) return fs.readFileSync(YEREL, 'utf8');
  const r = await fetch(CANLI, { redirect:'follow' });
  if (!r.ok) throw new Error('sayfa alinamadi: HTTP ' + r.status);
  return await r.text();
}

/* ---------- sahte DOM ----------
   Hesap fonksiyonlari alanlari iki yoldan okuyor: global id (k_ana.value) ve
   document.getElementById(id). Ikisi de ayni nesneye baglanir.               */
function domKur(){
  const kayit = new Map();
  const bos = () => ({ add(){}, remove(){}, toggle(){}, contains(){ return false; } });
  function el(id){
    if (kayit.has(id)) return kayit.get(id);
    const e = {
      id, value:'', textContent:'', innerHTML:'', innerText:'', checked:false,
      style:{ setProperty(){}, removeProperty(){} }, dataset:{}, classList:bos(),
      addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
      setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
      appendChild(){}, insertBefore(){}, remove(){}, focus(){}, blur(){}, click(){},
      querySelector(){ return null; }, querySelectorAll(){ return []; },
      closest(){ return null; }, scrollIntoView(){},
      getBoundingClientRect(){ return { top:0,left:0,right:0,bottom:0,width:0,height:0 }; },
      children:[], parentNode:null, offsetHeight:0, offsetWidth:0,
    };
    kayit.set(id, e);
    return e;
  }
  const document = {
    getElementById: el,
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    createElement(t){ return el('__yeni_' + t + '_' + kayit.size); },
    addEventListener(){}, removeEventListener(){},
    documentElement: el('__html'), body: el('__body'), head: el('__head'),
    readyState:'complete', title:'', cookie:'',
  };
  return { document, el, kayit };
}

/* Bilinmeyen degisken adi geldiginde (k_ana gibi) otomatik eleman uret. */
function baglamKur(dom){
  const temel = {
    document: dom.document,
    console: { log(){}, warn(){}, error(){}, info(){} },
    navigator: { userAgent:'node', language:'tr-TR', clipboard:{ writeText(){ return Promise.resolve(); } } },
    location: { href: CANLI, hash:'', pathname:'/hesaplamalar.html', search:'' },
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    sessionStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    setTimeout(){ return 0; }, clearTimeout(){}, setInterval(){ return 0; }, clearInterval(){},
    requestAnimationFrame(){ return 0; }, cancelAnimationFrame(){},
    matchMedia(){ return { matches:false, addEventListener(){}, addListener(){} }; },
    IntersectionObserver: class { observe(){} unobserve(){} disconnect(){} },
    ResizeObserver:       class { observe(){} unobserve(){} disconnect(){} },
    MutationObserver:     class { observe(){} disconnect(){} },
    Event: class { constructor(t){ this.type = t; } },
    fetch(){ return Promise.resolve({ ok:true, json(){ return Promise.resolve({}); } }); },
    addEventListener(){}, removeEventListener(){}, scrollTo(){}, scrollY:0, innerWidth:1280, innerHeight:800,
    Math, JSON, Date, Number, String, Array, Object, Intl, RegExp, isFinite, isNaN,
    parseFloat, parseInt, encodeURIComponent, decodeURIComponent, Promise, Map, Set, Error,
  };
  temel.window = temel;
  temel.globalThis = temel;
  const proxy = new Proxy(temel, {
    has(){ return true; },
    get(t, k){
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (/^[a-z]+_[a-zA-Z0-9_]+$/.test(k)) return dom.el(k); /* k_ana, fk_tut ... */
      return undefined;
    },
    set(t, k, v){ t[k] = v; return true; },
  });
  return vm.createContext(proxy);
}

/* ---------- cikti metninden sayi ---------- */
function sayi(metin){
  const t = String(metin).replace(/<[^>]*>/g, ' ');
  const m = t.match(/-?\d[\d.]*(?:,\d+)?/);
  if (!m) return null;
  let s = m[0];
  s = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\.(?=\d{3}\b)/g, '');
  const x = parseFloat(s);
  return isFinite(x) ? x : null;
}
const metin = e => (e.textContent && e.textContent.trim()) || (e.innerHTML || '').replace(/<[^>]*>/g, '').trim();

/* ---------- kosum ---------- */
(async () => {
  const cizgi = '='.repeat(66);
  console.log(cizgi);
  console.log('HESAP KONTROLU ·', new Date().toISOString().slice(0, 16).replace('T', ' '), 'UTC',
              YAKMA ? '· YAKMA TESTI' : '', YEREL ? '· yerel: ' + YEREL : '· canli');
  console.log(cizgi);

  let govde;
  try { govde = await kaynakAl(); }
  catch (e) { console.log('  🔴 KAYNAK ALINAMADI:', e.message); process.exit(1); }

  const bloklar = [...govde.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const hesapBlok = bloklar.find(b => /function\s+taksit\s*\(/.test(b));
  if (!hesapBlok) { console.log('  🔴 Hesap kodu bulunamadi (function taksit yok)'); process.exit(1); }

  let kod = hesapBlok;
  if (YAKMA) {
    /* N() her sayiyi %0,5 kaydirsin — butun araclar sapmali, hepsi kirmizi yanmali. */
    const once = kod;
    kod = kod.replace('return isFinite(x) ? x : null;', 'return isFinite(x) ? x*1.005 : null;');
    if (kod === once) { console.log('  🔴 Yakma testi kodu enjekte edilemedi — N() imzasi degismis'); process.exit(1); }
  }

  const dom = domKur();
  const ctx = baglamKur(dom);
  try { vm.runInContext(kod, ctx, { timeout: 15000 }); }
  catch (e) { console.log('  🔴 Hesap kodu kosmadi:', e.message); process.exit(1); }

  const sorun = [];

  /* ---------- KARSILAMA EKRANI ----------
     Bugune kadar hep alanlara deger YAZIP olctum — yani sayfayi hic acmamis gibi.
     Caglayan a04'u actiginda butun kutular dolu gorundu, sonuc "—" kaldi: gri
     rakamlar placeholder'di, value bostu. Denetim bunu goremedi.
     Bu kontrol hicbir sey yazmadan, sadece HTML'deki varsayilan degerlerle
     hesabi kosturur: ziyaretcinin ilk saniyede gordugu ekrani olcer.            */
  {
    const SONUC = ['t_skor','d_dscr','n_ccc','k_efektif','r_yil','s_yil','i_yil','p_fark','fk_yil','gt_denk'];
    const ISTEGE_BAGLI = new Set(['fk_kredi','gt_kredi']);
    const dom2 = domKur();
    const ctx2 = baglamKur(dom2);
    let kosdu = true;
    try { vm.runInContext(hesapBlok, ctx2, { timeout: 15000 }); }
    catch (e) { kosdu = false; sorun.push('karsilama: hesap kodu kosmadi — ' + e.message); }

    if (kosdu) {
      for (const m of govde.matchAll(/<input id="([^"]+)"[^>]*\bvalue="([^"]*)"/g)) dom2.el(m[1]).value = m[2];
      for (const f of ['teshis','dscr','ccc','taksit','rotatif','spot','iskonto','pos','faktoring','geriye']) {
        try { if (typeof ctx2[f] === 'function') ctx2[f](); } catch (e) { sorun.push(`karsilama: ${f}() hata — ${e.message}`); }
      }
      const bos = SONUC.filter(id => { const m = metin(dom2.el(id)); return !m || m === '—' || m === '—/ay'; });
      /* Hesap alaninda placeholder = "dolu gorunen bos kutu" tuzagi geri gelmis demektir */
      const ph = [...govde.matchAll(/<input id="([^"]+)"[^>]*\bplaceholder="/g)]
                   .map(m => m[1]).filter(id => !ISTEGE_BAGLI.has(id));
      if (bos.length) {
        sorun.push('karsilama ekrani: sayfa ilk acildiginda ' + bos.length + ' arac sonuc uretmiyor (' + bos.join(', ') + ')');
        console.log('  🔴 KARSILAMA   ilk acilista bos kalan: %s', bos.join(', '));
      } else {
        console.log('  tamam  karsilama ekrani        10 aracin 10\'u ilk acilista sonuc gosteriyor');
      }
      if (ph.length) {
        sorun.push('karsilama ekrani: hesap alaninda placeholder geri gelmis (' + ph.join(', ') + ') — dolu gorunen bos kutu');
        console.log('  🔴 KARSILAMA   placeholder geri gelmis: %s', ph.join(', '));
      }
    }
  }

  /* ---------- ÖRNEK METİNLER (FAZ 1) ----------
     Araçların altındaki çözülmüş örnekler statik metindir — dil modelleri
     JavaScript çalıştırmadığı için sitenin okunabilir tek yüzü orası.
     Statik metnin tehlikesi bayatlamaktır: hesap değişir, metin eski rakamı
     anlatmaya devam eder ve site kendini yanlış tanıtır. Bu kontrol her aracın
     örnek bloğunda, hesabın bugün ürettiği rakamın geçtiğini ölçer.          */
  {
    const ORNEK_IZ = [
      { arac:'a1',  id:'t_tablo',   ara:'1,11',  not:'cari oran' },
      { arac:'a2',  id:'d_dscr',    ara:'1,28',  not:'DSCR' },
      { arac:'a3',  id:'n_ccc',     ara:'132',   not:'gün sayısı' },
      { arac:'a4',  id:'k_efektif', ara:'%4,18', not:'efektif oran' },
      { arac:'a5',  id:'r_yil',     ara:'%62',   not:'yıllık maliyet' },
      { arac:'a6',  id:'s_yil',     ara:'%58,9', not:'yıllık maliyet' },
      { arac:'a7',  id:'i_yil',     ara:'%74,3', not:'yıllık maliyet' },
      { arac:'a8',  id:'p_fark',    ara:'20.183',not:'aylık fark' },
      { arac:'a9',  id:'fk_yil',    ara:'%75,6', not:'yıllık maliyet' },
      { arac:'a10', id:'gt_denk',   ara:'%55,7', not:'denk kredi faizi' },
    ];
    const bolum = id => {
      const i = govde.search(new RegExp('<section[^>]*id="' + id + '"'));
      if (i < 0) return '';
      const j = govde.slice(i + 10).search(/<section |<footer/);
      return j < 0 ? govde.slice(i) : govde.slice(i, i + 10 + j);
    };
    const eksikBlok = [], sapan = [];
    for (const o of ORNEK_IZ) {
      const b = bolum(o.arac);
      if (!/class="ornek"/.test(b)) { eksikBlok.push(o.arac); continue; }
      const ornekMetin = (b.match(/<div class="ornek">[\s\S]*?<\/div>/) || [''])[0];
      if (!ornekMetin.includes(o.ara)) sapan.push(`${o.arac} · ${o.not}: örnekte "${o.ara}" yok`);
    }
    if (eksikBlok.length) {
      sorun.push('örnek metin eksik: ' + eksikBlok.join(', ') + ' — bu araçlar dil modelleri için görünmez');
      console.log('  🔴 ÖRNEK METİN eksik: %s', eksikBlok.join(', '));
    }
    if (sapan.length) {
      sorun.push(...sapan.map(x => 'örnek metin bayat — ' + x));
      for (const x of sapan) console.log('  🔴 ÖRNEK METİN %s', x);
    }
    if (!eksikBlok.length && !sapan.length)
      console.log('  tamam  örnek metinler          10 araçta var, rakamlar hesapla tutuyor');
  }

  /* ---------- ANA SAYFA MİNİ HESABI (FAZ 2) ----------
     Hero'daki hızlı hesap, Araç 04'ün küçük halidir — iki ayrı yerde duran iki
     ayrı kod. Ayrışırlarsa site kendi kendisiyle çelişir: ana sayfada bir rakam,
     araç sayfasında başka bir rakam. Bu kontrol ikisini aynı girdiyle koşturup
     karşılaştırır ve statik metnin de aynı rakamı taşıdığını ölçer.          */
  {
    const ANA = (YEREL ? YEREL.replace(/[^/]*$/, 'index.html') : 'https://caglayancengel.com/');
    let ana = '';
    try { ana = YEREL ? fs.readFileSync(ANA, 'utf8')
                      : await fetch(ANA, { redirect:'follow' }).then(r => r.text()); }
    catch (e) { sorun.push('mini hesap: ana sayfa alinamadi — ' + e.message); }

    if (ana) {
      const mb = [...ana.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
                   .map(m => m[1]).find(b => /m_sonuc/.test(b));
      if (!mb) {
        sorun.push('mini hesap: ana sayfada hero hesabı yok');
        console.log('  🔴 MİNİ HESAP  ana sayfada bulunamadı');
      } else {
        const kyt = new Map();
        const el2 = id => { if (!kyt.has(id)) kyt.set(id, { id, value:'', textContent:'', innerHTML:'', addEventListener(){} }); return kyt.get(id); };
        const ctx3 = vm.createContext({ document:{ getElementById: el2, addEventListener(){} },
          console:{ log(){}, warn(){}, error(){} }, Math, Number, String, Array, Object, Intl,
          RegExp, isFinite, parseFloat, parseInt, JSON, Date });
        for (const m of ana.matchAll(/<input id="(m_[a-z]+)"[^>]*\bvalue="([^"]*)"/g)) el2(m[1]).value = m[2];
        try { vm.runInContext(mb, ctx3, { timeout: 8000 }); } catch (e) { sorun.push('mini hesap kosmadi: ' + e.message); }
        const s2 = el2('m_sonuc'), a2 = el2('m_alt');
        const cikan = ((s2.innerHTML || s2.textContent) + '').replace(/<[^>]*>/g, '');
        const altMetin = a2.textContent || '';
        const beklenen = { oran:'%4,18', taksit:'139.623', pesin:'84.508' };
        const hata2 = [];
        if (!cikan.includes(beklenen.oran))      hata2.push(`oran "${beklenen.oran}" değil, "${cikan}"`);
        if (!altMetin.includes(beklenen.taksit)) hata2.push(`taksit ${beklenen.taksit} yok`);
        if (!altMetin.includes(beklenen.pesin))  hata2.push(`peşin masraf ${beklenen.pesin} yok`);
        /* statik metin de aynı rakamı taşımalı — modelin okuduğu yer orası */
        const notMetin = (ana.match(/<p class="mini-not">[\s\S]*?<\/p>/) || [''])[0];
        if (!notMetin) hata2.push('statik açıklama (mini-not) yok — model için görünmez');
        else for (const [ad, deg] of Object.entries(beklenen))
          if (!notMetin.includes(deg)) hata2.push(`statik metinde ${ad} (${deg}) yok`);

        if (hata2.length) {
          sorun.push(...hata2.map(x => 'mini hesap — ' + x));
          for (const x of hata2) console.log('  🔴 MİNİ HESAP  %s', x);
        } else {
          console.log("  tamam  ana sayfa mini hesabı   Araç 04'le aynı: %4,18/ay · 139.623 ₺ · 84.508 ₺");
        }
      }
    }
  }

  for (const y of YASAK_ALAN) {
    if (new RegExp('id="' + y.id + '"').test(govde) || new RegExp("id='" + y.id + "'").test(govde)) {
      sorun.push(`${y.ad}: sokulmus girdi (${y.id}) sayfaya geri gelmis`);
      console.log('  🔴 GERI GELMIS  %s (%s)', y.ad.padEnd(24), y.id);
    }
  }

  for (const t of TESTLER) {
    for (const [k, v] of Object.entries(t.gir)) dom.el(k).value = v;
    const fn = ctx[t.fn];
    if (typeof fn !== 'function') { sorun.push(`${t.ad}: ${t.fn}() yok`); console.log('  %-28s 🔴 fonksiyon yok', t.ad); continue; }
    try { fn(); } catch (e) { sorun.push(`${t.ad}: ${t.fn}() hata verdi — ${e.message}`); console.log('  %-28s 🔴 hata: %s', t.ad, e.message); continue; }

    const satir = [];
    let temiz = true;
    for (const o of t.olc) {
      const m = metin(dom.el(o.id));
      if (!m || m === '—') { temiz = false; sorun.push(`${t.ad} · ${o.not}: sonuc BOS (${o.id})`); satir.push(`${o.not}=BOS`); continue; }
      if (o.ara !== undefined) {
        if (!m.includes(o.ara)) { temiz = false; sorun.push(`${t.ad} · ${o.not}: "${o.ara}" bekleniyordu, cikti "${m.slice(0,70)}"`); satir.push(`${o.not}≠${o.ara}`); }
        else satir.push(`${o.not}✓`);
      } else {
        const s = sayi(m);
        if (s === null) { temiz = false; sorun.push(`${t.ad} · ${o.not}: sayi okunamadi ("${m.slice(0,40)}")`); satir.push(`${o.not}=?`); }
        else if (Math.abs(s - o.bek) > o.tol) { temiz = false; sorun.push(`${t.ad} · ${o.not}: beklenen ${o.bek}, olculen ${s}`); satir.push(`${o.not}=${s}≠${o.bek}`); }
        else satir.push(`${o.not}=${s}`);
      }
    }
    console.log('  %s %s %s', temiz ? 'tamam ' : '🔴 SAPMA', t.ad.padEnd(26), satir.join(' · '));
  }

  console.log('\n' + cizgi);
  if (YAKMA) {
    if (sorun.length) {
      console.log(`  YAKMA TESTI GECTI — bozulmus hesap ${sorun.length} kontrolde kirmizi yakti.`);
      console.log('  Not: ORAN cikartilari (a01 oranlari, a02 DSCR) girdilerin toptan');
      console.log('  olceklenmesine dogasi geregi duyarsizdir — pay ve payda birlikte kayar.');
      console.log('  O araclarda formul bozulmasini mutlak degerli kontroller yakalar.');
      console.log(cizgi); process.exit(0);
    }
    console.log('  🔴 YAKMA TESTI KALDI — hesap bilerek bozuldu ama kontrol TEMIZ dedi.');
    console.log('     Bu kontrol ise yaramiyor, referans degerler gozden gecirilmeli.');
    console.log(cizgi); process.exit(1);
  }
  if (sorun.length) {
    console.log(`  ${sorun.length} SAPMA BULUNDU:`);
    for (const s of sorun) console.log('   🔴', s);
    console.log(cizgi); process.exit(1);
  }
  console.log(`  TEMIZ — ${TESTLER.length} araç senaryosu referans degerlerle tutuyor.`);
  console.log(cizgi);
})();
