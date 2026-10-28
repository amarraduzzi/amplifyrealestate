import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { applyLang, detectLang } from './lib/i18n';
import { apiConfigured, resolveDomain } from './lib/api';
import { setDomainSlug } from './lib/router';
import App from './App';

// language before the first render, so an Arabic page never flashes in French
applyLang(detectLang());

const root = createRoot(document.getElementById('root')!);
if (!apiConfigured) {
  root.render(
    <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>Configuration incomplete</h1>
      <p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare, then redeploy.</p>
    </div>,
  );
} else {
  // First find out whether this is an office's own domain, then draw the page.
  resolveDomain(window.location.hostname).then(slug => {
    setDomainSlug(slug);
    root.render(<StrictMode><App /></StrictMode>);
  });
}
