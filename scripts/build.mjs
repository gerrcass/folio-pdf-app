import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] === 'web' ? 'web' : 'desktop';

process.env.VITE_EDITION = target;
process.env.VITE_BASE = process.env.VITE_BASE ?? (target === 'web' ? '/folio-pdf-app/' : './');

console.log(`[folio] building ${target} renderer`);
await viteBuild({ root, mode: 'production' });

if (target === 'desktop') {
  console.log('[folio] building Electron main and preload');
  await esbuild({
    entryPoints: [path.join(root, 'electron/main.ts'), path.join(root, 'electron/preload.ts')],
    outdir: path.join(root, 'dist-electron'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    packages: 'external',
    sourcemap: false,
    logLevel: 'info',
    outExtension: { '.js': '.cjs' },
  });
}
