import type { PageViewport } from 'pdfjs-dist';
import type { Annotation } from '../annotations/types';
import type { ScreenPoint } from '../pdf/geometry';
import { pointInQuad, quadToScreen } from '../pdf/geometry';

function distanceToSegment(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function hitTestAnnotation(
  annotation: Annotation,
  point: ScreenPoint,
  viewport: PageViewport,
): boolean {
  if (annotation.kind === 'highlight') {
    return annotation.quads.some((quad) => pointInQuad(point, quadToScreen(quad, viewport)));
  }
  if (annotation.kind === 'ink') {
    const threshold = Math.max(7, (annotation.thickness * viewport.scale) / 2 + 4);
    for (const stroke of annotation.strokes) {
      if (stroke.length < 2) continue;
      const screen = stroke.map((value) => {
        const [x, y] = viewport.convertToViewportPoint(value.x, value.y) as [number, number];
        return { x, y };
      });
      for (let index = 1; index < screen.length; index += 1) {
        if (distanceToSegment(point, screen[index - 1], screen[index]) <= threshold) return true;
      }
    }
    return false;
  }
  return pointInQuad(point, quadToScreen(annotation.quad, viewport));
}

export function annotationAtPoint(
  annotations: Annotation[],
  pageIndex: number,
  point: ScreenPoint,
  viewport: PageViewport,
): Annotation | null {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const annotation = annotations[index];
    if (annotation.pageIndex !== pageIndex) continue;
    if (hitTestAnnotation(annotation, point, viewport)) return annotation;
  }
  return null;
}
