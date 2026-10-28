import { useEffect, useState, type FormEvent } from 'react';
import { dirhamToCents, type DealPurpose, type PropertyStatus, type PropertyType } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { PropertyRow } from '../lib/types';
import { PURPOSES, TYPES, purposeLabel, statusLabel, typeLabel } from '../lib/labels';
import { Btn, Field, Modal, inputCls } from '../components/ui';
import { planError } from '../lib/plan';
import { friendly } from '../lib/errors';
import { findDuplicates, type DupRow } from '../lib/duplicates';

const num = (s: string) => (s.trim() === '' ? null : Number(s));
const str = (x: number | null | undefined) => (x === null || x === undefined ? '' : String(x));

/** Add a property, or (with `property`) edit an existing one. Status is changed from the detail screen. */
export function PropertyForm({ orgId, property, onClose, onSaved }: {
  orgId: string; property?: PropertyRow; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!property;
  const [title, setTitle] = useState(property?.title ?? '');
  const [purpose, setPurpose] = useState<DealPurpose>(property?.purpose ?? 'rent_long');
  const [type, setType] = useState<PropertyType>(property?.property_type ?? 'apartment');
  const [status, setStatus] = useState<PropertyStatus>('available');
  const [price, setPrice] = useState(property?.price_cents == null ? '' : str(property.price_cents / 100));
  const [city, setCity] = useState(property?.city ?? '');
  const [hood, setHood] = useState(property?.neighborhood ?? '');
  const [beds, setBeds] = useState(str(property?.bedrooms));
  const [baths, setBaths] = useState(str(property?.bathrooms));
  const [area, setArea] = useState(str(property?.area_m2 === undefined || property?.area_m2 === null ? null : Number(property.area_m2)));
  const [furnished, setFurnished] = useState(property?.furnished == null ? '' : property.furnished ? 'yes' : 'no');
  const [desc, setDesc] = useState(property?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dups, setDups] = useState<DupRow[]>([]);

  // While adding: warn when the same property seems to be in the list already.
  useEffect(() => {
    if (editing) return;
    const a = num(area), pr = num(price);
    const id = window.setTimeout(async () => {
      setDups(await findDuplicates(orgId, {
        purpose, property_type: type, city: city.trim() || null, neighborhood: hood.trim() || null,
        area_m2: a === null || !Number.isFinite(a) || a === 0 ? null : a,
        price_cents: pr === null || !Number.isFinite(pr) ? null : dirhamToCents(pr),
      }));
    }, 600);
    return () => window.clearTimeout(id);
  }, [editing, orgId, purpose, type, city, hood, area, price]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = num(price), b = num(beds), ba = num(baths), a = num(area);
    if ([p, b, ba, a].some(x => x !== null && (!Number.isFinite(x) || x < 0))) { setError(t('Please check the numbers: they cannot be negative.')); return; }
    const priceCents = p === null ? null : dirhamToCents(p);
    const fields = {
      title: title.trim(),
      purpose, property_type: type,
      price_cents: priceCents,
      city: city.trim() || null,
      neighborhood: hood.trim() || null,
      bedrooms: b === null ? null : Math.round(b),
      bathrooms: ba === null ? null : Math.round(ba),
      area_m2: a === null || a === 0 ? null : a,
      furnished: furnished === '' ? null : furnished === 'yes',
      description: desc.trim() || null,
    };
    setBusy(true); setError(null);

    if (!property) {
      const { error } = await supabase.from('properties').insert({ org_id: orgId, status, ...fields });
      setBusy(false);
      if (error) setError(planError(error.message)); else onSaved();
      return;
    }

    const { data, error } = await supabase.from('properties').update(fields).eq('id', property.id).select('id');
    if (error) { setBusy(false); setError(planError(error.message)); return; }
    if (!data?.length) { setBusy(false); setError(t('You do not have permission to change this property.')); return; }
    // A new price counts as a fresh confirmation of price and availability.
    if (priceCents !== property.price_cents) {
      const r = await supabase.rpc('confirm_property_info', { p_property: property.id });
      if (r.error) { setBusy(false); setError(friendly(r.error)); return; }
    }
    setBusy(false);
    onSaved();
  };

  return (
    <Modal title={editing ? t('Edit property') : t('Add a property')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="property-form" disabled={busy}>{busy ? '…' : editing ? t('Save changes') : t('Save property')}</Btn></div>}>
      <form id="property-form" onSubmit={submit} className="space-y-4">
        <Field label={t('Title')}>
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder={t('e.g. Bright 2-bedroom apartment in Agdal')} maxLength={200} required autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Offer')}>
            <select className={inputCls} value={purpose} onChange={e => setPurpose(e.target.value as DealPurpose)}>
              {PURPOSES.map(x => <option key={x} value={x}>{purposeLabel(x)}</option>)}
            </select>
          </Field>
          <Field label={t('Type')}>
            <select className={inputCls} value={type} onChange={e => setType(e.target.value as PropertyType)}>
              {TYPES.map(x => <option key={x} value={x}>{typeLabel(x)}</option>)}
            </select>
          </Field>
          <Field label={t('Price (DH)')} hint={purpose === 'rent_long' ? t('Per month') : purpose === 'rent_short' ? t('Per night') : t('Total price')}>
            <input className={inputCls} dir="ltr" inputMode="decimal" type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} />
          </Field>
          {!editing && (
            <Field label={t('Status')}>
              <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as PropertyStatus)}>
                {(['draft', 'available'] as const).map(x => <option key={x} value={x}>{statusLabel(x)}</option>)}
              </select>
            </Field>
          )}
          <Field label={t('City')}><input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder={t('Rabat')} /></Field>
          <Field label={t('Neighborhood')}><input className={inputCls} value={hood} onChange={e => setHood(e.target.value)} placeholder={t('Agdal')} /></Field>
          <Field label={t('Bedrooms')}><input className={inputCls} dir="ltr" inputMode="numeric" type="number" min="0" value={beds} onChange={e => setBeds(e.target.value)} /></Field>
          <Field label={t('Bathrooms')}><input className={inputCls} dir="ltr" inputMode="numeric" type="number" min="0" value={baths} onChange={e => setBaths(e.target.value)} /></Field>
          <Field label={t('Area (m²)')}><input className={inputCls} dir="ltr" inputMode="decimal" type="number" min="0" step="any" value={area} onChange={e => setArea(e.target.value)} /></Field>
          <Field label={t('Furnished')}>
            <select className={inputCls} value={furnished} onChange={e => setFurnished(e.target.value)}>
              <option value="">{t('Not specified')}</option>
              <option value="yes">{t('Furnished')}</option>
              <option value="no">{t('Unfurnished')}</option>
            </select>
          </Field>
        </div>
        <Field label={t('Description')}>
          <textarea className={inputCls} rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
        </Field>
        {!editing && dups.length > 0 && (
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm"><span className="font-semibold">{t('This may be a duplicate')}:</span> {dups.map(d => `${d.reference} · ${d.title}`).join(' | ')}</p>
        )}
        {editing && <p className="text-xs text-muted">{t('Changing the price is recorded in the history and counts as a new confirmation.')}</p>}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
