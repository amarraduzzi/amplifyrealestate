// Reading a list of contacts from a CSV file or from cells pasted out of Excel. No imports: pure logic.

export type ImportRow = { line: number; name: string; phone: string | null; whatsapp: string | null; email: string | null };
export type ImportPlan = {
  fresh: ImportRow[];                                   // will be added
  duplicates: { row: ImportRow; why: 'existing' | 'file' }[]; // already known: skipped
  skipped: { line: number; why: 'no_name' }[];           // rows that cannot be used
  droppedNumbers: number;                                // numbers that were too short and left out
};

const HEADERS: Record<'name' | 'phone' | 'whatsapp' | 'email', string[]> = {
  name: ['name', 'full name', 'fullname', 'nom', 'nom complet', 'nom et prenom', 'client', 'contact', 'الاسم', 'الاسم الكامل'],
  phone: ['phone', 'tel', 'telephone', 'tel.', 'mobile', 'gsm', 'portable', 'numero', 'phone number', 'الهاتف', 'رقم الهاتف'],
  whatsapp: ['whatsapp', 'whats app', 'wa', 'wp', 'واتساب'],
  email: ['email', 'e-mail', 'mail', 'courriel', 'adresse mail', 'adresse e-mail', 'البريد الإلكتروني'],
};

const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Split text into rows and cells. Handles quotes, ; , or tab as separator, and a BOM from Excel. */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => first.split(c).length - 1;
  const sep = count('\t') > 0 ? '\t' : count(';') >= count(',') && count(';') > 0 ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Digits only, Moroccan style: +212 6 12 34 56 78, 00212612345678 and 0612345678 are the same number. */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '212' + d.slice(1);
  return d.length >= 8 ? d : null;
}
export const emailKey = (raw: string | null | undefined) => {
  const e = (raw ?? '').trim().toLowerCase();
  return e.includes('@') ? e : null;
};

/** Column positions from the first row, or null when it does not look like a header row. */
export function findColumns(header: string[]): Partial<Record<keyof typeof HEADERS, number>> | null {
  const cols: Partial<Record<keyof typeof HEADERS, number>> = {};
  header.forEach((h, i) => {
    const k = plain(h);
    for (const key of Object.keys(HEADERS) as (keyof typeof HEADERS)[]) {
      if (cols[key] === undefined && HEADERS[key].some(a => plain(a) === k)) cols[key] = i;
    }
  });
  return cols.name === undefined ? null : cols;
}

type Known = { phone: string | null; whatsapp: string | null; email: string | null };

/** Which rows to add, which are already known (in the office or earlier in the file), which cannot be used. */
export function planImport(table: string[][], existing: Known[]): { plan: ImportPlan } | { error: 'empty' | 'no_header' | 'too_many' } {
  if (table.length < 2) return { error: 'empty' };
  const cols = findColumns(table[0]);
  if (!cols) return { error: 'no_header' };
  if (table.length - 1 > 1000) return { error: 'too_many' };

  const seenPhones = new Set<string>(), seenEmails = new Set<string>();
  for (const p of existing) {
    const a = phoneKey(p.phone), b = phoneKey(p.whatsapp), c = emailKey(p.email);
    if (a) seenPhones.add(a); if (b) seenPhones.add(b); if (c) seenEmails.add(c);
  }
  const filePhones = new Set<string>(), fileEmails = new Set<string>();
  const plan: ImportPlan = { fresh: [], duplicates: [], skipped: [], droppedNumbers: 0 };
  const cell = (r: string[], k: keyof typeof HEADERS) => (cols[k] === undefined ? '' : (r[cols[k] as number] ?? '').trim());

  table.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const name = cell(r, 'name').replace(/\s+/g, ' ');
    if (!name) { plan.skipped.push({ line, why: 'no_name' }); return; }
    const keep = (raw: string) => { if (!raw) return null; if (phoneKey(raw)) return raw; plan.droppedNumbers++; return null; };
    const emailRaw = cell(r, 'email');
    const row: ImportRow = {
      line, name: name.slice(0, 200),
      phone: keep(cell(r, 'phone')), whatsapp: keep(cell(r, 'whatsapp')),
      email: emailKey(emailRaw) ? emailRaw.toLowerCase() : null,
    };
    const keys = [phoneKey(row.phone), phoneKey(row.whatsapp)].filter((x): x is string => !!x);
    const mail = emailKey(row.email);
    const inOffice = keys.some(k => seenPhones.has(k)) || (mail !== null && seenEmails.has(mail));
    const inFile = keys.some(k => filePhones.has(k)) || (mail !== null && fileEmails.has(mail));
    if (inOffice || inFile) { plan.duplicates.push({ row, why: inOffice ? 'existing' : 'file' }); return; }
    keys.forEach(k => filePhones.add(k)); if (mail) fileEmails.add(mail);
    plan.fresh.push(row);
  });
  return { plan };
}

export const EXAMPLE_CSV = 'name;phone;whatsapp;email\nSamir Alaoui;06 12 34 56 78;06 12 34 56 78;samir@example.com\nLeila Benani;05 37 00 00 00;;\n';
