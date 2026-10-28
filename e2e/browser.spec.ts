import { expect, test } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import {
  activateHighlight,
  activateInk,
  activateText,
  addTextNote,
  addTypedSignature,
  drawInk,
  exportBytes,
  goToPage,
  gotoLibrary,
  installExportCapture,
  openFixture,
  selectTextOnPage,
  fixtures,
} from './helpers';

test('library, reader navigation, fit controls, document info, and print dialog', async ({ page }) => {
  await gotoLibrary(page);
  await page.screenshot({ path: test.info().outputPath('library.png') });
  await openFixture(page, fixtures.sample);

  await expect(page).toHaveTitle(/The Quiet Interface/);
  await expect(page.locator('.page-total')).toContainText('/ 10');
  await expect(page.locator('.thumb-button')).toHaveCount(10);
  expect(await page.locator('.page-canvas').first().evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);

  await goToPage(page, 4);
  await expect(page.locator('.page-input')).toHaveValue('4');

  await page.locator('.zoom-value').click();
  await page.getByRole('button', { name: '150%' }).click();
  await expect(page.locator('.zoom-value')).toHaveText('150%');

  const frameBefore = await page.locator('[data-page-index="3"]').boundingBox();
  await page.locator('.toolbar button[aria-label^="Rotate view"]').click();
  await page.waitForTimeout(500);
  const frameAfter = await page.locator('[data-page-index="3"]').boundingBox();
  expect(frameBefore).not.toBeNull();
  expect(frameAfter).not.toBeNull();
  expect(frameAfter!.width).toBeCloseTo(frameBefore!.height, 0);
  expect(frameAfter!.height).toBeCloseTo(frameBefore!.width, 0);
  for (let index = 0; index < 3; index += 1) {
    await page.locator('.toolbar button[aria-label^="Rotate view"]').click();
    await page.waitForTimeout(250);
  }

  const singleRows = await page.locator('.page-row').count();
  await page.getByRole('button', { name: 'Use two-page spread' }).click();
  await expect(page.locator('.page-row')).not.toHaveCount(singleRows);
  await page.getByRole('button', { name: 'Use single page' }).click();

  const toolbar = page.getByRole('toolbar', { name: 'Document controls' });
  await toolbar.getByRole('button', { name: 'Hide thumbnails' }).click();
  await expect(page.locator('.thumb-sidebar')).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Show thumbnails' }).click();
  await expect(page.locator('.thumb-sidebar')).toBeVisible();

  await page.getByRole('button', { name: 'More document actions' }).click();
  await page.getByRole('button', { name: 'Document information' }).click();
  await expect(page.locator('dialog[open] .modal-title')).toHaveText('Document information');
  await expect(page.locator('dialog[open]')).toContainText('The Quiet Interface');
  await expect(page.locator('dialog[open]')).toContainText('10 pages');
  await page.screenshot({ path: test.info().outputPath('document-info.png') });
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'More document actions' }).click();
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.locator('dialog[open] .modal-title')).toHaveText('Print');
  await expect(page.locator('dialog[open]')).toContainText('All pages (10)');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.getByRole('button', { name: 'About Folio' }).click();
  await expect(page.locator('dialog[open] .modal-title')).toHaveText('About Folio');
  await expect(page.locator('dialog[open]')).toContainText('Browser Edition');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.setViewportSize({ width: 820, height: 680 });
  await expect(page.locator('.toolbar')).toBeVisible();
  await expect(page.locator('.reading-area')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('narrow-reader.png') });
});

test('search finds matches, navigates, and explains an empty result', async ({ page }) => {
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await page.keyboard.press('Control+f');
  const input = page.getByRole('textbox', { name: 'Find in document' });
  await expect(input).toBeVisible();
  await input.fill('luminous margin');
  await expect(page.locator('.search-count')).toHaveText('1 / 1', { timeout: 20_000 });
  await expect(page.locator('.search-result')).toContainText('luminous margin');
  await page.screenshot({ path: test.info().outputPath('search.png') });

  await page.locator('.search-result').first().click();
  await page.waitForTimeout(600);
  await expect(page.locator('.page-input')).toHaveValue('4');

  await page.locator('.zoom-value').click();
  await page.getByRole('button', { name: '200%' }).click();
  await input.fill('Folio will still ask you');
  await expect(page.locator('.search-result').first()).toContainText('Folio will still ask you', { timeout: 20_000 });
  await page.evaluate(() => {
    const area = document.querySelector<HTMLElement>('.reading-area');
    if (area) area.scrollLeft = 400;
  });
  await page.locator('.search-result').first().click();
  await page.waitForTimeout(1200);
  await expect(page.locator('.page-input')).toHaveValue('10');
  const anchor = await page.locator('.search-anchor').boundingBox();
  const readingArea = await page.locator('.reading-area').boundingBox();
  expect(anchor).not.toBeNull();
  expect(readingArea).not.toBeNull();
  expect(anchor!.y).toBeGreaterThanOrEqual(readingArea!.y);
  expect(anchor!.y).toBeLessThanOrEqual(readingArea!.y + readingArea!.height);
  expect(anchor!.x).toBeGreaterThanOrEqual(readingArea!.x);
  expect(anchor!.x).toBeLessThanOrEqual(readingArea!.x + readingArea!.width);

  await input.fill('a phrase that is not present anywhere in this document');
  await expect(page.locator('.search-empty')).toContainText('No matches', { timeout: 20_000 });
});

test('highlight, ink, note, signature, native export, and session restore', async ({ page }) => {
  await installExportCapture(page);
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await goToPage(page, 2);

  await activateHighlight(page);
  await selectTextOnPage(page, 1, 'A good reading tool');
  await expect(page.locator('.highlight-band')).toHaveCount(1);

  await activateInk(page);
  await drawInk(page, 1);
  await expect(page.locator('.ink-stroke')).toHaveCount(1);

  await activateText(page);
  await addTextNote(page, 1, 420, 560, 'Check the geometry here.');
  await expect(page.locator('.annotation-note')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation-note')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.annotation-note')).toHaveCount(1);

  await page.getByRole('button', { name: 'Select annotations' }).click();
  const note = page.locator('.annotation-note');
  const noteBefore = await note.boundingBox();
  expect(noteBefore).not.toBeNull();
  await page.mouse.move(noteBefore!.x + 40, noteBefore!.y + 20);
  await page.mouse.down();
  await page.mouse.move(noteBefore!.x - 20, noteBefore!.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const noteMoved = await note.boundingBox();
  expect(noteMoved!.x).toBeLessThan(noteBefore!.x - 20);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const noteUndone = await note.boundingBox();
  expect(noteUndone!.x).toBeCloseTo(noteBefore!.x, 0);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(300);

  await addTypedSignature(page, 'Ada Lovelace');
  await expect(page.locator('.annotation-signature')).toHaveCount(1);
  await expect(page.locator('.signature-placement-bar')).toHaveCount(0);

  await page.screenshot({ path: test.info().outputPath('annotated.png') });

  const exported = await exportBytes(page);
  const pdf = await PDFDocument.load(exported);
  expect(pdf.getPageCount()).toBe(10);
  const annotations = pdf.getPage(1).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  expect(annotations).toBeDefined();
  const subtypes = annotations!.asArray().map((ref) => {
    const object = pdf.context.lookup(ref, PDFDict);
    return object.get(PDFName.of('Subtype'))?.toString() ?? '';
  });
  expect(subtypes.join(' ')).toContain('Highlight');
  expect(subtypes.join(' ')).toContain('Ink');
  expect(subtypes.join(' ')).toContain('FreeText');
  expect(subtypes.join(' ')).toContain('Stamp');

  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.page-input')).toHaveValue('2');
  await expect(page.locator('.highlight-band')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('.annotation-note')).toHaveCount(1);
  await expect(page.locator('.annotation-signature')).toHaveCount(1);

  await page.getByRole('button', { name: 'Go to Library' }).click();
  await expect(page.locator('.library-title')).toBeVisible();
  await expect(page.locator('.recent-card')).toHaveCount(1);
  await expect(page.locator('.resume-strip')).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.library-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.reader')).toHaveCount(0);
});

test('password-protected PDFs retry, unlock, and cancel cleanly', async ({ page }) => {
  await gotoLibrary(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open PDF' }).first().click();
  await (await chooser).setFiles(fixtures.encrypted);

  const dialog = page.locator('dialog[open]');
  await expect(dialog.locator('.modal-title')).toHaveText('This PDF is locked');
  await page.screenshot({ path: test.info().outputPath('password.png') });
  await page.getByLabel('Document password').fill('wrong');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.locator('.password-error')).toContainText('not accepted');
  await page.getByLabel('Document password').fill('folio');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.page-total')).toContainText('/ 10');

  await page.getByRole('button', { name: 'Go to Library' }).click();
  const chooser2 = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open PDF' }).first().click();
  await (await chooser2).setFiles(fixtures.encrypted);
  await expect(page.locator('dialog[open] .modal-title')).toHaveText('This PDF is locked');
  await page.locator('dialog[open]').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.library-title')).toBeVisible();
  await expect(page.locator('.reader')).toHaveCount(0);
});

test('signature field suggestions, approval, and camera cleanup', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as unknown as { __stoppedTracks: number; __cameraConstraints?: unknown }).__stoppedTracks = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as unknown as { __cameraConstraints: unknown }).__cameraConstraints = constraints;
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          (window as unknown as { __stoppedTracks: number }).__stoppedTracks += 1;
          stop();
        };
      }
      return stream;
    };
  });

  await gotoLibrary(page);
  await openFixture(page, fixtures.form);
  await page.getByRole('button', { name: 'Add a signature' }).click();
  await expect(page.locator('dialog[open] .modal-title')).toHaveText('Add a visual signature');
  await expect(page.locator('dialog[open] .modal-subtitle')).toContainText('1 possible signature field', {
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Type' }).click();
  await page.getByRole('textbox', { name: 'Typed signature text' }).fill('Grace Hopper');
  await page.getByRole('button', { name: 'Continue to placement' }).click();
  await expect(page.locator('.signature-preview')).toBeVisible();
  await expect(page.locator('.signature-placement-copy')).toContainText('Unsigned signature field');
  await page.screenshot({ path: test.info().outputPath('signature-field.png') });
  await page.getByRole('button', { name: 'Approve and add signature' }).click();
  await expect(page.locator('.annotation-signature')).toHaveCount(1);

  // Camera path in a separate document, with a simulated media device.
  await page.getByRole('button', { name: 'Go to Library' }).click();
  await openFixture(page, fixtures.sample);
  await page.getByRole('button', { name: 'Add a signature' }).click();
  await page.getByRole('button', { name: 'Camera' }).click();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('video')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled({ timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath('camera.png') });
  await page.getByRole('button', { name: 'Capture' }).click();
  await expect(page.locator('.signature-preview-image')).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as unknown as { __cameraConstraints?: { audio?: boolean; video?: unknown } }).__cameraConstraints?.audio)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { __stoppedTracks: number }).__stoppedTracks)).toBeGreaterThan(0);
  await page.locator('dialog[open]').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.signature-placement-bar')).toHaveCount(0);
});

test('theme and Night Reading persist independently and can be turned off', async ({ page }) => {
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await page.getByRole('button', { name: 'Use dark interface' }).click();
  await page.getByRole('button', { name: 'Turn on Night Reading' }).click();
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.locator('.page-frame.night')).toHaveCount(10);
  expect(await page.locator('.page-canvas').first().evaluate((element) => getComputedStyle(element).filter)).toContain('invert');
  await page.screenshot({ path: test.info().outputPath('night.png') });

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.locator('.page-frame.night')).toHaveCount(10);

  await page.getByRole('button', { name: 'Turn off Night Reading' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.page-frame.night')).toHaveCount(0);
  await page.getByRole('button', { name: 'Use light interface' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

test('large document search stays usable and reports the complete count', async ({ page }) => {
  await gotoLibrary(page);
  await openFixture(page, fixtures.large);
  await expect(page.locator('.page-total')).toContainText('/ 300');
  await page.keyboard.press('Control+f');
  const input = page.getByRole('textbox', { name: 'Find in document' });
  const start = Date.now();
  await input.fill('luminous margin');
  expect(Date.now() - start).toBeLessThan(2000);
  await expect(page.locator('.search-meta')).toContainText('5400', { timeout: 90_000 });
  await expect(page.locator('.search-result').first()).toBeVisible();
  await goToPage(page, 150);
  await expect(page.locator('.page-input')).toHaveValue('150');
  await page.screenshot({ path: test.info().outputPath('large-document.png') });
});

test('focus mode hides the chrome and restores it on exit', async ({ page }) => {
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await page.getByRole('button', { name: 'More document actions' }).click();
  await page.getByRole('button', { name: 'Focus reading' }).click();
  await expect(page.locator('.titlebar')).toHaveCount(0);
  await expect(page.locator('.toolbar')).toBeHidden();
  await expect(page.locator('.thumb-sidebar')).toBeHidden();
  await expect(page.locator('.focus-exit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exit focus' })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('focus-mode.png') });
  await page.getByRole('button', { name: 'Exit focus' }).click();
  await expect(page.locator('.titlebar')).toBeVisible();
  await expect(page.locator('.toolbar')).toBeVisible();
});

test('remembered signatures are opt-in, save only after approval, and can be forgotten', async ({ page }) => {
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await goToPage(page, 2);

  await page.getByRole('button', { name: 'Add a signature' }).click();
  await page.getByRole('button', { name: 'Type' }).click();
  await page.getByRole('textbox', { name: 'Typed signature text' }).fill('Grace Hopper');
  await page.locator('dialog[open]').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue to placement' }).click();
  await expect(page.locator('.signature-preview')).toBeVisible();
  await page.locator('.signature-placement-bar').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.signature-placement-bar')).toHaveCount(0);

  await page.getByRole('button', { name: 'Add a signature' }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();

  await page.getByRole('button', { name: 'Add a signature' }).click();
  await page.getByRole('button', { name: 'Type' }).click();
  await page.getByRole('textbox', { name: 'Typed signature text' }).fill('Grace Hopper');
  await page.locator('dialog[open]').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue to placement' }).click();
  await page.getByRole('button', { name: 'Approve and add signature' }).click();
  await expect(page.locator('.annotation-signature')).toHaveCount(1);

  await page.getByRole('button', { name: 'Add a signature' }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await expect(page.locator('.signature-saved-row')).toContainText('unencrypted');
  await page.getByRole('button', { name: 'Forget saved signature' }).click();
  await expect(page.getByRole('button', { name: 'Forget', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Forget', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
});

test('highlights stay aligned with text on a rotated page with a nonzero CropBox', async ({ page }) => {
  await gotoLibrary(page);
  await openFixture(page, fixtures.rotated);
  await activateHighlight(page);
  await selectTextOnPage(page, 0, 'Rotated page', 20);
  await expect(page.locator('.highlight-band')).toHaveCount(1);
  const alignment = await page.evaluate(() => {
    const frame = document.querySelector('[data-page-index="0"]');
    const span = [...(frame?.querySelectorAll('.page-text-layer span') ?? [])].find((element) =>
      (element.textContent ?? '').includes('Rotated page'),
    );
    const polygon = document.querySelector('.highlight-band');
    if (!span || !polygon) return null;
    const a = span.getBoundingClientRect();
    const b = polygon.getBoundingClientRect();
    const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return { overlapArea: overlapX * overlapY, spanArea: Math.max(1, a.width * a.height) };
  });
  expect(alignment).not.toBeNull();
  expect(alignment!.overlapArea / alignment!.spanArea).toBeGreaterThan(0.4);
  await page.screenshot({ path: test.info().outputPath('rotated-highlight.png') });
});

test('a PDF dropped onto the library opens without a file picker', async ({ page }) => {
  await gotoLibrary(page);
  const bytes = await import('node:fs').then((fs) => fs.readFileSync(fixtures.sample));
  await page.evaluate(
    async ({ base64, name }) => {
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) array[index] = binary.charCodeAt(index);
      const file = new File([array], name, { type: 'application/pdf' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
      window.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer }));
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    },
    { base64: bytes.toString('base64'), name: 'sample.pdf' },
  );
  await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.page-total')).toContainText('/ 10');
});

test('small browser windows keep the reader usable and collapse the thumbnail rail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await expect(page.locator('.thumb-sidebar')).toHaveCount(0);
  await expect(page.locator('.toolbar')).toBeVisible();
  await expect(page.locator('.reading-area')).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('mobile-reader.png') });
});

test('signature preview and approved stamp agree on a rotated page', async ({ page }) => {
  await gotoLibrary(page);
  await openFixture(page, fixtures.rotated);
  await page.getByRole('button', { name: 'Add a signature' }).click();
  await page.getByRole('button', { name: 'Type' }).click();
  await page.getByRole('textbox', { name: 'Typed signature text' }).fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Continue to placement' }).click();
  const preview = page.locator('.signature-preview');
  await expect(preview).toBeVisible();
  const previewBox = await preview.boundingBox();
  await page.getByRole('button', { name: 'Approve and add signature' }).click();
  await expect(page.locator('.annotation-signature')).toHaveCount(1);
  const stampBox = await page.locator('.annotation-signature').boundingBox();
  expect(previewBox).not.toBeNull();
  expect(stampBox).not.toBeNull();
  expect(Math.abs(stampBox!.x - previewBox!.x)).toBeLessThan(4);
  expect(Math.abs(stampBox!.y - previewBox!.y)).toBeLessThan(4);
  expect(Math.abs(stampBox!.width - previewBox!.width)).toBeLessThan(4);
  expect(Math.abs(stampBox!.height - previewBox!.height)).toBeLessThan(4);
});

test('closing the signature dialog while camera permission is pending stops the stream', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as unknown as { __lateStopped: number }).__lateStopped = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const stream = await original(constraints);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          (window as unknown as { __lateStopped: number }).__lateStopped += 1;
          stop();
        };
      }
      return stream;
    };
  });
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await page.getByRole('button', { name: 'Add a signature' }).click();
  await page.getByRole('button', { name: 'Camera' }).click();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => (window as unknown as { __lateStopped: number }).__lateStopped)).toBeGreaterThan(0);
  await expect(page.locator('.signature-placement-bar')).toHaveCount(0);
});

test('long text notes grow instead of silently clipping', async ({ page }) => {
  await installExportCapture(page);
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await goToPage(page, 2);
  await activateText(page);
  const longText =
    'This note is deliberately long so the annotation must grow to fit all of its content. '.repeat(9) +
    'The final sentence must remain visible.';
  await addTextNote(page, 1, 220, 420, longText);
  const note = page.locator('.annotation-note');
  await expect(note).toHaveCount(1);
  const dimensions = await note.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
  const exported = await exportBytes(page);
  const pdf = await PDFDocument.load(exported);
  const annotations = pdf.getPage(1).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  const freeText = annotations?.asArray().find((ref) => {
    const object = pdf.context.lookup(ref, PDFDict);
    return object.get(PDFName.of('Subtype'))?.toString() === '/FreeText';
  });
  expect(freeText).toBeDefined();
  const contents = pdf.context.lookup(freeText!, PDFDict).get(PDFName.of('Contents'));
  const decoded = contents instanceof PDFHexString ? contents.decodeText() : contents?.toString() ?? '';
  expect(decoded).toContain('The final sentence must remain visible.');
});

test('the library honors the Ctrl+O shortcut it advertises', async ({ page }) => {
  await gotoLibrary(page);
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles(fixtures.sample);
  await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
});

test('the desktop minimum width keeps the thumbnail rail out of the page', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 800 });
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await expect(page.locator('.thumb-sidebar')).toBeVisible();
  const sidebar = await page.locator('.thumb-sidebar').boundingBox();
  const frame = await page.locator('[data-page-index="0"]').boundingBox();
  expect(sidebar).not.toBeNull();
  expect(frame).not.toBeNull();
  expect(frame!.x).toBeGreaterThanOrEqual(sidebar!.x + sidebar!.width - 1);
  await page.screenshot({ path: test.info().outputPath('desktop-min-width.png') });
});

test('toolbar actions remain inside the desktop minimum width', async ({ page }) => {
  for (const width of [820, 780]) {
    await page.setViewportSize({ width, height: 760 });
    await gotoLibrary(page);
    await openFixture(page, fixtures.sample);
    const more = await page.getByRole('button', { name: 'More document actions' }).boundingBox();
    const exportButton = await page.getByRole('button', { name: /Export/ }).boundingBox();
    expect(more).not.toBeNull();
    expect(exportButton).not.toBeNull();
    expect(more!.x + more!.width).toBeLessThanOrEqual(width + 1);
    expect(exportButton!.x + exportButton!.width).toBeLessThanOrEqual(width + 1);
    await page.getByRole('button', { name: 'Go to Library' }).click();
    await page.waitForTimeout(500);
  }
});

test('local storage failure opens the document in reading-only mode', async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new DOMException('storage disabled by probe', 'UnknownError');
    };
  });
  await gotoLibrary(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open PDF' }).first().click();
  await (await chooser).setFiles(fixtures.sample);
  await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.signature-warning-banner')).toContainText('Reading only');
  await expect(page.getByRole('button', { name: 'Highlight text' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add a signature' })).toBeDisabled();
  await page.getByRole('button', { name: 'Go to Library' }).click();
  await expect(page.locator('.library-title')).toBeVisible();
});

test('a capture-processing error stops the camera instead of leaving it live', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as unknown as { __captureStopped: number }).__captureStopped = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          (window as unknown as { __captureStopped: number }).__captureStopped += 1;
          stop();
        };
      }
      return stream;
    };
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
      if ((window as unknown as { __forceCaptureError?: boolean }).__forceCaptureError) {
        throw new Error('capture processing failed');
      }
      return originalToDataURL.call(this, type, quality);
    };
  });
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await page.getByRole('button', { name: 'Add a signature' }).click();
  await page.getByRole('button', { name: 'Camera' }).click();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as unknown as { __forceCaptureError: boolean }).__forceCaptureError = true;
  });
  await page.getByRole('button', { name: 'Capture' }).click();
  await expect(page.locator('dialog[open] .notice.warn')).toContainText('capture processing failed');
  expect(await page.evaluate(() => (window as unknown as { __captureStopped: number }).__captureStopped)).toBeGreaterThan(0);
  await expect(page.locator('video')).toHaveCount(0);
});

test('the signature dialog keeps trust copy and actions visible at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await page.getByRole('button', { name: 'Add a signature' }).click();
  const footer = page.locator('dialog[open] .modal-footer');
  await expect(footer).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Continue to placement' })).toBeVisible();
  const hint = footer.locator('.hint');
  await expect(hint).toBeVisible();
  const dialog = await page.locator('dialog[open]').boundingBox();
  const hintBox = await hint.boundingBox();
  const buttonBox = await footer.getByRole('button', { name: 'Continue to placement' }).boundingBox();
  expect(dialog).not.toBeNull();
  expect(hintBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(hintBox!.x).toBeGreaterThanOrEqual(dialog!.x);
  expect(hintBox!.x + hintBox!.width).toBeLessThanOrEqual(dialog!.x + dialog!.width + 1);
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(dialog!.x + dialog!.width + 1);
  await page.screenshot({ path: test.info().outputPath('signature-mobile.png') });
});

test('compact overlays close after a page or search result is chosen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await page.getByRole('toolbar', { name: 'Document controls' }).getByRole('button', { name: 'Show thumbnails' }).click();
  await expect(page.locator('.thumb-sidebar')).toBeVisible();
  await page.locator('.thumb-button').nth(4).click();
  await page.waitForTimeout(500);
  await expect(page.locator('.thumb-sidebar')).toHaveCount(0);
  await page.keyboard.press('Control+f');
  const input = page.getByRole('textbox', { name: 'Find in document' });
  await input.fill('luminous margin');
  await expect(page.locator('.search-result').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('.search-result').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('.side-panel')).toHaveCount(0);
  await expect(page.locator('.reading-area')).toBeVisible();
});

test('an annotation quota failure still allows export and an explicit leave', async ({ page }) => {
  await installExportCapture(page);
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    (window as unknown as { __failAnnotationWrites: boolean }).__failAnnotationWrites = false;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (
        (window as unknown as { __failAnnotationWrites: boolean }).__failAnnotationWrites &&
        this.name === 'annotations'
      ) {
        throw new DOMException('quota probe', 'QuotaExceededError');
      }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
  });
  await gotoLibrary(page);
  await openFixture(page, fixtures.sample);
  await goToPage(page, 2);
  await page.evaluate(() => {
    (window as unknown as { __failAnnotationWrites: boolean }).__failAnnotationWrites = true;
  });
  await activateText(page);
  await addTextNote(page, 1, 240, 500, 'This note cannot be persisted.');
  await expect(page.locator('.toast')).toContainText('could not be saved', { timeout: 15_000 });
  const exported = await exportBytes(page);
  expect(exported.length).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Go to Library' }).click();
  await expect(page.locator('dialog[open] .modal-title')).toHaveText('Leave without saving?');
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page.locator('.library-title')).toBeVisible();
});
