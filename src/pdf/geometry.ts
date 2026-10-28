import type { PageViewport } from 'pdfjs-dist';
import type { PdfPoint, PdfQuad } from '../annotations/types';

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeRotation(degrees: number): 0 | 90 | 180 | 270 {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

export function screenToPdfPoint(point: ScreenPoint, viewport: PageViewport): PdfPoint {
  const [x, y] = viewport.convertToPdfPoint(point.x, point.y) as [number, number];
  return { x, y };
}

export function pdfToScreenPoint(point: PdfPoint, viewport: PageViewport): ScreenPoint {
  const [x, y] = viewport.convertToViewportPoint(point.x, point.y) as [number, number];
  return { x, y };
}

export function quadFromScreenRect(rect: ScreenRect, viewport: PageViewport): PdfQuad {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return {
    p0: screenToPdfPoint({ x: left, y: bottom }, viewport),
    p1: screenToPdfPoint({ x: right, y: bottom }, viewport),
    p2: screenToPdfPoint({ x: right, y: top }, viewport),
    p3: screenToPdfPoint({ x: left, y: top }, viewport),
  };
}

export function quadToScreen(quad: PdfQuad, viewport: PageViewport): Record<keyof PdfQuad, ScreenPoint> {
  return {
    p0: pdfToScreenPoint(quad.p0, viewport),
    p1: pdfToScreenPoint(quad.p1, viewport),
    p2: pdfToScreenPoint(quad.p2, viewport),
    p3: pdfToScreenPoint(quad.p3, viewport),
  };
}

export function quadBBox(quad: PdfQuad): PdfRect {
  const xs = [quad.p0.x, quad.p1.x, quad.p2.x, quad.p3.x];
  const ys = [quad.p0.y, quad.p1.y, quad.p2.y, quad.p3.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionBBoxes(rects: PdfRect[]): PdfRect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function distance(a: PdfPoint | ScreenPoint, b: PdfPoint | ScreenPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointInQuad(point: ScreenPoint, screenQuad: Record<keyof PdfQuad, ScreenPoint>): boolean {
  const points = [screenQuad.p0, screenQuad.p1, screenQuad.p2, screenQuad.p3];
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function translateQuad(quad: PdfQuad, dx: number, dy: number): PdfQuad {
  const move = (point: PdfPoint): PdfPoint => ({ x: point.x + dx, y: point.y + dy });
  return { p0: move(quad.p0), p1: move(quad.p1), p2: move(quad.p2), p3: move(quad.p3) };
}

/**
 * A CSS transform that maps a unit square at the top-left of the element onto
 * the screen-space quad. The element is anchored at the mapped p3 corner.
 */
export function quadToCssStyle(
  quad: PdfQuad,
  viewport: PageViewport,
): { left: number; top: number; width: number; height: number; transform: string } {
  const screen = quadToScreen(quad, viewport);
  const width = Math.max(distance(screen.p3, screen.p2), 0.001);
  const height = Math.max(distance(screen.p3, screen.p0), 0.001);
  const a = (screen.p2.x - screen.p3.x) / width;
  const b = (screen.p2.y - screen.p3.y) / width;
  const c = (screen.p0.x - screen.p3.x) / height;
  const d = (screen.p0.y - screen.p3.y) / height;
  return {
    left: screen.p3.x,
    top: screen.p3.y,
    width,
    height,
    transform: `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`,
  };
}

export function pdfRectToQuad(rect: PdfRect): PdfQuad {
  return {
    p0: { x: rect.x, y: rect.y },
    p1: { x: rect.x + rect.width, y: rect.y },
    p2: { x: rect.x + rect.width, y: rect.y + rect.height },
    p3: { x: rect.x, y: rect.y + rect.height },
  };
}

export function quadCenter(quad: PdfQuad): PdfPoint {
  return {
    x: (quad.p0.x + quad.p1.x + quad.p2.x + quad.p3.x) / 4,
    y: (quad.p0.y + quad.p1.y + quad.p2.y + quad.p3.y) / 4,
  };
}

export function quadWidth(quad: PdfQuad): number {
  return distance(quad.p3, quad.p2);
}

export function quadHeight(quad: PdfQuad): number {
  return distance(quad.p3, quad.p0);
}

export function quadFromDimensions(center: PdfPoint, width: number, height: number): PdfQuad {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    p0: { x: center.x - halfWidth, y: center.y - halfHeight },
    p1: { x: center.x + halfWidth, y: center.y - halfHeight },
    p2: { x: center.x + halfWidth, y: center.y + halfHeight },
    p3: { x: center.x - halfWidth, y: center.y + halfHeight },
  };
}

export function resizeQuadFromScreenRect(
  quad: PdfQuad,
  rect: ScreenRect,
  viewport: PageViewport,
): PdfQuad {
  void quad;
  return quadFromScreenRect(rect, viewport);
}
