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
    project: n => `Programme neuf · ${n} lots disponibles`, from: 'à partir de',
  },
  en: {
    types: { apartment: 'Apartment', villa: 'Villa', riad: 'Riad', house: 'House', land: 'Land', shop: 'Shop', office: 'Office', building: 'Building', other: 'Property' },
    purposes: { sale: 'for sale', rent_long: 'for rent', rent_short: 'short-term rent' },
    suffix: { rent_long: ' / month', rent_short: ' / night' },
    status: { reserved: 'Reserved', rented: 'Rented', sold: 'Sold' },
    office: (name, city) => `Available properties from ${name}${city ? ` in ${city}` : ''}`,
    project: n => `New build · ${n} units available`, from: 'from',
  },
  ar: {
    types: { apartment: 'شقة', villa: 'فيلا', riad: 'رياض', house: 'منزل', land: 'أرض', shop: 'محل تجاري', office: 'مكتب', building: 'عمارة', other: 'عقار' },
    purposes: { sale: 'للبيع', rent_long: 'للكراء', rent_short: 'كراء قصير الأمد' },
    suffix: { rent_long: ' / الشهر', rent_short: ' / الليلة' },
    status: { reserved: 'محجوز', rented: 'مكترى', sold: 'مباع' },
    office: (name, city) => `العقارات المتوفرة لدى ${name}${city ? ` في ${city}` : ''}`,
    project: n => `مشروع جديد · ${n} وحدة متوفرة`, from: 'ابتداء من',
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
  if (parts.length === 3 && parts[1] === 'projet') {
    const project = (parts[2] || '').toLowerCase();
    if (!SLUG.test(project)) return { found: false };
    const d = await rpc(env, 'public_project_page', { p_slug: slug, p_project: project });
    if (!d) return { found: false };
    const p = d.project;
    const from = (d.units || []).map(u => u.price_cents).filter(x => x !== null && x !== undefined);
    const description = [w.project(p.available_units), from.length ? `${w.from} ${price(Math.min(...from), 'sale', w)}` : null, p.city, d.office.name].filter(Boolean).join(' · ');
    const image = p.photos && p.photos[0] ? `${String(env.VITE_SUPABASE_URL).replace(/\/+$/, '')}/storage/v1/object/public/property-photos/${p.photos[0]}_t.jpg` : null;
    return { found: true, title: p.name, description, image };
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

const icsDate = d => String(d).replace(/-/g, '');
async function ical(token, env) {
  if (!/^[0-9a-f]{64}$/.test(token) || !env.VITE_SUPABASE_URL) return new Response('Not found', { status: 404 });
  let d = null;
  try { d = await rpc(env, 'public_ical', { p_token: token }); } catch { return new Response('Unavailable', { status: 503 }); }
  if (!d) return new Response('Not found', { status: 404 });
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Amplify Real Estate//Stays//FR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${String(d.title).replace(/[\r\n,;]/g, ' ')}`];
  for (const b of d.busy) {
    lines.push('BEGIN:VEVENT', `UID:${b.id}@amplify-real-estate`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${icsDate(b.start)}`, `DTEND;VALUE=DATE:${icsDate(b.end)}`, 'SUMMARY:Réservé', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

// The desk asks the worker to fetch a channel calendar. Only for signed-in users of the platform, only https, only public
// hosts, at most 2 MB, and only when the answer really is a calendar.
const CORS = origin => ({ 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': 'authorization', vary: 'origin' });
async function icalProxy(request, url, env) {
  const h = CORS(request.headers.get('origin'));
  const deny = (status, text) => new Response(text, { status, headers: { ...h, 'content-type': 'text/plain' } });
  const auth = request.headers.get('authorization') || '';
  if (!/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(auth) || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return deny(401, 'unauthorized');
  try {
    const who = await fetch(`${String(env.VITE_SUPABASE_URL).replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: auth } });
    if (!who.ok) return deny(401, 'unauthorized');
  } catch { return deny(503, 'unavailable'); }
  let target;
  try { target = new URL(url.searchParams.get('url') || ''); } catch { return deny(400, 'invalid'); }
  const host = target.hostname.toLowerCase();
  if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443')
      || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return deny(400, 'invalid');
  try {
    const r = await fetch(target.toString(), { redirect: 'follow', headers: { accept: 'text/calendar, text/plain, */*', 'user-agent': 'AmplifyRealEstate/1.0' } });
    if (!r.ok) return deny(502, `status_${r.status}`);
    const text = await r.text();
    if (text.length > 2_000_000 || !text.includes('BEGIN:VCALENDAR')) return deny(422, 'not_calendar');
    return new Response(text, { headers: { ...h, 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' } });
  } catch { return deny(502, 'unreachable'); }
}

const xmlEsc = v => String(v ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const tag = (n, v) => (v === null || v === undefined || v === '' ? '' : `<${n}>${xmlEsc(v)}</${n}>`);
/** The available properties of one office as XML, for portals that agreed to pick them up. */
async function feed(token, url, env) {
  if (!/^[0-9a-f]{64}$/.test(token) || !env.VITE_SUPABASE_URL) return new Response('Not found', { status: 404 });
  let d = null;
  try { d = await rpc(env, 'public_listing_feed', { p_token: token }); } catch { return new Response('Unavailable', { status: 503 }); }
  if (!d) return new Response('Not found', { status: 404 });
  const base = `${String(env.VITE_SUPABASE_URL).replace(/\/+$/, '')}/storage/v1/object/public/property-photos/`;
  const o = d.office;
  const items = (d.properties || []).map(p => [
    '<property>', tag('reference', p.reference), tag('title', p.title), tag('type', p.property_type), tag('transaction', p.purpose),
    tag('price', p.price_cents === null ? null : Math.round(p.price_cents / 100)), '<currency>MAD</currency>',
    tag('city', p.city), tag('neighborhood', p.neighborhood), tag('bedrooms', p.bedrooms), tag('bathrooms', p.bathrooms),
    tag('area_m2', p.area_m2), tag('furnished', p.furnished === null ? null : p.furnished ? 'yes' : 'no'), tag('description', p.description),
    tag('url', `${url.origin}/${o.slug}/${encodeURIComponent(p.reference)}`), tag('updated_at', p.updated_at),
    '<photos>', ...(p.photos || []).map(x => tag('photo', `${base}${x}.jpg`)), '</photos>', '</property>',
  ].join('')).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<listings generated_at="${new Date().toISOString()}" count="${(d.properties || []).length}">\n`
    + `<agency>${tag('name', o.name)}${tag('city', o.city)}${tag('phone', o.phone)}${tag('whatsapp', o.whatsapp)}${tag('email', o.email)}${tag('url', `${url.origin}/${o.slug}`)}</agency>\n${items}\n</listings>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let parts = url.pathname.split('/').filter(Boolean);
    if (request.method === 'OPTIONS' && parts[0] === 'api' && parts[1] === 'ical') return new Response(null, { status: 204, headers: { ...CORS(request.headers.get('origin')), 'access-control-allow-methods': 'GET' } });
    // /ical/<code>.ics: the busy dates of a short-term rental, for Airbnb, Booking or Google Calendar
    if (parts[0] === 'ical' && parts.length === 2 && request.method === 'GET') return ical(parts[1].replace(/\.ics$/, ''), env);
    // /feed/<code>.xml: the available properties of an office, for portals
    if (parts[0] === 'feed' && parts.length === 2 && request.method === 'GET') return feed(parts[1].replace(/\.xml$/, ''), url, env);
    // /api/ical?url=...: fetch the iCal calendar of Airbnb or Booking for a signed-in team member (the browser may not read it directly)
    if (parts[0] === 'api' && parts[1] === 'ical' && parts.length === 2 && request.method === 'GET') return icalProxy(request, url, env);
    // /o/<code> (owner), /r/<code> (co-owner), /g/<code> (guest) and /c/<code> (cleaner): private pages. Plain page, never cached, never in search engines.
    if ((parts[0] === 'o' || parts[0] === 'r' || parts[0] === 'g' || parts[0] === 'c') && parts.length === 2 && request.method === 'GET') {
      try {
        const r = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
        const h = new Headers(r.headers);
        h.set('x-robots-tag', 'noindex, nofollow'); h.set('cache-control', 'no-store'); h.set('referrer-policy', 'no-referrer');
        return new Response(r.body, { status: 200, headers: h });
      } catch { return env.ASSETS.fetch(request); }
    }
    const isProject = (parts.length === 3 && parts[1] === 'projet') || (parts.length === 2 && parts[0] === 'projet');
    const looksLikePage = request.method === 'GET' && (parts.length <= 2 || isProject) && !(parts.length && parts[parts.length - 1].includes('.'));
    if (!looksLikePage) return env.ASSETS.fetch(request);
    const own = await domainSlug(url.hostname, env);
    if (own) parts = parts.length === 0 ? [own] : parts.length === 2 && parts[0] === 'projet' ? [own, 'projet', parts[1]] : parts.length === 1 ? [own, parts[0]] : [];
    const isPage = (parts.length >= 1 && parts.length <= 2 && parts[0] !== 'projet') || (parts.length === 3 && parts[1] === 'projet');
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
