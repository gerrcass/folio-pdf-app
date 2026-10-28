import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(root, '..', 'node_modules', 'pdfjs-dist');
const target = path.join(root, '..', 'public', 'pdfjs');

const assets = ['cmaps', 'standard_fonts', 'wasm', 'web/images'];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const asset of assets) {
  const from = path.join(source, asset);
  try {
    await stat(from);
    const destination = path.join(target, asset === 'web/images' ? 'images' : asset);
    await cp(from, destination, { recursive: true });
    console.log(`[folio] copied pdf.js ${asset}`);
  } catch {
    console.warn(`[folio] pdf.js asset missing: ${asset}`);
  }
}
