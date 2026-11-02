import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { applyLang, readLang } from './lib/i18n';
import { applyTheme, readTheme } from './lib/theme';
import App from './App';

// language before the first render, so an Arabic screen never flashes in English
applyLang(readLang());
applyTheme(readTheme());   // colors before the first render, so a dark screen never flashes white

const root = createRoot(document.getElementById('root')!);
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  root.render(
    <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>Configuration incomplete</h1>
      <p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare, then redeploy.</p>
    </div>,
  );
} else {
  root.render(<StrictMode><App /></StrictMode>);
}
