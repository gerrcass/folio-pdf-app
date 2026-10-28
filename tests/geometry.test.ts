import fs from 'node:fs';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageViewport } from 'pdfjs-dist';
import { describe, expect, it } from 'vitest';
import {
  quadFromScreenRect,
  quadToCssStyle,
  quadToScreen,
  normalizeRotation,
} from '../src/pdf/geometry';

const fixture = path.resolve('tests/fixtures/rotated-cropbox.pdf');

async function loadPage() {
  const data = new Uint8Array(fs.readFileSync(fixture));
  const loadingTask = getDocument({ data, disableWorker: true } as never);
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  return { pdf, page };
}

describe('PDF user-space geometry', () => {
  it('handles a nonzero CropBox origin', async () => {
    const { pdf, page } = await loadPage();
    const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
    expect(page.view).toEqual([40, 60, 460, 660]);
    expect(viewport.convertToPdfPoint(0, 0)).toEqual([40, 60]);
    await pdf.loadingTask.destroy();
  });

  it('round-trips a screen rectangle through PDF space at every rotation', async () => {
    const { pdf, page } = await loadPage();
    for (const viewerRotation of [0, 90, 180, 270]) {
      const viewport = page.getViewport({
        scale: 1.35,
        rotation: page.rotate + viewerRotation,
      }) as unknown as PageViewport;
      const rect = { x: 48, y: 72, width: 210, height: 44 };
      const quad = quadFromScreenRect(rect, viewport);
      const screen = quadToScreen(quad, viewport);
      expect(screen.p3.x).toBeCloseTo(rect.x, 4);
      expect(screen.p3.y).toBeCloseTo(rect.y, 4);
      expect(screen.p2.x).toBeCloseTo(rect.x + rect.width, 4);
      expect(screen.p2.y).toBeCloseTo(rect.y, 4);
      expect(screen.p0.x).toBeCloseTo(rect.x, 4);
      expect(screen.p0.y).toBeCloseTo(rect.y + rect.height, 4);
      expect(screen.p1.x).toBeCloseTo(rect.x + rect.width, 4);
      expect(screen.p1.y).toBeCloseTo(rect.y + rect.height, 4);

      const style = quadToCssStyle(quad, viewport);
      expect(style.width).toBeCloseTo(rect.width, 3);
      expect(style.height).toBeCloseTo(rect.height, 3);
      expect(style.left).toBeCloseTo(rect.x, 3);
      expect(style.top).toBeCloseTo(rect.y, 3);
      expect(style.transform).toMatch(/^matrix\(/);
    }
    await pdf.loadingTask.destroy();
  });

  it('normalizes rotations into the four PDF-valid values', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });
});
