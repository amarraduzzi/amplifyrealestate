import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { CONDITION_FR, type InspPhoto, type Inspection } from '../lib/inspections';
import { Btn } from '../components/ui';

const frDate = (d: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

/** The état des lieux as a printable document, in French. For an exit report the state at check-in is shown next to it. */
export function InspectionDoc({ office, inspection: i, entry, photos, urls, property, tenant, onClose }: {
  office: Office; inspection: Inspection; entry?: Inspection; photos: InspPhoto[]; urls: Record<string, string>;
  property: { title: string; reference: string; address?: string | null }; tenant: string; onClose: () => void;
}) {
  const exit = i.kind === 'exit';
  const before = (room: string, label: string) => entry?.rooms.find(r => r.name === room)?.items.find(x => x.label === label)?.condition ?? null;
  const meters = [['Eau', i.meters.water], ['Électricité', i.meters.electricity], ['Gaz', i.meters.gas]].filter(([, v]) => v);

  return createPortal((
    <div className="report-overlay fixed inset-0 z-[60] overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-3xl rounded-2xl bg-white p-5 text-[#111] shadow-2xl sm:p-8" dir="ltr" lang="fr">
        <div className="no-print mb-5 flex items-center justify-between gap-2">
          <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
          <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
        </div>

        <div className="text-[12.5px] leading-snug">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <p className="text-lg font-bold">{office.name}</p>
            <div className="text-right">
              <p className="text-xl font-black uppercase tracking-wide">État des lieux {exit ? 'de sortie' : "d'entrée"}</p>
              <p>Date : {frDate(i.inspected_on)}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-black/15 p-3"><p className="text-[11px] font-bold uppercase text-black/60">Bien</p><p className="font-semibold">{property.title}</p><p>Réf. {property.reference}{property.address ? ` · ${property.address}` : ''}</p></div>
            <div className="rounded-lg border border-black/15 p-3"><p className="text-[11px] font-bold uppercase text-black/60">Locataire</p><p className="font-semibold">{i.tenant_name || tenant}</p></div>
          </div>

          {meters.length > 0 && <p className="mt-4"><span className="font-semibold">Relevés des compteurs : </span>{meters.map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
          {i.keys_note && <p className="mt-1"><span className="font-semibold">Clés remises : </span>{i.keys_note}</p>}

          {i.rooms.map((r, ri) => {
            const rp = photos.filter(p => p.room === ri && urls[p.id]);
            return (
              <div key={ri} className="mt-5 break-inside-avoid">
                <h3 className="border-b-2 border-black/70 pb-1 text-sm font-bold uppercase tracking-wide">{r.name}</h3>
                <table className="w-full border-collapse">
                  <thead><tr className="text-left text-[10.5px] uppercase text-black/60">
                    <th className="py-1 pr-2">Élément</th>{exit && <th className="w-24 py-1 pr-2">À l'entrée</th>}<th className="w-24 py-1 pr-2">{exit ? 'À la sortie' : 'État'}</th><th className="py-1">Observations</th>
                  </tr></thead>
                  <tbody>
                    {r.items.map((it, ii) => {
                      const b = exit ? before(r.name, it.label) : null;
                      const worse = exit && b && it.condition && ['new', 'good', 'fair', 'poor'].indexOf(it.condition) > ['new', 'good', 'fair', 'poor'].indexOf(b);
                      return (
                        <tr key={ii} className="border-b border-black/10 align-top">
                          <td className="py-1 pr-2">{it.label}</td>
                          {exit && <td className="py-1 pr-2">{b ? CONDITION_FR[b] : '—'}</td>}
                          <td className={`py-1 pr-2 ${worse ? 'font-bold text-red-700' : ''}`}>{it.condition ? CONDITION_FR[it.condition] : '—'}</td>
                          <td className="py-1">{it.note}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rp.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {rp.map(p => <img key={p.id} src={urls[p.id]} alt="" className="aspect-[4/3] w-full rounded object-cover" />)}
                  </div>
                )}
              </div>
            );
          })}

          {i.general_note && <div className="mt-5"><p className="font-semibold">Observations générales</p><p className="whitespace-pre-line">{i.general_note}</p></div>}

          <p className="mt-6 text-[11px] text-black/70">Le présent état des lieux a été établi contradictoirement entre les parties, qui en reconnaissent l'exactitude.</p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            {[['Le locataire', i.tenant_name || tenant, i.tenant_signature], ["Pour l'agence", i.agent_name || office.name, i.agent_signature]].map(([who, name, sig]) => (
              <div key={who as string} className="rounded-lg border border-black/15 p-3">
                <p className="text-[11px] font-bold uppercase text-black/60">{who}</p>
                <p className="font-semibold">{name}</p>
                {sig ? <img src={sig as string} alt="" className="mt-1 h-20 w-full object-contain" /> : <div className="mt-1 h-20" />}
              </div>
            ))}
          </div>
          {i.signed_at && <p className="mt-2 text-[11px] text-black/60">Signé électroniquement le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(i.signed_at))}.</p>}
        </div>
      </div>
    </div>
  ), document.body);
}
