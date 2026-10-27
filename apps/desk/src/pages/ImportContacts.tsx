import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { DealPurpose } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import { EXAMPLE_CSV, parseTable, planImport, type ImportPlan } from '../lib/importContacts';
import { Btn, Modal, inputCls } from '../components/ui';

type Purpose = 'none' | DealPurpose;

/** A file from French Excel is often not UTF-8 (accents): try UTF-8 first, then Windows-1252. */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}

/** Add many contacts at once from a CSV file or from cells pasted out of Excel. People who are already known (same number or e-mail) are skipped. */
export function ImportContacts({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [purpose, setPurpose] = useState<Purpose>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const check = async (raw: string) => {
    setError(null); setPlan(null);
    setBusy(true);
    const { data, error: e } = await supabase.from('people').select('phone, whatsapp, email').eq('org_id', orgId);
    setBusy(false);
    if (e) { setError(e.message); return; }
    const r = planImport(parseTable(raw), (data ?? []) as { phone: string | null; whatsapp: string | null; email: string | null }[]);
    if ('error' in r) {
      setError(r.error === 'empty' ? t('No rows found. The first row must contain the column names.')
        : r.error === 'no_header' ? t('The first row must contain column names, at least a name column (for example: name, phone, whatsapp, email).')
        : t('At most 1000 rows at a time.'));
      return;
    }
    setPlan(r.plan);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const raw = await readText(f);
    setText(raw);
    await check(raw);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + EXAMPLE_CSV], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'contacts-example.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    if (!plan || plan.fresh.length === 0 || busy) return;
    setBusy(true); setError(null);
    let n = 0;
    for (let i = 0; i < plan.fresh.length; i += 100) {
      const batch = plan.fresh.slice(i, i + 100);
      const ins = await supabase.from('people')
        .insert(batch.map(r => ({ org_id: orgId, full_name: r.name, phone: r.phone, whatsapp: r.whatsapp, email: r.email })))
        .select('id');
      if (ins.error || !ins.data) { setError(`${t('{n} contacts were added before an error stopped the import.', { n })} ${ins.error?.message ?? ''}`); setBusy(false); if (n > 0) onDone(); return; }
      n += ins.data.length;
      if (purpose !== 'none') {
        const l = await supabase.from('leads').insert(ins.data.map(p => ({ org_id: orgId, person_id: p.id, purpose })));
        if (l.error) { setError(`${t('{n} contacts were added before an error stopped the import.', { n })} ${l.error.message}`); setBusy(false); onDone(); return; }
      }
    }
    setBusy(false); setAdded(n); onDone();
  };

  return (
    <Modal title={t('Import contacts')} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <Btn onClick={onClose}>{added !== null ? t('Close') : t('Cancel')}</Btn>
        {added === null && <Btn tone="brand" onClick={run} disabled={busy || !plan || plan.fresh.length === 0}>{t('Import {n} contacts', { n: plan?.fresh.length ?? 0 })}</Btn>}
      </div>}>
      {added !== null ? (
        <p className="rounded-xl bg-ok/10 px-3 py-3 text-sm font-semibold text-ok">{t('{n} contacts added.', { n: added })}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('Choose a CSV file, or paste the cells from Excel below. The first row holds the column names: name (required), phone, whatsapp and email.')}</p>
          <div className="flex flex-wrap gap-2">
            <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
            <Btn tone="ghost" onClick={() => file.current?.click()} disabled={busy}><Upload className="h-4 w-4" /> {t('Choose file')}</Btn>
            <Btn tone="ghost" onClick={download}><Download className="h-4 w-4" /> {t('Download example')}</Btn>
          </div>
          <textarea className={`${inputCls} min-h-[7rem] font-mono text-xs`} dir="ltr" value={text} onChange={e => { setText(e.target.value); setPlan(null); }}
            placeholder={'name;phone;whatsapp;email'} aria-label={t('Pasted contacts')} />
          <Btn tone="ghost" onClick={() => check(text)} disabled={busy || !text.trim()}>{t('Check')}</Btn>

          {plan && (
            <div className="space-y-3 rounded-2xl bg-surface-2 p-3.5">
              <p className="text-sm font-semibold">{t('{n} new contacts will be added.', { n: plan.fresh.length })}</p>
              {plan.duplicates.length > 0 && <p className="text-sm text-muted">{t('{n} already exist (same number or e-mail) and are skipped.', { n: plan.duplicates.length })}</p>}
              {plan.skipped.length > 0 && <p className="text-sm text-warn">{t('{n} rows without a name are skipped.', { n: plan.skipped.length })}</p>}
              {plan.droppedNumbers > 0 && <p className="text-sm text-warn">{t('{n} numbers were too short and left out.', { n: plan.droppedNumbers })}</p>}
              {plan.fresh.length > 0 && (
                <>
                  <ul className="max-h-36 overflow-y-auto text-sm">
                    {plan.fresh.slice(0, 5).map(r => <li key={r.line} className="truncate">{r.name}<span className="text-muted" dir="ltr"> · {r.whatsapp || r.phone || r.email || '—'}</span></li>)}
                    {plan.fresh.length > 5 && <li className="text-muted">{t('And {n} more.', { n: plan.fresh.length - 5 })}</li>}
                  </ul>
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold">{t('Also add each new contact as a lead?')}</span>
                    <select className={inputCls} value={purpose} onChange={e => setPurpose(e.target.value as Purpose)}>
                      <option value="none">{t('No, contacts only')}</option>
                      <option value="sale">{t('Yes, looking to buy')}</option>
                      <option value="rent_long">{t('Yes, looking to rent')}</option>
                    </select>
                    {purpose !== 'none' && <span className="mt-1 block text-xs text-muted">{t('These leads have no search criteria yet, so every available property of that kind matches. Fill in the search per lead later.')}</span>}
                  </label>
                </>
              )}
            </div>
          )}
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
