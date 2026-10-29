import { Fragment, useEffect, type ReactNode } from 'react';
import { ArrowLeft, MessageCircle, Newspaper } from 'lucide-react';
import { loadBlog, loadPost, logEvent, photoUrl, type PostCard as Card } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { getLang, LOCALE, t } from '../lib/i18n';
import { waLink } from '../lib/contact';
import { Link, blogPath, officePath, postPath } from '../lib/router';
import { Layout } from '../components/Layout';
import { ContactBar } from '../components/ContactBar';
import { Failed, Loading, NotFound } from './States';

const day = (iso: string) => new Intl.DateTimeFormat(LOCALE[getLang()], { dateStyle: 'long' }).format(new Date(iso));

/** **bold** inside a line, nothing else: the text of an article is plain text, never HTML. */
function inline(s: string): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

/** ## heading, - list item, empty line = new paragraph. */
export function Article({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push(<p key={blocks.length} className="leading-relaxed">{inline(para.join(' '))}</p>); para = []; } };
  const flushList = () => { if (list.length) { blocks.push(<ul key={blocks.length} className="list-disc space-y-1.5 ps-6">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; } };
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    if (line.startsWith('## ')) { flushPara(); flushList(); blocks.push(<h2 key={blocks.length} className="pt-4 font-display text-2xl font-bold">{line.slice(3)}</h2>); continue; }
    if (line.startsWith('- ')) { flushPara(); list.push(line.slice(2)); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return <div className="space-y-4 text-lg text-ink/90">{blocks}</div>;
}

export function PostCardView({ slug, p }: { slug: string; p: Card }) {
  return (
    <Link to={postPath(slug, p.slug)} className="group block overflow-hidden rounded-3xl bg-surface ring-1 ring-line/[0.08] transition hover:ring-brand/30">
      {p.cover ? <img src={photoUrl(p.cover, true)} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
        : <span className="night grid aspect-[16/10] w-full place-items-center"><Newspaper className="h-10 w-10 text-white/70" /></span>}
      <span className="block p-5">
        <span className="block text-xs font-semibold text-muted">{day(p.published_at)}</span>
        <span className="mt-1 block font-display text-lg font-bold leading-snug group-hover:text-brand">{p.title}</span>
        {p.excerpt && <span className="mt-1.5 line-clamp-3 block text-sm text-muted">{p.excerpt}</span>}
      </span>
    </Link>
  );
}

/** All articles of the office. */
export function BlogView({ slug }: { slug: string }) {
  const [state, retry] = useFetch(() => loadBlog(slug), slug);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => { document.title = data ? `${t('Blog')} · ${data.office.name}` : 'Amplify Real Estate'; }, [data]);
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This page does not exist, or the link is not correct.')} />;
  const { office, posts } = data;
  return (
    <Layout office={office} stickyBar wide brand={office.style} site={office}>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-sm"><Link to={officePath(office.slug)} className="font-semibold text-brand hover:underline">{office.name}</Link></p>
        <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">{t('Our advice and news')}</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">{t('Neighborhoods, prices, buying and renting in Morocco: what our agents see every day.')}</p>
        {posts.length === 0 ? <p className="mt-10 text-muted">{t('No articles yet.')}</p> : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{posts.map(p => <li key={p.slug}><PostCardView slug={office.slug} p={p} /></li>)}</ul>
        )}
      </div>
      <ContactBar office={office} message={t('Hello, I would like information about your properties.')} sticky />
    </Layout>
  );
}

/** One article. */
export function PostView({ slug, post }: { slug: string; post: string }) {
  const [state, retry] = useFetch(() => loadPost(slug, post), `${slug}/${post}`);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => { document.title = data ? `${data.post.title} · ${data.office.name}` : 'Amplify Real Estate'; }, [data]);
  useEffect(() => { if (data) logEvent(data.office.slug, null, 'view'); }, [data]);
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This article is no longer online, or the link is not correct.')} />;
  const { office, post: p, more } = data;
  const hello = t('Hello, I read your article “{title}”.', { title: p.title });
  const author = office.agent?.name ?? office.name;
  return (
    <Layout office={office} stickyBar wide brand={office.style} site={office}>
      <article className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to={blogPath(office.slug)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('All articles')}</Link>
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight sm:text-5xl">{p.title}</h1>
        <p className="mt-3 text-sm text-muted">{author} · {day(p.published_at)}</p>
        {p.excerpt && <p className="mt-5 text-xl leading-relaxed text-ink/80">{p.excerpt}</p>}
        {p.cover && <img src={photoUrl(p.cover)} alt="" className="mt-8 aspect-[16/9] w-full rounded-3xl object-cover" />}
        <div className="mt-8"><Article body={p.body} /></div>
        {office.whatsapp && (
          <div className="night mt-12 flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div><p className="font-display text-xl font-bold">{t('A question about your project?')}</p><p className="text-sm text-white/75">{t('Write to us, we answer the same day.')}</p></div>
            <a href={waLink(office.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')}
              className="gold-fill inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-brand-ink"><MessageCircle className="h-4 w-4" />{t('Contact on WhatsApp')}</a>
          </div>
        )}
      </article>
      {more.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
          <h2 className="font-display text-2xl font-bold">{t('More articles')}</h2>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{more.map(m => <li key={m.slug}><PostCardView slug={office.slug} p={m} /></li>)}</ul>
        </section>
      )}
      <ContactBar office={office} message={hello} sticky />
    </Layout>
  );
}
