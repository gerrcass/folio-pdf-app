import { RenderingCancelledException, type PDFPageProxy, type PageViewport } from 'pdfjs-dist';
import type { Annotation } from '../annotations/types';
import { highlightHex } from '../annotations/types';
import type { ScreenPoint } from './geometry';
import { quadBBox, quadToScreen, quadToCssStyle, quadWidth, quadHeight } from './geometry';

const MAX_CANVASES = 12;
const canvasState = new Map<HTMLCanvasElement, { visible: boolean; lastUsed: number }>();

export function registerCanvas(canvas: HTMLCanvasElement): void {
  canvasState.set(canvas, { visible: false, lastUsed: Date.now() });
}

export function unregisterCanvas(canvas: HTMLCanvasElement): void {
  canvasState.delete(canvas);
}

export function setCanvasVisible(canvas: HTMLCanvasElement, visible: boolean): void {
  const state = canvasState.get(canvas) ?? { visible: false, lastUsed: Date.now() };
  state.visible = visible;
  state.lastUsed = Date.now();
  canvasState.set(canvas, state);
  if (!visible) return;
  const clearable = [...canvasState.entries()]
    .filter(([entry, value]) => entry !== canvas && !value.visible && entry.width > 0)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (canvasState.size > MAX_CANVASES && clearable.length > 0) {
    const [oldest] = clearable.shift()!;
    oldest.width = 0;
    oldest.height = 0;
    canvasState.delete(oldest);
  }
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export class RenderCancelledError extends Error {
  constructor() {
    super('Render cancelled');
    this.name = 'RenderCancelledError';
  }
}

let activeRenders = 0;
const renderWaiters: Array<() => void> = [];

async function acquireSlot(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new RenderCancelledError();
  while (activeRenders >= 2) {
    await new Promise<void>((resolve) => renderWaiters.push(resolve));
    if (signal.aborted) throw new RenderCancelledError();
  }
  activeRenders += 1;
}

function releaseSlot(): void {
  activeRenders = Math.max(0, activeRenders - 1);
  renderWaiters.shift()?.();
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  viewport: PageViewport,
  canvas: HTMLCanvasElement,
  devicePixelRatio = window.devicePixelRatio || 1,
  signal?: AbortSignal,
): Promise<boolean> {
  await acquireSlot(signal ?? new AbortController().signal);
  const pixelRatio = Math.min(Math.max(devicePixelRatio, 1), 2);
  const width = Math.max(1, Math.floor(viewport.width * pixelRatio));
  const height = Math.max(1, Math.floor(viewport.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    releaseSlot();
    throw new Error('Canvas rendering is unavailable.');
  }
  context.save();
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    background: '#ffffff',
  });
  const onAbort = () => task.cancel();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await task.promise;
    return true;
  } catch (error) {
    if (error instanceof RenderingCancelledException || signal?.aborted) return false;
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    context.restore();
    releaseSlot();
  }
}

export async function renderThumbnail(page: PDFPageProxy, targetWidth = 260): Promise<string> {
  const base = page.getViewport({ scale: 1, rotation: page.rotate });
  const scale = targetWidth / base.width;
  const viewport = page.getViewport({ scale, rotation: page.rotate });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return '';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
  const dataUrl = canvas.toDataURL('image/webp', 0.72);
  return dataUrl.startsWith('data:image/webp') ? dataUrl : canvas.toDataURL('image/png');
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const IMAGE_CACHE_LIMIT = 40;

export function loadAnnotationImage(dataUrl: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(dataUrl);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
  imageCache.set(dataUrl, promise);
  while (imageCache.size > IMAGE_CACHE_LIMIT) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
  return promise;
}

function traceQuad(context: CanvasRenderingContext2D, points: ScreenPoint[]): void {
  const [first, ...rest] = points;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of rest) context.lineTo(point.x, point.y);
  context.closePath();
}

export async function drawAnnotationsOnCanvas(
  context: CanvasRenderingContext2D,
  viewport: PageViewport,
  annotations: Annotation[],
  devicePixelRatio = 1,
): Promise<void> {
  context.save();
  context.scale(devicePixelRatio, devicePixelRatio);
  for (const annotation of annotations) {
    if (annotation.kind === 'highlight') {
      context.save();
      context.globalCompositeOperation = 'multiply';
      context.fillStyle = highlightHex(annotation.color);
      context.globalAlpha = 0.34;
      for (const quad of annotation.quads) {
        const screen = quadToScreen(quad, viewport);
        traceQuad(context, [screen.p0, screen.p1, screen.p2, screen.p3]);
        context.fill();
      }
      context.restore();
      continue;
    }
    if (annotation.kind === 'ink') {
      context.save();
      context.strokeStyle = annotation.color;
      context.lineWidth = Math.max(1, annotation.thickness * viewport.scale);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (const stroke of annotation.strokes) {
        if (stroke.length < 2) continue;
        context.beginPath();
        const first = viewport.convertToViewportPoint(stroke[0].x, stroke[0].y);
        context.moveTo(first[0], first[1]);
        for (const point of stroke.slice(1)) {
          const next = viewport.convertToViewportPoint(point.x, point.y);
          context.lineTo(next[0], next[1]);
        }
        context.stroke();
      }
      context.restore();
      continue;
    }
    const style = quadToCssStyle(annotation.quad, viewport);
    context.save();
    context.translate(style.left, style.top);
    const matrix = style.transform.match(/matrix\(([^)]+)\)/)?.[1].split(',').map(Number);
    if (matrix) {
      context.transform(matrix[0], matrix[1], matrix[2], matrix[3], 0, 0);
    }
    if (annotation.kind === 'signature') {
      const image = await loadAnnotationImage(annotation.dataUrl);
      if (image) context.drawImage(image, 0, 0, style.width, style.height);
    } else {
      const fontSize = Math.max(7, annotation.fontSize * viewport.scale);
      const padding = 6;
      const lines = annotation.text.split('\n').flatMap((line) => wrapText(context, line, style.width - padding * 2, fontSize));
      const lineHeight = fontSize * 1.35;
      context.fillStyle = 'rgba(255, 252, 245, 0.9)';
      context.fillRect(0, 0, style.width, Math.max(style.height, lines.length * lineHeight + padding * 2));
      context.fillStyle = annotation.color;
      context.font = `500 ${fontSize}px 'Inter Variable', sans-serif`;
      context.textBaseline = 'top';
      lines.forEach((line, index) => {
        context.fillText(line, padding, padding + index * lineHeight);
      });
    }
    context.restore();
  }
  context.restore();
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  context.font = `500 ${fontSize}px 'Inter Variable', sans-serif`;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function annotationBounds(annotation: Annotation) {
  if (annotation.kind === 'highlight') return annotation.quads.map(quadBBox);
  if (annotation.kind === 'ink') {
    const points = annotation.strokes.flat();
    if (points.length === 0) return [{ x: 0, y: 0, width: 0, height: 0 }];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return [{ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }];
  }
  return [quadBBox(annotation.quad)];
}

export function annotationMeasurement(annotation: Annotation) {
  return {
    width: 'quad' in annotation ? quadWidth(annotation.quad) : 0,
    height: 'quad' in annotation ? quadHeight(annotation.quad) : 0,
  };
}
