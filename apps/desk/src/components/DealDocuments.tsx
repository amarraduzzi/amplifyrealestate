import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import {
  DOC_KINDS, DOC_TYPES, MAX_DOCS, deleteDocument, docError, docKindLabel, documentLink, loadDocuments, sizeText, uploadDocument,
  type DealDocument, type DocKind,
} from '../lib/documents';
import { whenText } from '../lib/dates';
import { Btn, inputCls } from './ui';

/** Documents of one deal (contract, mandate, payment receipt). Only for owner, manager and agent; private storage. */
export function DealDocuments({ office, dealId }: { office: Office; dealId: string }) {
  const canManage = office.role === 'owner' || office.role === 'manager';
  const [docs, setDocs] = useState<DealDocument[] | null>(null);
  const [kind, setKind] = useState<DocKind>('contract');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setDocs(await loadDocuments(dealId)); }
    catch (e) { setError(docError(e instanceof Error ? e.message : String(e))); setDocs([]); }
  }, [dealId]);
  useEffect(() => { load(); }, [load]);

  const onPick = async (files: FileList | null) => {
    if (!files || files.length === 0 || busy) return;
    const room = MAX_DOCS - (docs?.length ?? 0);
    if (room <= 0) { setError(t('A deal can have at most {n} documents.', { n: MAX_DOCS })); return; }
    setBusy(true); setError(null);
    let failed: string | null = null;
    for (const f of Array.from(files).slice(0, room)) {
      try { await uploadDocument(office.id, dealId, kind, f); }
      catch (e) { failed = docError(e instanceof Error ? e.message : String(e)); break; }
    }
    setBusy(false);
    if (failed) setError(failed);
    if (input.current) input.current.value = '';
    await load();
  };

  const open = async (d: DealDocument) => {
    if (busy) return;
    setError(null);
    const w = window.open('about:blank', '_blank');
    try {
      const url = await documentLink(d);
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) {
      w?.close();
      setError(docError(e instanceof Error ? e.message : String(e)));
    }
  };

  const remove = async (d: DealDocument) => {
    if (busy || !window.confirm(t('Delete this document?'))) return;
    setBusy(true); setError(null);
    const err = await deleteDocument(d);
    setBusy(false);
    if (err) setError(docError(err)); else load();
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" /> {t('Documents')}</h3>
        {docs !== null && <span className="tabular text-xs text-muted">{docs.length} / {MAX_DOCS}</span>}
      </div>
      <div className="space-y-3 rounded-2xl bg-surface-2 p-3.5 sm:p-4">
        {docs === null && !error && <p className="text-sm text-muted">…</p>}
        {docs !== null && docs.length === 0 && <p className="text-sm text-muted">{t('No documents yet. Add the contract, the mandate or the payment receipt.')}</p>}
        {docs !== null && docs.length > 0 && (
          <ul className="space-y-1.5">
            {docs.map(d => (
              <li key={d.id} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                <button type="button" onClick={() => open(d)} className="min-w-0 flex-1 text-start" title={t('Open')}>
                  <span className="block truncate text-sm font-semibold hover:underline" dir="auto">{d.file_name}</span>
                  <span className="block text-xs text-muted">{docKindLabel(d.kind)} · {sizeText(d.size_bytes)} · {whenText(d.created_at)}</span>
                </button>
                {canManage && (
                  <button type="button" disabled={busy} onClick={() => remove(d)} aria-label={t('Delete document')} title={t('Delete document')}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-danger/10 text-danger hover:bg-danger/15 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t('Kind')} className={`${inputCls} !w-auto !py-2 text-sm`} value={kind} onChange={e => setKind(e.target.value as DocKind)} disabled={busy}>
            {DOC_KINDS.map(k => <option key={k} value={k}>{docKindLabel(k)}</option>)}
          </select>
          <input ref={input} type="file" accept={DOC_TYPES.join(',')} multiple className="hidden" onChange={e => onPick(e.target.files)} />
          <Btn tone="ghost" onClick={() => input.current?.click()} disabled={busy || (docs?.length ?? 0) >= MAX_DOCS}>
            <Paperclip className="h-4 w-4" /> {busy ? t('Uploading…') : t('Add document')}
          </Btn>
        </div>
        <p className="text-xs text-muted">{t('PDF, JPEG, PNG or WebP, up to 10 MB. Only the owner, managers and agents of this office can see these documents. Do not upload copies of identity cards.')}</p>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </div>
  );
}
