import { execFileSync } from 'node:child_process';
import { preview } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.VITE_BASE = '/';
process.env.VITE_EDITION = 'web';

execFileSync(process.execPath, [path.join(root, 'scripts', 'copy-pdf-assets.mjs')], {
  stdio: 'inherit',
});
execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs'), 'web'], {
  stdio: 'inherit',
  env: process.env,
});

const server = await preview({
  root,
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
});
console.log(`[folio] e2e preview at ${server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:4173/'}`);
await new Promise(() => {});
