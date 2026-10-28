import { useEffect, useState } from 'react';
import { Banknote, Check, Copy, Gavel, Megaphone, Wrench } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { loadResidentPortal, type ResidentPortalData } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { getLang, LOCALE, PORTAL_LANGS, t } from '../lib/i18n';
import { Layout } from '../components/Layout';
import { ContactBar } from '../components/ContactBar';
import { Failed, Loading, NotFound } from './States';

const day = (d: string) => new Intl.DateTimeFormat(LOCALE[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(d.length === 10 ? `${d}T00:00:00Z` : d));
const when = (d: string) => new Intl.DateTimeFormat(LOCALE[getLang()], { dateStyle: 'full', timeStyle: 'short' }).format(new Date(d));
const today = () => new Date().toISOString().slice(0, 10);
type Res = ResidentPortalData['assemblies'][number]['resolutions'][number];
const adopted = (r: Res, total: number) => r.majority === 'simple' ? r.for > r.against : r.majority === 'absolute' ? r.for > total / 2 : r.for >= total * 0.75;

function Rib({ rib }: { rib: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(rib); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* */ } }}
      className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-start text-xs">
      <span><span className="block text-muted">{t('Pay by transfer to the syndic account (RIB)')}</span><span className="tabular font-semibold" dir="ltr">{rib}</span></span>
      {ok ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4 text-muted" />}
    </button>
  );
}

/** What a co-owner sees behind the personal link from the syndic: their charges, announcements, works and general meetings. */
export function ResidentPortal({ token }: { token: string }) {
  const [state, retry] = useFetch(() => loadResidentPortal(token), token);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    document.title = data ? `${data.residence.name} · ${data.lot.label}` : 'Amplify Real Estate';
    let m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'robots'); document.head.appendChild(m); }
    m.setAttribute('content', 'noindex, nofollow');
  }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This link is no longer valid. Ask your syndic for a new one.')} />;

  const { office, residence, lot } = data;
  const due = data.charges.filter(c => c.due_date <= today()).reduce((s, c) => s + c.amount_cents - c.paid_cents, 0);
  const upcoming = data.charges.filter(c => c.due_date > today()).reduce((s, c) => s + c.amount_cents - c.paid_cents, 0);
  const first = (lot.owner ?? '').trim().split(/\s+/)[0] ?? '';
  const share = lot.total_tantiemes ? (Number(lot.tantiemes) / Number(lot.total_tantiemes) * 100).toFixed(1) : '0';
  const message = t('Hello, this is {name}, lot {lot} in {residence}.', { name: lot.owner ?? '', lot: lot.label, residence: residence.name });

  return (
    <Layout office={office} stickyBar langs={PORTAL_LANGS}>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{first ? t('Hello {name}', { name: first }) : residence.name}</h1>
          <p className="mt-1 text-sm text-muted">{residence.name} · {t('lot {lot}', { lot: lot.label })}{lot.floor ? ` · ${t('floor {n}', { n: lot.floor })}` : ''} · {t('{a} of {b} tantièmes ({pct}%)', { a: Number(lot.tantiemes), b: Number(lot.total_tantiemes), pct: share })}</p>
        </div>

        <section className="card rise rounded-3xl p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Banknote className="h-5 w-5 text-brand" /> {t('Your charges')}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className={`rounded-2xl p-3 ${due > 0 ? 'bg-danger/10' : 'bg-ok/10'}`}><p className={`font-display tabular text-lg font-bold ${due > 0 ? 'text-danger' : 'text-ok'}`}>{formatMad(due)}</p><p className="text-xs text-muted">{due > 0 ? t('To pay now') : t('Nothing overdue')}</p></div>
            <div className="rounded-2xl bg-surface-2 p-3"><p className="font-display tabular text-lg font-bold">{formatMad(upcoming)}</p><p className="text-xs text-muted">{t('Coming up')}</p></div>
          </div>
          {residence.rib && (due > 0 || upcoming > 0) && <Rib rib={residence.rib} />}
          {data.charges.length === 0 ? <p className="mt-3 text-sm text-muted">{t('No calls for funds yet.')}</p> : (
            <ul className="mt-3 divide-y divide-line/[0.07] text-sm">
              {data.charges.map((c, i) => {
                const paid = c.paid_cents >= c.amount_cents; const late = !paid && c.due_date < today();
                return (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0"><span className="block font-semibold">{c.title}</span><span className="text-xs text-muted">{t('Due {date}', { date: day(c.due_date) })}</span></span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular">{formatMad(c.amount_cents)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${paid ? 'bg-ok/10 text-ok' : late ? 'bg-danger/10 text-danger' : 'bg-surface-2 text-muted'}`}>
                        {paid ? t('Paid') : c.paid_cents > 0 ? t('{amount} paid', { amount: formatMad(c.paid_cents) }) : late ? t('Late') : t('To be paid')}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {data.announcements.length > 0 && (
          <section className="card rise rounded-3xl p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Megaphone className="h-5 w-5 text-brand" /> {t('Announcements')}</h2>
            <ul className="mt-3 space-y-2.5">
              {data.announcements.map((a, i) => (
                <li key={i} className="rounded-2xl bg-surface-2 p-3 text-sm">
                  <p className="font-semibold">{a.title} <span className="text-xs font-normal text-muted">· {day(a.date)}</span></p>
                  {a.body && <p className="mt-1 whitespace-pre-line">{a.body}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.incidents.length > 0 && (
          <section className="card rise rounded-3xl p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Wrench className="h-5 w-5 text-brand" /> {t('Works in the building')}</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {data.incidents.map((x, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
                  <span className="min-w-0"><span className="block font-semibold">{x.title}</span><span className="text-xs text-muted">{x.location ? `${x.location} · ` : ''}{day(x.reported_on)}</span></span>
                  <span className={`shrink-0 text-xs font-bold ${x.status === 'done' ? 'text-ok' : 'text-warn'}`}>{x.status === 'done' ? t('Done') : x.status === 'in_progress' ? t('In progress') : t('Reported')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.assemblies.length > 0 && (
          <section className="card rise rounded-3xl p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Gavel className="h-5 w-5 text-brand" /> {t('General meetings')}</h2>
            <ul className="mt-3 space-y-3">
              {data.assemblies.map((a, i) => (
                <li key={i} className="rounded-2xl bg-surface-2 p-3 text-sm">
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-xs text-muted">{when(a.held_at)}{a.place ? ` · ${a.place}` : ''} · {a.status === 'held' ? t('Held') : t('Planned')}</p>
                  {a.resolutions.length > 0 && (
                    <ol className="mt-2 space-y-1.5">
                      {a.resolutions.map(r => (
                        <li key={r.position} className="flex items-start justify-between gap-2">
                          <span>{r.position}. {r.text}</span>
                          {a.status === 'held' && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${adopted(r, Number(lot.total_tantiemes)) ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>{adopted(r, Number(lot.total_tantiemes)) ? t('Adopted') : t('Rejected')}</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-center text-xs text-muted">{t('Updated {date}.', { date: day(data.generated_at) })} {t('This page is personal. Do not share the link.')}</p>
      </div>
      <ContactBar office={office} message={message} sticky />
    </Layout>
  );
}
