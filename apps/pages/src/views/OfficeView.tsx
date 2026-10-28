import { useEffect, useMemo, useState } from 'react';
import type { DealPurpose } from '@vastgoed/shared';
import { loadOffice, logEvent } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { purposeLabel } from '../lib/format';
import { t } from '../lib/i18n';
import { Layout } from '../components/Layout';
import { ContactBar } from '../components/ContactBar';
import { PropertyCard } from '../components/PropertyCard';
import { InquiryForm } from '../components/InquiryForm';
import { Failed, Loading, NotFound } from './States';

const PURPOSES: DealPurpose[] = ['sale', 'rent_long', 'rent_short'];

export function OfficeView({ slug }: { slug: string }) {
  const [state, retry] = useFetch(() => loadOffice(slug), slug);
  const [purpose, setPurpose] = useState<DealPurpose | 'all'>('all');
  useEffect(() => { setPurpose('all'); }, [slug]);

  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => { document.title = data ? `${data.office.name} · Amplify Real Estate` : 'Amplify Real Estate'; }, [data]);

  useEffect(() => { if (data) logEvent(data.office.slug, null, 'view'); }, [data]);
  const present = useMemo(() => PURPOSES.filter(p => data?.listings.some(l => l.purpose === p)), [data]);
  const shown = useMemo(() => (data?.listings ?? []).filter(l => purpose === 'all' || l.purpose === purpose), [data, purpose]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This page does not exist, or the link is not correct.')} />;

  const { office, listings } = data;
  return (
    <Layout office={office} stickyBar>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Available properties')}</h1>

        {present.length > 1 && (
          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group">
            {(['all', ...present] as const).map(p => (
              <button key={p} type="button" aria-pressed={purpose === p} onClick={() => setPurpose(p)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${purpose === p ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                {p === 'all' ? t('All') : purposeLabel(p)}
              </button>
            ))}
          </div>
        )}

        {listings.length === 0 && <p className="mt-10 text-center text-muted">{t('No properties are online right now.')}</p>}
        <ul className="mt-5 space-y-3">
          {shown.map(p => <li key={p.reference} className="rise"><PropertyCard slug={office.slug} p={p} /></li>)}
        </ul>
        <div className="mt-6"><InquiryForm slug={office.slug} reference={null} askPurpose /></div>
      </div>
      <ContactBar office={office} message={t('Hello, I would like information about your properties.')} sticky />
    </Layout>
  );
}
