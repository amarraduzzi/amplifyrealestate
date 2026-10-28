import { supabase } from './supabase';
import { t } from './i18n';

export const DOC_BUCKET = 'deal-documents';
export const MAX_DOCS = 20;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export type DocKind = 'contract' | 'mandate' | 'receipt' | 'other';
export const DOC_KINDS: DocKind[] = ['contract', 'mandate', 'receipt', 'other'];

export type DealDocument = {
  id: string; org_id: string; deal_id: string; kind: DocKind; file_name: string; mime_type: string; size_bytes: number; created_at: string;
};

export const docKindLabel = (k: DocKind) =>
  t(({ contract: 'Contract', mandate: 'Mandate', receipt: 'Payment receipt', other: 'Other' } as const)[k]);

export const sizeText = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const path = (d: Pick<DealDocument, 'org_id' | 'deal_id' | 'id'>) => `${d.org_id}/${d.deal_id}/${d.id}`;

/** The database answers with short codes; show a sentence. */
export function docError(message: string): string {
  if (message.includes('maximaal_20_documenten')) return t('A deal can have at most {n} documents.', { n: MAX_DOCS });
  if (message.includes('plan_expired') || message.includes('row-level security') || message === 'no_permission') return t('You do not have permission to change this, or your plan has ended.');
  return message;
}

export async function loadDocuments(dealId: string): Promise<DealDocument[]> {
  const { data, error } = await supabase.from('deal_documents')
    .select('id, org_id, deal_id, kind, file_name, mime_type, size_bytes, created_at')
    .eq('deal_id', dealId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DealDocument[];
}

/** Upload one file and register it. Throws a readable message on failure. */
export async function uploadDocument(orgId: string, dealId: string, kind: DocKind, file: File): Promise<void> {
  if (!DOC_TYPES.includes(file.type)) throw new Error(t('Only PDF, JPEG, PNG or WebP files are allowed.'));
  if (file.size > MAX_DOC_BYTES) throw new Error(t('This file is larger than 10 MB.'));
  if (file.size === 0) throw new Error(t('This file is empty.'));
  const id = crypto.randomUUID();
  const key = `${orgId}/${dealId}/${id}`;
  const up = await supabase.storage.from(DOC_BUCKET).upload(key, file, { contentType: file.type, cacheControl: '0' });
  if (up.error) throw new Error(up.error.message);
  const r = await supabase.from('deal_documents').insert({
    id, org_id: orgId, deal_id: dealId, kind, file_name: file.name.trim().slice(0, 200) || 'document', mime_type: file.type, size_bytes: file.size,
  });
  if (r.error) {
    await supabase.storage.from(DOC_BUCKET).remove([key]);
    throw new Error(r.error.message);
  }
}

/** A link that works for one minute, for a member who may read documents. */
export async function documentLink(d: DealDocument): Promise<string> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path(d), 60, { download: false });
  if (error || !data) throw new Error(error?.message ?? 'link');
  return data.signedUrl;
}

export async function deleteDocument(d: DealDocument): Promise<string | null> {
  const r = await supabase.from('deal_documents').delete().eq('id', d.id).select('id');
  if (r.error) return r.error.message;
  if (!r.data?.length) return 'no_permission';
  await supabase.storage.from(DOC_BUCKET).remove([path(d)]);
  return null;
}
