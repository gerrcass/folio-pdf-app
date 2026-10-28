import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

const root = process.cwd();
const fixtures = {
  sample: path.resolve('tests/fixtures/sample.pdf'),
  rotated: path.resolve('tests/fixtures/rotated-cropbox.pdf'),
};

function envFor(profile: string): Record<string, string> {
  const entries = Object.entries({
    ...process.env,
    FOLIO_USER_DATA_DIR: profile,
    ...(process.platform === 'linux' ? { DISPLAY: process.env.DISPLAY ?? ':0' } : {}),
  }).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return Object.fromEntries(entries);
}

test('secure desktop shell, custom title bar, and file-association open', async ({ page: _page }, testInfo) => {
  test.setTimeout(120_000);
  const profile = testInfo.outputPath('profile-security');
  const app = await electron.launch({
    args: ['.', fixtures.sample],
    cwd: root,
    env: envFor(profile),
  });
  try {
    const page = await app.firstWindow({ timeout: 30_000 });
    await expect(page.locator('.titlebar')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.window-control')).toHaveCount(3);
    await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.page-total')).toContainText('/ 10');

    const shell = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return { url: window.webContents.getURL(), electron: process.versions.electron };
    });
    expect(shell.url).toBe('app://folio/index.html');
    expect(shell.electron).toBeTruthy();
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
    expect(await page.evaluate(() => typeof (window as unknown as { process?: unknown }).process)).toBe('undefined');
    expect(await page.evaluate(() => Boolean(window.folio))).toBe(true);

    const info = await page.evaluate(() => window.folio?.appInfo());
    expect(info?.edition).toBe('development');
    expect(info?.updatesSupported).toBe(false);

    await page.getByRole('button', { name: 'About Folio' }).click();
    await expect(page.locator('dialog[open] .modal-title')).toHaveText('About Folio');
    await expect(page.locator('dialog[open]')).toContainText('Development Edition');
    await page.getByRole('button', { name: 'Done' }).click();

    await page.screenshot({ path: testInfo.outputPath('electron-shell.png') });
  } finally {
    await app.close().catch(() => undefined);
  }
});

test('reading session restores, but an explicit file open takes precedence', async ({ page: _page }, testInfo) => {
  test.setTimeout(180_000);
  const profile = testInfo.outputPath('profile-session');

  let app = await electron.launch({
    args: ['.', fixtures.sample],
    cwd: root,
    env: envFor(profile),
  });
  try {
    const page = await app.firstWindow({ timeout: 30_000 });
    await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
    const input = page.locator('.page-input');
    await input.fill('4');
    await input.press('Enter');
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Use dark interface' }).click();
    await page.getByRole('button', { name: 'Turn on Night Reading' }).click();
    await page.waitForTimeout(900);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setBounds({ x: 60, y: 60, width: 1000, height: 720 }),
    );
    await page.waitForTimeout(600);
  } finally {
    await app.close().catch(() => undefined);
  }

  app = await electron.launch({ args: ['.'], cwd: root, env: envFor(profile) });
  try {
    const page = await app.firstWindow({ timeout: 30_000 });
    await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.page-input')).toHaveValue('4');
    await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    await expect(page.locator('.page-frame.night')).toHaveCount(10);
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    expect(bounds.width).toBeGreaterThanOrEqual(780);
    expect(bounds.height).toBeGreaterThanOrEqual(520);
    await page.screenshot({ path: testInfo.outputPath('electron-restored.png') });
  } finally {
    await app.close().catch(() => undefined);
  }

  app = await electron.launch({
    args: ['.', fixtures.rotated],
    cwd: root,
    env: envFor(profile),
  });
  try {
    const page = await app.firstWindow({ timeout: 30_000 });
    await expect(page.locator('.reader')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveTitle(/rotated-cropbox/);
    await expect(page.locator('.page-total')).toContainText('/ 2');
    await page.screenshot({ path: testInfo.outputPath('electron-explicit.png') });
  } finally {
    await app.close().catch(() => undefined);
  }
});
