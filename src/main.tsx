import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/newsreader/index.css';
import '@fontsource-variable/caveat/index.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { loadPreferences } from './storage/preferences';
import 'pdfjs-dist/web/pdf_viewer.css';
import './styles/tokens.css';
import './styles/components.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/signature.css';
import './styles/overlays.css';

const preferences = loadPreferences();
document.documentElement.dataset.theme = preferences.theme;

const container = document.getElementById('root');
if (!container) throw new Error('Folio could not find its root element.');

createRoot(container).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
