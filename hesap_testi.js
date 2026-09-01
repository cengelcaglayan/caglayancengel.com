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
           k_kom:'', k_sig:'', k_kapama:'' },
    olc: [ { id:'k_efektif', bek:4.18, tol:0.01, not:'efektif aylik oran' },
           { id:'k_alt',     ara:'139.623', not:'aylik taksit' },
           { id:'k_tablo',   ara:'84.508',  not:'pesin kesilen masraf' } ] },

  { ad: 'a05 rotatif · sade', fn: 'rotatif',
    gir: { r_ana:'1.000.000', r_faiz:'45', r_gun:'90', r_kom:'0,5', r_komay:'3',
           r_bsmv:'5', r_kul:'', r_tahsis:'', r_kapama:'' },
    olc: [ { id:'r_yil', bek:49.4, tol:0.1, not:'yillik maliyet' } ] },

  { ad: 'a05 rotatif · masrafli', fn: 'rotatif',
    gir: { r_ana:'1.000.000', r_faiz:'45', r_gun:'90', r_kom:'0,5', r_komay:'3',
           r_bsmv:'5', r_kul:'0,5', r_tahsis:'25.000', r_kapama:'10.000' },
    olc: [ { id:'r_yil', bek:54.1, tol:0.1, not:'yillik maliyet' } ] },

  { ad: 'a06 spot · sade', fn: 'spot',
    gir: { s_ana:'1.000.000', s_faiz:'45', s_gun:'90', s_kul:'1', s_bsmv:'5', s_kapama:'' },
    olc: [ { id:'s_yil', bek:51.4, tol:0.1, not:'yillik maliyet' },
           { id:'s_alt', ara:'1.128.625', not:'vade sonu odeme' } ] },

  { ad: 'a06 spot · kapamali', fn: 'spot',
    gir: { s_ana:'1.000.000', s_faiz:'45', s_gun:'90', s_kul:'1', s_bsmv:'5', s_kapama:'15.000' },
    olc: [ { id:'s_yil', bek:57.8, tol:0.1, not:'yillik maliyet' } ] },

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
