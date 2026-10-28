import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const fixtures = {
  sample: path.resolve('tests/fixtures/sample.pdf'),
  rotated: path.resolve('tests/fixtures/rotated-cropbox.pdf'),
  form: path.resolve('tests/fixtures/signature-form.pdf'),
  encrypted: path.resolve('tests/fixtures/encrypted.pdf'),
  large: path.resolve('tests/fixtures/large.pdf'),
};

export async function gotoLibrary(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.library-title')).toBeVisible();
}

export async function openFixture(page: Page, fixturePath: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open PDF' }).first().click();
  await (await chooser).setFiles(fixturePath);
  await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
  expect(await page.locator('.page-canvas').first().evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);
  await page.waitForTimeout(800);
}

export async function openAnotherFixture(page: Page, fixturePath: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles(fixturePath);
  await page.waitForTimeout(3000);
}

export async function goToPage(page: Page, pageNumber: number): Promise<void> {
  const input = page.locator('.page-input');
  await input.fill(String(pageNumber));
  await input.press('Enter');
  await page.waitForTimeout(700);
}

export async function activateHighlight(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Highlight text' }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

export async function activateInk(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Draw ink' }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

export async function activateText(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add a text note' }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

export async function scrollPageIntoReadingView(page: Page, pageIndex: number): Promise<void> {
  await page.evaluate((index) => {
    const frame = document.querySelector(`[data-page-index="${index}"]`);
    const area = document.querySelector<HTMLElement>('.reading-area');
    if (!frame || !area) return;
    const frameRect = frame.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    area.scrollTop += frameRect.top - areaRect.top - 16;
  }, pageIndex);
  await page.waitForTimeout(500);
}

export async function selectTextOnPage(
  page: Page,
  pageIndex: number,
  phrase: string,
  characters = 32,
): Promise<void> {
  const span = page
    .locator(`[data-page-index="${pageIndex}"] .page-text-layer span`)
    .filter({ hasText: phrase })
    .first();
  await expect(span).toBeAttached();
  await page.evaluate(
    ({ index, needle }) => {
      const frame = document.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
      const area = document.querySelector<HTMLElement>('.reading-area');
      const target = [...(frame?.querySelectorAll('.page-text-layer span') ?? [])].find((element) =>
        (element.textContent ?? '').includes(needle),
      );
      if (!area || !target) return;
      const rect = target.getBoundingClientRect();
      const areaRect = area.getBoundingClientRect();
      area.scrollTop += rect.top - areaRect.top - 240;
    },
    { index: pageIndex, needle: phrase },
  );
  await page.waitForTimeout(350);
  const result = await page.evaluate(
    ({ index, needle, length }) => {
      const frame = document.querySelector(`[data-page-index="${index}"]`);
      const span = [...(frame?.querySelectorAll('.page-text-layer span') ?? [])].find((element) =>
        (element.textContent ?? '').includes(needle),
      );
      if (!span || !span.firstChild) return { ok: false };
      const range = document.createRange();
      range.setStart(span.firstChild, 0);
      range.setEnd(span.firstChild, Math.min(length, span.firstChild.textContent?.length ?? 0));
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
      return { ok: true, text: selection?.toString() };
    },
    { index: pageIndex, needle: phrase, length: characters },
  );
  expect(result.ok).toBe(true);
  await page.waitForTimeout(500);
}

export async function addTextNote(
  page: Page,
  pageIndex: number,
  x: number,
  y: number,
  text: string,
): Promise<void> {
  const frame = page.locator(`[data-page-index="${pageIndex}"]`);
  await scrollPageIntoReadingView(page, pageIndex);
  const box = await frame.boundingBox();
  if (!box) throw new Error('No page visible for text note.');
  await page.mouse.click(box.x + x, box.y + y);
  await expect(page.locator('.text-composer')).toBeVisible();
  await page.locator('.text-composer textarea').fill(text);
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.waitForTimeout(400);
}

export async function drawInk(page: Page, pageIndex: number): Promise<void> {
  const frame = page.locator(`[data-page-index="${pageIndex}"]`);
  await scrollPageIntoReadingView(page, pageIndex);
  const box = await frame.boundingBox();
  if (!box) throw new Error('No page visible for ink.');
  await page.mouse.move(box.x + 280, box.y + 330);
  await page.mouse.down();
  for (let index = 0; index < 14; index += 1) {
    await page.mouse.move(box.x + 280 + index * 11, box.y + 330 + Math.sin(index / 2) * 28);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

export async function addTypedSignature(page: Page, text = 'Ada Lovelace'): Promise<void> {
  await page.getByRole('button', { name: 'Add a signature' }).click();
  await expect(page.locator('dialog[open] .modal-title')).toHaveText('Add a visual signature');
  await page.getByRole('tab', { name: 'Type' }).click();
  await page.getByRole('textbox', { name: 'Typed signature text' }).fill(text);
  await page.getByRole('button', { name: 'Continue to placement' }).click();
  await expect(page.locator('.signature-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Approve and add signature' }).click();
  await page.waitForTimeout(600);
}

export async function installExportCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob) => {
      (window as unknown as { __folioLastBlob?: Blob }).__folioLastBlob = blob;
      return original(blob);
    };
  });
}

export async function exportBytes(page: Page): Promise<Buffer> {
  await page.getByRole('button', { name: 'Export' }).click();
  await page.waitForFunction(
    () => Boolean((window as unknown as { __folioLastBlob?: Blob }).__folioLastBlob),
    undefined,
    { timeout: 30_000 },
  );
  const base64 = await page.evaluate(async () => {
    const blob = (window as unknown as { __folioLastBlob?: Blob }).__folioLastBlob;
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  if (!base64) throw new Error('No exported PDF blob was captured.');
  return Buffer.from(base64, 'base64');
}
