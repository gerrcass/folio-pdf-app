import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build as esbuild } from 'esbuild';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function buildElectron() {
  await esbuild({
    entryPoints: [path.join(root, 'electron/main.ts'), path.join(root, 'electron/preload.ts')],
    outdir: path.join(root, 'dist-electron'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    packages: 'external',
    sourcemap: false,
    logLevel: 'warning',
    outExtension: { '.js': '.cjs' },
  });
}

await buildElectron();

const server = await createServer({ root, mode: 'development' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/';

let child = null;
let restarting = false;

function launch() {
  child = spawn(electronPath, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: url,
      NODE_ENV: 'development',
    },
  });
  child.on('exit', (code) => {
    if (!restarting) {
      void server.close().finally(() => process.exit(code ?? 0));
    }
  });
}

async function restart() {
  if (restarting) return;
  restarting = true;
  try {
    await buildElectron();
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
    restarting = false;
    launch();
  } catch (error) {
    restarting = false;
    console.error('[folio] electron rebuild failed', error);
  }
}

try {
  fs.watch(path.join(root, 'electron'), { recursive: true }, (_event, filename) => {
    if (filename && filename.endsWith('.ts')) {
      void restart();
    }
  });
} catch {
  console.warn('[folio] electron file watching unavailable; restart to see main-process changes');
}

launch();
console.log(`[folio] renderer at ${url}`);

function shutdown() {
  if (child && !child.killed) child.kill('SIGTERM');
  void server.close().finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
