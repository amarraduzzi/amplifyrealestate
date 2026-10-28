import { useEffect, useState } from 'react';
import { useRoute } from './lib/router';
import { Home } from './views/Home';
import { OfficeView } from './views/OfficeView';
import { PropertyView } from './views/PropertyView';
import { OwnerPortal } from './views/OwnerPortal';
import { ResidentPortal } from './views/ResidentPortal';
import { ProjectView } from './views/ProjectView';
import { GuestGuide } from './views/GuestGuide';
import { CleanerPage } from './views/CleanerPage';

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
  if (route.kind === 'resident') return <ResidentPortal key={route.token} token={route.token} />;
  if (route.kind === 'guest') return <GuestGuide key={route.token} token={route.token} />;
  if (route.kind === 'cleaner') return <CleanerPage key={route.token} token={route.token} />;
  if (route.kind === 'project') return <ProjectView key={`${route.slug}/${route.project}`} slug={route.slug} project={route.project} />;
  if (route.kind === 'office') return <OfficeView key={route.slug} slug={route.slug} />;
  if (route.kind === 'property') return <PropertyView key={`${route.slug}/${route.reference}`} slug={route.slug} reference={route.reference} />;
  return <Home />;
}
