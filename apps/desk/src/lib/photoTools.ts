// Photo helpers that run in the browser: quick quality check and gentle automatic improvement.

export type ImageStats = { w: number; h: number; luma: number; sharp: number };

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Gentle auto-levels: stretch the contrast and lift dark photos. Does nothing to a photo that is already fine. */
export function autoEnhance(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = ((d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000) | 0;
    hist[l]++; sum += l;
  }
  const total = w * h;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 254 && acc + hist[lo] < total * 0.01) { acc += hist[lo]; lo++; }
  acc = 0;
  while (hi > 1 && acc + hist[hi] < total * 0.005) { acc += hist[hi]; hi--; }
  lo = Math.min(lo, 60); hi = Math.max(hi, 190);
  const mean = sum / total / 255;
  if (lo <= 10 && hi >= 245 && mean >= 0.38) return;
  const stretched = clamp((mean * 255 - lo) / (hi - lo), 0.05, 0.95);
  const gamma = clamp(Math.log(0.5) / Math.log(stretched), 0.72, 1);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(clamp((v - lo) / (hi - lo), 0, 1), gamma));
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  ctx.putImageData(img, 0, 0);
}

/** Size, average brightness and sharpness of a photo (small copy, fast). Null when the photo cannot be read. */
export async function analyzeImage(url: string): Promise<ImageStats | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
    const w = Math.max(8, Math.round(bmp.width * scale)), h = Math.max(8, Math.round(bmp.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) { bmp.close(); return null; }
    ctx.drawImage(bmp, 0, 0, w, h);
    const out = { w: bmp.width, h: bmp.height, luma: 0, sharp: 0 };
    bmp.close();
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) { g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; sum += g[j]; }
    out.luma = sum / g.length;
    // Variance of the Laplacian: low means few edges, so blurry.
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      s += v; s2 += v * v; n++;
    }
    out.sharp = n ? s2 / n - (s / n) * (s / n) : 0;
    return out;
  } catch { return null; }
}

export const isDark = (s: ImageStats) => s.luma < 70;
export const isBlurry = (s: ImageStats) => s.sharp < 20;
export const isPortrait = (s: ImageStats) => s.h > s.w * 1.05;
