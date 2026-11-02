import qrcode from 'qrcode-generator';
import { photoUrl } from './photos';
import { DEAL, TYPE, place, priceText, type AdLang } from './postings';
import { propertyUrl } from './publicSite';
import { FR4, AR4 } from './i18n/showcase';
import { FEATURES } from './showcase';
import type { PropertyRow } from './types';

export type PaperSize = 'A4' | 'A3';
const SIZE: Record<PaperSize, { w: number; h: number; unit: number }> = {
  A4: { w: 210, h: 297, unit: 3.8 },   // 1 em = 3.8 mm, so the same layout scales to A3
  A3: { w: 297, h: 420, unit: 5.374 },
};
const FEATURE_EN: Record<string, string> = {
  gated: 'Gated residence', guard: 'Guard 24/7', elevator: 'Elevator', parking: 'Parking', pool: 'Pool', garden: 'Garden',
  terrace: 'Terrace', sea_view: 'Sea view', air_con: 'Air conditioning', equipped_kitchen: 'Equipped kitchen', fiber: 'Fiber internet', solar: 'Solar water heater',
};
const TXT = {
  fr: { ref: 'Réf.', scan: 'Scannez pour voir toutes les photos et les détails', rooms: (n: number) => `${n} ch.`, baths: (n: number) => `${n} sdb`, floor: (n: number) => (n === 0 ? 'RDC' : `Étage ${n}`), visit: 'Visite sur rendez-vous', month: '', },
  ar: { ref: 'المرجع', scan: 'امسح الرمز لمشاهدة كل الصور والتفاصيل', rooms: (n: number) => `${n} غرف`, baths: (n: number) => `${n} حمام`, floor: (n: number) => (n === 0 ? 'الطابق الأرضي' : `الطابق ${n}`), visit: 'الزيارة بموعد مسبق', month: '' },
};
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** QR code as an inline SVG (empty when there is no address to point to). */
export function qrSvg(url: string): string {
  if (!url) return '';
  const q = qrcode(0, 'M');
  q.addData(url); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

export type VitrineInput = {
  property: PropertyRow; office: { name: string; slug: string; phone: string | null };
  photos: string[]; lang: AdLang; size: PaperSize; published: boolean;
};

/** A printable window card (A4 or A3, portrait): cover photo, price, key facts and a QR code to the public page. */
export function vitrineHtml({ property: p, office, photos, lang, size, published }: VitrineInput): string {
  const tx = TXT[lang], sz = SIZE[size], rtl = lang === 'ar';
  const dict = lang === 'ar' ? AR4 : FR4;
  const url = published ? propertyUrl(office.slug, p.reference, lang) : '';
  const qr = qrSvg(url);
  const price = priceText(p, lang);
  const where = place(p);
  const type = TYPE[lang][p.property_type];
  const facts = [
    p.bedrooms ? tx.rooms(p.bedrooms) : '', p.bathrooms ? tx.baths(p.bathrooms) : '',
    p.area_m2 ? `${Number(p.area_m2)} m²` : '', typeof p.floor === 'number' ? tx.floor(p.floor) : '',
  ].filter(Boolean);
  const feats = (p.features ?? []).filter(f => (FEATURES as readonly string[]).includes(f)).slice(0, 8)
    .map(f => dict[FEATURE_EN[f]] ?? FEATURE_EN[f]);
  const cover = photos[0] ? photoUrl(photos[0]) : '';
  const side = photos.slice(1, 3).map(b => photoUrl(b));

  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<title>${esc(p.reference)} - ${esc(type)}</title>
<style>
@page{size:${size} portrait;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:${sz.unit}mm}
body{width:${sz.w}mm;height:${sz.h}mm;font-family:system-ui,"Segoe UI",Arial,sans-serif;color:#001E3E;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow:hidden}
.page{display:flex;flex-direction:column;width:100%;height:100%}
.top{display:flex;align-items:center;justify-content:space-between;padding:1.1em 1.6em;background:#001E3E;color:#fff}
.badge{background:#05B962;color:#001E3E;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:.35em 1.1em;border-radius:99em;font-size:1.25em}
.ref{opacity:.8;font-weight:600;font-size:.95em}
.hero{position:relative;flex:0 0 40%;background:#e5e7eb ${cover ? `url('${cover}') center/cover` : ''}}
.side{display:flex;gap:.6em;padding:.6em 1.6em 0}
.side img{flex:1;min-width:0;height:7.2em;object-fit:cover;border-radius:.5em}
.body{flex:1;padding:1em 1.6em 0;display:flex;flex-direction:column;gap:.5em;min-height:0}
.price{font-size:3.1em;font-weight:900;line-height:1.05;color:#001E3E}
.title{font-size:1.5em;font-weight:700}
.where{font-size:1.2em;color:#4b5563;font-weight:600}
.facts{display:flex;flex-wrap:wrap;gap:.5em;margin-top:.2em}
.facts span{background:#f1f5f9;border-radius:.5em;padding:.3em .8em;font-weight:700;font-size:1.1em}
.feats{display:flex;flex-wrap:wrap;gap:.4em}
.feats span{border:.08em solid #05B962;color:#047857;border-radius:99em;padding:.15em .8em;font-size:.95em;font-weight:600}
.foot{display:flex;align-items:center;gap:1.2em;padding:1em 1.6em;background:#001E3E;color:#fff}
.qr{flex:0 0 auto;width:8em;height:8em;background:#fff;padding:.5em;border-radius:.6em}
.qr svg{width:100%;height:100%;display:block}
.scan{flex:1;font-size:1.05em;font-weight:600;opacity:.9}
.office{text-align:${rtl ? 'left' : 'right'};flex:0 0 auto}
.office b{display:block;font-size:1.3em}
.office .tel{display:block;font-size:1.6em;font-weight:900;color:#05B962;direction:ltr;unicode-bidi:plaintext}
.office small{opacity:.8;font-size:.9em}
@media screen{body{margin:0 auto;box-shadow:0 0 2em rgba(0,0,0,.2)}}
</style></head><body><div class="page">
<div class="top"><span class="badge">${esc(DEAL[lang][p.purpose])}</span><span class="ref">${tx.ref} ${esc(p.reference)}</span></div>
<div class="hero"></div>
${side.length ? `<div class="side">${side.map(s => `<img src="${s}" alt="">`).join('')}</div>` : ''}
<div class="body">
${price ? `<div class="price">${esc(price)}</div>` : ''}
<div class="title">${esc(type)}${where ? ` · ${esc(where)}` : ''}</div>
${facts.length ? `<div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
${feats.length ? `<div class="feats">${feats.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
</div>
<div class="foot">
${qr ? `<div class="qr">${qr}</div><div class="scan">${tx.scan}</div>` : '<div class="scan"></div>'}
<div class="office"><b>${esc(office.name)}</b>${office.phone ? `<span class="tel">${esc(office.phone)}</span>` : ''}<small>${tx.visit}</small></div>
</div>
</div>
<script>
(function(){var imgs=[].slice.call(document.images),left=imgs.length+1,done=false;
function go(){if(done)return;done=true;setTimeout(function(){window.print()},300)}
function tick(){if(--left<=0)go()}
var h=document.querySelector('.hero');var bg=getComputedStyle(h).backgroundImage.match(/url\\(["']?(.*?)["']?\\)/);
if(bg){left++;var i=new Image();i.onload=i.onerror=tick;i.src=bg[1]}
imgs.forEach(function(im){if(im.complete)tick();else{im.onload=im.onerror=tick}});tick();
setTimeout(go,6000)})();
</script></body></html>`;
}

export function printVitrine(input: VitrineInput): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(vitrineHtml(input)); w.document.close();
  return true;
}
