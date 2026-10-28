import { photoUrl } from './photos';
import { autoEnhance } from './photoTools';
import { DEAL, TYPE, place, priceText, type AdLang } from './postings';
import type { PropertyRow } from './types';

export type CardFormat = 'original' | 'market' | 'post' | 'story';
export const FORMATS: Record<Exclude<CardFormat, 'original'>, { w: number; h: number }> = {
  market: { w: 1200, h: 900 },   // Facebook Marketplace, Mubawab, Avito: landscape 4:3
  post: { w: 1080, h: 1350 },    // Instagram and Facebook post: 4:5
  story: { w: 1080, h: 1920 },   // Stories and reels: 9:16
};
type Office = { name: string; phone?: string | null };

async function bitmap(base: string): Promise<ImageBitmap> {
  const blob = await (await fetch(photoUrl(base))).blob();
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}
const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.88));

/** Draw the photo filling the canvas (centered crop). */
function cover(ctx: CanvasRenderingContext2D, bmp: ImageBitmap, w: number, h: number) {
  const k = Math.max(w / bmp.width, h / bmp.height);
  const dw = bmp.width * k, dh = bmp.height * k;
  ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** One photo in the chosen shape, brightened when asked. */
export async function makePhoto(base: string, format: CardFormat, improve: boolean): Promise<Blob> {
  const bmp = await bitmap(base);
  const size = format === 'original' ? { w: bmp.width, h: bmp.height } : FORMATS[format];
  const k = Math.min(1, 1600 / Math.max(size.w, size.h));
  const w = Math.round(size.w * k), h = Math.round(size.h * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  cover(ctx, bmp, w, h); bmp.close();
  if (improve) autoEnhance(ctx, w, h);
  return toBlob(c);
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700): number {
  let s = size;
  do { ctx.font = `${weight} ${s}px system-ui, "Segoe UI", Arial, sans-serif`; s -= 2; } while (ctx.measureText(text).width > maxW && s > 18);
  return s + 2;
}

/** A ready-to-post card: the cover photo with the price, the key facts, the place and the office. */
export async function makeCard(base: string | null, p: PropertyRow, lang: AdLang, office: Office, format: Exclude<CardFormat, 'original'>, improve: boolean): Promise<Blob> {
  const { w, h } = FORMATS[format];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  if (base) { const bmp = await bitmap(base); cover(ctx, bmp, w, h); bmp.close(); if (improve) autoEnhance(ctx, w, h); }
  else { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1f2937'); g.addColorStop(1, '#0f172a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }

  const rtl = lang === 'ar';
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  const pad = Math.round(w * 0.06);
  const x = rtl ? w - pad : pad;
  const maxW = w - pad * 2;

  // Dark band at the bottom for the text.
  const bandH = Math.round(h * (format === 'story' ? 0.34 : 0.42));
  const grad = ctx.createLinearGradient(0, h - bandH, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.45, 'rgba(0,0,0,0.72)'); grad.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = grad; ctx.fillRect(0, h - bandH, w, bandH);

  // Badge: for sale or for rent.
  const badge = DEAL[lang][p.purpose].toUpperCase();
  const bs = Math.round(w * 0.04);
  ctx.font = `800 ${bs}px system-ui, "Segoe UI", Arial, sans-serif`;
  const bw = ctx.measureText(badge).width + bs * 1.2, bh = bs * 1.9;
  const bx = rtl ? w - pad - bw : pad, by = pad * 0.9;
  ctx.fillStyle = '#e11d48';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.fillText(badge, bx + bw / 2, by + bh * 0.67);
  ctx.textAlign = rtl ? 'right' : 'left';

  // Text from the bottom up.
  let y = h - pad;
  const tel = office.phone ? ` · ${office.phone}` : '';
  const foot = `${office.name}${tel}`;
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = `600 ${fit(ctx, foot, maxW, Math.round(w * 0.034), 600)}px system-ui, "Segoe UI", Arial, sans-serif`;
  ctx.fillText(foot, x, y);
  y -= Math.round(w * 0.075);

  const where = place(p);
  if (where) {
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${fit(ctx, where, maxW, Math.round(w * 0.05), 600)}px system-ui, "Segoe UI", Arial, sans-serif`;
    ctx.fillText(where, x, y); y -= Math.round(w * 0.085);
  }
  const rooms = p.bedrooms ? (lang === 'ar' ? `${p.bedrooms} غرف` : `${p.bedrooms} ch.`) : '';
  const facts = [TYPE[lang][p.property_type], rooms, p.area_m2 ? `${Number(p.area_m2)} m²` : ''].filter(Boolean).join('  ·  ');
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${fit(ctx, facts, maxW, Math.round(w * 0.046), 600)}px system-ui, "Segoe UI", Arial, sans-serif`;
  ctx.fillText(facts, x, y); y -= Math.round(w * 0.1);

  const price = priceText(p, lang);
  if (price) {
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${fit(ctx, price, maxW, Math.round(w * 0.09), 800)}px system-ui, "Segoe UI", Arial, sans-serif`;
    ctx.fillText(price, x, y);
  }
  return toBlob(c);
}

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
