import type { Annotation } from '../annotations/types';
import type { PdfDocumentSession } from './document';
import { drawAnnotationsOnCanvas, renderPageToCanvas } from './render';

export interface PrintOptions {
  pageIndices: number[];
  annotations: Annotation[];
  includeAnnotations: boolean;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function printDocument(
  session: PdfDocumentSession,
  options: PrintOptions,
): Promise<number> {
  const images: Array<{ dataUrl: string; width: number; height: number }> = [];
  const total = options.pageIndices.length;
  for (let index = 0; index < total; index += 1) {
    if (options.signal?.aborted) throw new DOMException('Printing was cancelled.', 'AbortError');
    const pageIndex = options.pageIndices[index];
    const page = await session.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 2, rotation: page.rotate });
    const canvas = document.createElement('canvas');
    const rendered = await renderPageToCanvas(page, viewport, canvas, 1.5, options.signal);
    if (!rendered) throw new DOMException('Printing was cancelled.', 'AbortError');
    if (options.includeAnnotations) {
      const context = canvas.getContext('2d');
      if (context) {
        const pageAnnotations = options.annotations.filter((annotation) => annotation.pageIndex === pageIndex);
        await drawAnnotationsOnCanvas(context, viewport, pageAnnotations, 1.5);
      }
    }
    images.push({
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      width: viewport.width,
      height: viewport.height,
    });
    options.onProgress?.(index + 1, total);
  }

  if (options.signal?.aborted) throw new DOMException('Printing was cancelled.', 'AbortError');
  const body = images
    .map(
      (image) =>
        `<figure><img src="${image.dataUrl}" style="width:${(image.width / 72).toFixed(3)}in;height:${(
          image.height / 72
        ).toFixed(3)}in" alt="" /></figure>`,
    )
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    session.title,
  )}</title><style>
    @page { margin: 0; }
    html, body { margin: 0; background: #fff; }
    figure { margin: 0; page-break-after: always; break-after: page; display: grid; place-items: center; }
    figure:last-child { page-break-after: auto; break-after: auto; }
    img { display: block; max-width: 100%; }
  </style></head><body>${body}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.append(iframe);

  await new Promise<void>((resolve, reject) => {
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      iframe.remove();
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('The print preview timed out.'));
    }, 120_000);
    iframe.addEventListener('load', () => {
      try {
        const printWindow = iframe.contentWindow;
        if (!printWindow) throw new Error('The print preview could not open.');
        printWindow.addEventListener('afterprint', () => {
          window.clearTimeout(timeout);
          cleanup();
          resolve();
        });
        printWindow.focus();
        printWindow.print();
        window.setTimeout(() => {
          window.clearTimeout(timeout);
          cleanup();
          resolve();
        }, 2500);
      } catch (error) {
        window.clearTimeout(timeout);
        cleanup();
        reject(error);
      }
    });
    iframe.srcdoc = html;
  });

  return images.length;
}

export function parsePageRange(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const pages = new Set<number>();
  for (const part of trimmed.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      if (start < 1 || end < 1 || start > pageCount || end > pageCount || start > end) continue;
      for (let page = start; page <= end; page += 1) pages.add(page - 1);
      continue;
    }
    const page = Number(token);
    if (Number.isInteger(page) && page >= 1 && page <= pageCount) pages.add(page - 1);
  }
  return [...pages].sort((a, b) => a - b);
}
