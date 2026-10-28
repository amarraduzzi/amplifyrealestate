// Cloudflare Pages worker for the public pages.
//
// Why it exists: WhatsApp builds the preview of a shared link (title, price) from the HTML it receives,
// without running any JavaScript. This worker looks up the property for /:office/:reference and
// fills the preview tags in index.html. Visitors then get the normal app.
//
// It uses the same two variables as the build (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) and the
// same two database functions as the app, so it can only ever see what a visitor can see.
// If anything goes wrong it serves the plain page: the worker never takes the site down.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LANGS = ['fr', 'ar', 'en'];

const WORDS = {
  fr: {
    types: { apartment: 'Appartement', villa: 'Villa', riad: 'Riad', house: 'Maison', land: 'Terrain', shop: 'Local commercial', office: 'Bureau', building: 'Immeuble', other: 'Bien' },
    purposes: { sale: 'à vendre', rent_long: 'à louer', rent_short: 'location courte durée' },
    suffix: { rent_long: ' / mois', rent_short: ' / nuit' },
    status: { reserved: 'Réservé', rented: 'Loué', sold: 'Vendu' },
    office: (name, city) => `Biens disponibles chez ${name}${city ? ` à ${city}` : ''}`,
  },
  en: {
    types: { apartment: 'Apartment', villa: 'Villa', riad: 'Riad', house: 'House', land: 'Land', shop: 'Shop', office: 'Office', building: 'Building', other: 'Property' },
    purposes: { sale: 'for sale', rent_long: 'for rent', rent_short: 'short-term rent' },
    suffix: { rent_long: ' / month', rent_short: ' / night' },
    status: { reserved: 'Reserved', rented: 'Rented', sold: 'Sold' },
    office: (name, city) => `Available properties from ${name}${city ? ` in ${city}` : ''}`,
  },
  ar: {
    types: { apartment: 'شقة', villa: 'فيلا', riad: 'رياض', house: 'منزل', land: 'أرض', shop: 'محل تجاري', office: 'مكتب', building: 'عمارة', other: 'عقار' },
    purposes: { sale: 'للبيع', rent_long: 'للكراء', rent_short: 'كراء قصير الأمد' },
    suffix: { rent_long: ' / الشهر', rent_short: ' / الليلة' },
    status: { reserved: 'محجوز', rented: 'مكترى', sold: 'مباع' },
    office: (name, city) => `العقارات المتوفرة لدى ${name}${city ? ` في ${city}` : ''}`,
  },
};

const price = (cents, purpose, w) => {
  if (cents === null || cents === undefined) return '';
  const n = String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n} DH${w.suffix[purpose] || ''}`;
};

async function rpc(env, fn, body) {
  const r = await fetch(`${String(env.VITE_SUPABASE_URL).replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status}`);
  return r.json();
}

/** { title, description, found } for the page, or null when this is not a page we know. Throws when the database cannot be reached. */
async function metaFor(parts, lang, env) {
  const slug = (parts[0] || '').toLowerCase();
  if (!SLUG.test(slug) || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  const w = WORDS[lang];

  if (parts.length === 1) {
    const d = await rpc(env, 'public_office_page', { p_slug: slug });
    if (!d) return { found: false };
    return { found: true, title: `${d.office.name} · Amplify Real Estate`, description: w.office(d.office.name, d.office.city) };
  }
  if (parts.length === 2) {
    const reference = decodeURIComponent(parts[1]);
    if (reference.length > 40) return { found: false };
    const d = await rpc(env, 'public_property_page', { p_slug: slug, p_reference: reference });
    if (!d) return { found: false };
    const p = d.property;
    const place = [p.neighborhood, p.city].filter(Boolean).join(', ');
    const title = [p.status !== 'available' ? w.status[p.status] : null, p.title].filter(Boolean).join(' · ');
    const description = [price(p.price_cents, p.purpose, w), `${w.types[p.property_type] || ''} ${w.purposes[p.purpose] || ''}`.trim(), place, d.office.name]
      .filter(Boolean).join(' · ');
    const image = p.photos && p.photos[0] ? `${String(env.VITE_SUPABASE_URL).replace(/\/+$/, '')}/storage/v1/object/public/property-photos/${p.photos[0]}_t.jpg` : null;
    return { found: true, title, description, image };
  }
  return { found: false };
}

// On an office's own domain (www.atlas-immo.ma), / is the office page and /P-AB12 a property.
const PLATFORM = /(^localhost$)|(^127\.)|(\.pages\.dev$)|(\.workers\.dev$)/;
const domains = new Map(); // host -> office code (or null), kept for 5 minutes per worker
async function domainSlug(host, env) {
  if (PLATFORM.test(host) || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  const hit = domains.get(host);
  if (hit && hit.until > Date.now()) return hit.slug;
  let slug = null;
  try { slug = await rpc(env, 'public_office_by_domain', { p_host: host }); } catch { return null; }
  domains.set(host, { slug, until: Date.now() + 300_000 });
  return slug;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let parts = url.pathname.split('/').filter(Boolean);
    const looksLikePage = request.method === 'GET' && parts.length <= 2 && !(parts.length && parts[parts.length - 1].includes('.'));
    if (!looksLikePage) return env.ASSETS.fetch(request);
    const own = await domainSlug(url.hostname, env);
    if (own) parts = parts.length === 0 ? [own] : parts.length === 1 ? [own, parts[0]] : [];
    const isPage = parts.length >= 1 && parts.length <= 2;
    if (!isPage) return env.ASSETS.fetch(request);

    let shell;
    try {
      shell = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
      if (!shell.ok) return env.ASSETS.fetch(request);
    } catch {
      return env.ASSETS.fetch(request);
    }

    const q = url.searchParams.get('lang');
    const lang = LANGS.includes(q) ? q : 'fr';
    let meta = null;
    try { meta = await metaFor(parts, lang, env); } catch { /* database unreachable: serve the plain page */ }

    const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' });
    const status = meta && meta.found === false ? 404 : 200;
    let res = new Response(shell.body, { status, headers });
    if (!meta || !meta.found) return res;

    const set = (attr, value) => ({ element(e) { e.setAttribute(attr, value); } });
    return new HTMLRewriter()
      .on('html', { element(e) { e.setAttribute('lang', lang); e.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr'); } })
      .on('title', { element(e) { e.setInnerContent(meta.title); } })
      .on('meta[name="description"]', set('content', meta.description))
      .on('meta[property="og:title"]', set('content', meta.title))
      .on('meta[property="og:description"]', set('content', meta.description))
      .on('meta[property="og:image"]', set('content', meta.image || `${url.origin}/og.png`))
      .on('head', { element(e) { e.append(`<meta property="og:url" content="${url.origin}${url.pathname.replace(/[<>"&]/g, '')}">`, { html: true }); } })
      .transform(res);
  },
};
