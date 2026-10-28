import { useEffect, useState } from 'react';
import { useRoute } from './lib/router';
import { Home } from './views/Home';
import { OfficeView } from './views/OfficeView';
import { PropertyView } from './views/PropertyView';
import { OwnerPortal } from './views/OwnerPortal';

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
  if (route.kind === 'office') return <OfficeView key={route.slug} slug={route.slug} />;
  if (route.kind === 'property') return <PropertyView key={`${route.slug}/${route.reference}`} slug={route.slug} reference={route.reference} />;
  return <Home />;
}
