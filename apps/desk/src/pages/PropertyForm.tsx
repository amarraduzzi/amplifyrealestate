import { useState, type FormEvent } from 'react';
import { dirhamToCents, type DealPurpose, type PropertyStatus, type PropertyType } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import { PURPOSES, TYPES, purposeLabel, statusLabel, typeLabel } from '../lib/labels';
import { Btn, Field, Modal, inputCls } from '../components/ui';

const num = (s: string) => (s.trim() === '' ? null : Number(s));

export function PropertyForm({ orgId, onClose, onSaved }: { orgId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState<DealPurpose>('rent_long');
  const [type, setType] = useState<PropertyType>('apartment');
  const [status, setStatus] = useState<PropertyStatus>('available');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [hood, setHood] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [area, setArea] = useState('');
  const [furnished, setFurnished] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = num(price), b = num(beds), ba = num(baths), a = num(area);
    if ([p, b, ba, a].some(x => x !== null && (!Number.isFinite(x) || x < 0))) { setError(t('Please check the numbers: they cannot be negative.')); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.from('properties').insert({
      org_id: orgId,
      title: title.trim(),
      purpose, property_type: type, status,
      price_cents: p === null ? null : dirhamToCents(p),
      city: city.trim() || null,
      neighborhood: hood.trim() || null,
      bedrooms: b === null ? null : Math.round(b),
      bathrooms: ba === null ? null : Math.round(ba),
      area_m2: a === null || a === 0 ? null : a,
      furnished: furnished === '' ? null : furnished === 'yes',
      description: desc.trim() || null,
    });
    setBusy(false);
    if (error) setError(error.message); else onSaved();
  };

  return (
    <Modal title={t('Add a property')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="property-form" disabled={busy}>{busy ? '…' : t('Save property')}</Btn></div>}>
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
          <Field label={t('Status')}>
            <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as PropertyStatus)}>
              {(['draft', 'available'] as const).map(x => <option key={x} value={x}>{statusLabel(x)}</option>)}
            </select>
          </Field>
          <Field label={t('City')}><input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder="Rabat" /></Field>
          <Field label={t('Neighborhood')}><input className={inputCls} value={hood} onChange={e => setHood(e.target.value)} placeholder="Agdal" /></Field>
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
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
