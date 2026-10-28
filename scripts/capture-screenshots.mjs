import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'screenshots');
const port = 4176;
fs.mkdirSync(outDir, { recursive: true });

process.env.VITE_BASE = '/';
process.env.VITE_EDITION = 'web';
execFileSync(process.execPath, [path.join(root, 'scripts', 'copy-pdf-assets.mjs')], { stdio: 'ignore' });
execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs'), 'web'], {
  stdio: 'ignore',
  env: process.env,
});
const server = await preview({ root, preview: { port, strictPort: true, host: '127.0.0.1' } });

const localChromium =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (fs.existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' : undefined);
const browser = await chromium.launch({
  headless: true,
  executablePath: localChromium,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
  permissions: ['camera'],
});
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.library-title');

const chooser = page.waitForEvent('filechooser');
await page.getByRole('button', { name: 'Open PDF' }).first().click();
await (await chooser).setFiles(path.join(root, 'tests/fixtures/sample.pdf'));
await page.waitForSelector('.reader');
await page.waitForTimeout(1800);

const pageInput = page.locator('.page-input');
await pageInput.fill('2');
await pageInput.press('Enter');
await page.waitForTimeout(800);

async function scrollToText(needle) {
  await page.evaluate((value) => {
    const frame = document.querySelector('[data-page-index="1"]');
    const area = document.querySelector('.reading-area');
    const target = [...(frame?.querySelectorAll('.page-text-layer span') ?? [])].find((element) =>
      (element.textContent ?? '').includes(value),
    );
    if (!area || !target) return;
    const rect = target.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    area.scrollTop += rect.top - areaRect.top - 220;
  }, needle);
  await page.waitForTimeout(350);
}

// Highlight a sentence.
await page.getByRole('button', { name: 'Highlight text' }).click();
await page.keyboard.press('Escape');
await scrollToText('A good reading tool');
await page.evaluate(() => {
  const frame = document.querySelector('[data-page-index="1"]');
  const span = [...(frame?.querySelectorAll('.page-text-layer span') ?? [])].find((element) =>
    (element.textContent ?? '').includes('A good reading tool'),
  );
  if (!span?.firstChild) return;
  const range = document.createRange();
  range.setStart(span.firstChild, 0);
  range.setEnd(span.firstChild, Math.min(32, span.firstChild.textContent?.length ?? 0));
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  const rect = [...range.getClientRects()][0];
  span.dispatchEvent(
    new MouseEvent('mouseup', {
      bubbles: true,
      clientX: rect.x + rect.width / 2,
      clientY: rect.y + rect.height / 2,
    }),
  );
});
await page.waitForTimeout(500);

// Add a small note.
await page.getByRole('button', { name: 'Add a text note' }).click();
await page.keyboard.press('Escape');
const frameBox = await page.locator('[data-page-index="1"]').boundingBox();
if (!frameBox) throw new Error('Page 2 is not visible.');
await page.mouse.click(frameBox.x + 370, frameBox.y + 500);
await page.locator('.text-composer textarea').fill('Room for the eye to rest.');
await page.getByRole('button', { name: 'Add note' }).click();
await page.waitForTimeout(400);

// Sign near the lower right.
await page.getByRole('button', { name: 'Add a signature' }).click();
await page.getByRole('tab', { name: 'Type' }).click();
await page.getByRole('textbox', { name: 'Typed signature text' }).fill('Ada Lovelace');
await page.screenshot({ path: path.join(outDir, 'signature-dialog.png') });
await page.getByRole('button', { name: 'Continue to placement' }).click();
await page.waitForTimeout(500);
const previewLocator = page.locator('.signature-preview');
const previewBox = await previewLocator.boundingBox();
if (previewBox) {
  await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + 440, frameBox.y + 650, { steps: 12 });
  await page.mouse.up();
}
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Approve and add signature' }).click();
await page.waitForTimeout(800);
await page.keyboard.press('Escape');
await page.locator('.toast button').click().catch(() => undefined);
await pageInput.fill('2');
await pageInput.press('Enter');
await page.waitForTimeout(900);
await page.mouse.move(12, 930);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, 'reader.png') });

// Capture the search experience on a text-heavy page.
await page.keyboard.press('Control+f');
await page.getByRole('textbox', { name: 'Find in document' }).fill('luminous margin');
await page.waitForSelector('.search-result');
await page.waitForTimeout(400);
await page.locator('.search-result').first().click();
await page.waitForTimeout(800);
await page.mouse.move(12, 930);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, 'search.png') });

await page.getByRole('button', { name: 'Go to Library' }).click();
await page.waitForSelector('.library-title');
await page.waitForTimeout(900);
await page.mouse.move(12, 930);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, 'library.png') });

await browser.close();
await new Promise((resolve) => server.httpServer.close(resolve));
console.log(`[folio] screenshots written to ${outDir}`);
