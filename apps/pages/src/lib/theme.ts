import type { CSSProperties } from 'react';

export type SiteStyle = { theme?: 'moderne' | 'riad' | 'noir' | null; color?: string | null; logo?: string | null };

const BASE: Record<'moderne' | 'riad' | 'noir', Record<string, string>> = {
  moderne: {},
  riad: {
    '--bg': '250 246 240', '--surface': '255 253 249', '--surface-2': '243 236 226', '--surface-3': '232 222 208',
    '--ink': '52 36 24', '--muted': '120 100 84', '--line': '52 36 24', '--night': '58 34 22', '--night-2': '86 52 34',
  },
  noir: {
    '--bg': '12 16 22', '--surface': '22 27 35', '--surface-2': '30 36 46', '--surface-3': '42 49 61',
    '--ink': '236 240 245', '--muted': '150 160 176', '--line': '236 240 245', '--night': '6 8 12', '--night-2': '16 20 28',
  },
};
const DEFAULT_COLOR = { moderne: null, riad: '#B5562F', noir: '#B08D57' } as const;

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (c: number[], w: number) => c.map(x => Math.round(x + (255 - x) * w));
const lum = (c: number[]) => { const [r, g, b] = c.map(x => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** CSS variables for the style the office chose: the whole page (and the header) takes its colors from them. */
export function themeVars(style?: SiteStyle | null): CSSProperties {
  const theme = style?.theme && BASE[style.theme] ? style.theme : 'moderne';
  const vars: Record<string, string> = { ...BASE[theme] };
  const hex = (style?.color && /^#[0-9a-fA-F]{6}$/.test(style.color) ? style.color : DEFAULT_COLOR[theme]) ?? null;
  if (hex) {
    const c = rgb(hex);
    vars['--brand'] = c.join(' ');
    vars['--brand-hi'] = mix(c, 0.22).join(' ');
    vars['--brand-ink'] = lum(c) > 0.45 ? '20 20 20' : '255 255 255';
    vars['--ok'] = theme === 'moderne' ? '0 135 75' : c.join(' ');
    vars['--theme-night-brand'] = mix(c, 0.35).join(' ');
  } else {
    vars['--theme-night-brand'] = '5 185 98';
  }
  return vars as CSSProperties;
}
export const themeName = (style?: SiteStyle | null) => (style?.theme && BASE[style.theme] ? style.theme : 'moderne');
