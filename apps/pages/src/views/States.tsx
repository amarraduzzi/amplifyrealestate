import { SearchX } from 'lucide-react';
import { t } from '../lib/i18n';
import { Link } from '../lib/router';
import { Layout } from '../components/Layout';

export function Loading() {
  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-6" aria-busy="true">
        <div className="skeleton h-8 w-2/3 rounded-xl" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    </Layout>
  );
}

export function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <Layout>
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <p className="text-sm font-semibold text-danger">{t('Something went wrong. Please try again.')}</p>
        <button type="button" onClick={onRetry} className="gold-fill mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-brand-ink">{t('Try again')}</button>
      </div>
    </Layout>
  );
}

export function NotFound({ text, officeSlug, officeName }: { text: string; officeSlug?: string; officeName?: string }) {
  return (
    <Layout>
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-surface-3 text-muted"><SearchX className="h-7 w-7" /></span>
        <h1 className="mt-4 font-display text-2xl font-bold">{t('Page not found')}</h1>
        <p className="mt-2 text-sm text-muted">{text}</p>
        {officeSlug && officeName && (
          <Link to={`/${officeSlug}`} className="mt-5 inline-block text-sm font-semibold text-brand hover:underline">{t('More properties from {office}', { office: officeName })}</Link>
        )}
      </div>
    </Layout>
  );
}
