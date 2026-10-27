import { t } from '../lib/i18n';
import { AmplifyLogo } from '../components/Brand';
import { Layout } from '../components/Layout';

export function Home() {
  return (
    <Layout>
      <div className="mx-auto w-full max-w-md px-4 py-20 text-center">
        <AmplifyLogo tone="light" size="lg" className="justify-center" />
        <h1 className="mt-8 font-display text-2xl font-bold">{t('Moroccan real estate, shared simply.')}</h1>
        <p className="mt-3 text-sm text-muted">{t('Open the link your agent sent you to see a property.')}</p>
      </div>
    </Layout>
  );
}
