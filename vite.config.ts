import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DESKTOP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob:",
  "media-src 'self' blob:",
  "frame-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** Inject a strict CSP into the built document only; Vite needs a relaxed dev origin. */
function cspPlugin() {
  return {
    name: 'folio-csp',
    apply: 'build',
    transformIndexHtml(html: string) {
      return html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${DESKTOP_CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [react(), cspPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: false,
  },
  define: {
    __FOLIO_BUILD__: JSON.stringify({
      edition: process.env.VITE_EDITION ?? 'desktop',
      version: process.env.npm_package_version ?? '1.0.0',
    }),
  },
});
