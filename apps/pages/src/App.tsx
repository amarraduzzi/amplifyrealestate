import { useEffect, useState } from 'react';
import { useRoute } from './lib/router';
import { Home } from './views/Home';
import { OfficeView } from './views/OfficeView';
import { PropertyView } from './views/PropertyView';
import { OwnerPortal } from './views/OwnerPortal';
import { ResidentPortal } from './views/ResidentPortal';
import { RequestView } from './views/RequestView';
import { ProjectView } from './views/ProjectView';
import { GuestGuide } from './views/GuestGuide';
import { CleanerPage } from './views/CleanerPage';
import { VoucherView } from './views/VoucherView';
import { EstimationView } from './views/EstimationView';
import { AreaView } from './views/AreaView';
import { BlogView, PostView } from './views/BlogView';

export default function App() {
  const route = useRoute();
  // a language switch changes the module-level language: draw everything again
  const [, redraw] = useState(0);
  useEffect(() => {
    const on = () => redraw(n => n + 1);
    window.addEventListener('pages:lang', on);
    return () => window.removeEventListener('pages:lang', on);
  }, []);

  if (route.kind === 'owner') return <OwnerPortal key={route.token} token={route.token} />;
  if (route.kind === 'booking') return <RequestView key={route.token} token={route.token} />;
  if (route.kind === 'resident') return <ResidentPortal key={route.token} token={route.token} />;
  if (route.kind === 'guest') return <GuestGuide key={route.token} token={route.token} />;
  if (route.kind === 'estimation') return <EstimationView key={route.slug} slug={route.slug} />;
  if (route.kind === 'blog') return <BlogView key={route.slug} slug={route.slug} />;
  if (route.kind === 'post') return <PostView key={`${route.slug}/${route.post}`} slug={route.slug} post={route.post} />;
  if (route.kind === 'area') return <AreaView key={`${route.slug}/${route.area}`} slug={route.slug} area={route.area} />;
  if (route.kind === 'voucher') return <VoucherView key={route.token} token={route.token} />;
  if (route.kind === 'cleaner') return <CleanerPage key={route.token} token={route.token} />;
  if (route.kind === 'project') return <ProjectView key={`${route.slug}/${route.project}`} slug={route.slug} project={route.project} />;
  if (route.kind === 'office') return <OfficeView key={route.slug} slug={route.slug} />;
  if (route.kind === 'property') return <PropertyView key={`${route.slug}/${route.reference}`} slug={route.slug} reference={route.reference} />;
  return <Home />;
}
