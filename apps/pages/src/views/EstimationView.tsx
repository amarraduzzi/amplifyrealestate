import { useEffect } from 'react';
import { ShieldCheck, Clock, MessageCircle } from 'lucide-react';
import { loadOffice, logEvent } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { t } from '../lib/i18n';
import { Link, officePath } from '../lib/router';
import { Layout } from '../components/Layout';
import { EstimateBox } from '../components/EstimateBox';
import { ContactBar } from '../components/ContactBar';
import { Failed, Loading, NotFound } from './States';

export const splitAreas = (s: string | null | undefined) => (s ?? '').split(/[,·\n]/).map(x => x.trim()).filter(Boolean);

/** "Combien vaut mon bien ?" as its own page: the link an office shares with owners. */
export function EstimationView({ slug }: { slug: string }) {
  const [state, retry] = useFetch(() => loadOffice(slug), slug, 'office');
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => { document.title = data ? `${t('Free estimate')} · ${data.office.name}` : 'Amplify Real Estate'; }, [data]);
  useEffect(() => { if (data) logEvent(data.office.slug, null, 'view'); }, [data]);
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This page does not exist, or the link is not correct.')} />;
  const { office, site } = data;
  const hello = t('Hello, I would like an estimate of my property.');
  const points = [
    { icon: <ShieldCheck className="h-5 w-5" />, text: t('Free and without obligation') },
    { icon: <Clock className="h-5 w-5" />, text: t('A first range in 30 seconds') },
    { icon: <MessageCircle className="h-5 w-5" />, text: t('Confirmed by a local agent') },
  ];
  return (
    <Layout office={office} stickyBar wide brand={office.style} site={office}>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-sm text-muted"><Link to={officePath(office.slug)} className="font-semibold text-brand hover:underline">{office.name}</Link></p>
        <h1 className="mt-2 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">{t('How much is my property worth?')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">{t('Based on the real properties of {office} in your neighborhood. You see a range right away.', { office: office.name })}</p>
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
          {points.map(p => <li key={p.text} className="inline-flex items-center gap-2 text-sm font-semibold"><span className="text-brand">{p.icon}</span>{p.text}</li>)}
        </ul>
        <div className="mt-8"><EstimateBox slug={office.slug} areas={splitAreas(site?.areas)} /></div>
      </div>
      <ContactBar office={office} message={hello} sticky />
    </Layout>
  );
}
