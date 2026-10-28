import { TextLayer } from 'pdfjs-dist';
import { AnnotationLayerBuilder, SimpleLinkService } from 'pdfjs-dist/web/pdf_viewer.mjs';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { annotationAtPoint } from '../../annotations/hit-test';
import type { Annotation, PdfPoint, PdfQuad } from '../../annotations/types';
import { highlightHex } from '../../annotations/types';
import type { ReaderTool } from './types';
import {
  quadFromScreenRect,
  quadToCssStyle,
  quadToScreen,
  translateQuad,
  type ScreenPoint,
  type ScreenRect,
} from '../../pdf/geometry';
import type { PdfDocumentSession } from '../../pdf/document';
import {
  registerCanvas,
  renderPageToCanvas,
  setCanvasVisible,
  unregisterCanvas,
} from '../../pdf/render';
import { clearPageSearchRanges, findTextRanges, setPageSearchRanges } from './search-highlights';

export type { ReaderTool } from './types';

type BoxAnnotation = Extract<Annotation, { kind: 'text' | 'signature' }>;

export interface TextDraft {
  pageIndex: number;
  quad: PdfQuad;
}

export interface SignaturePreviewState {
  pageIndex: number;
  quad: PdfQuad;
  dataUrl: string;
  targetLabel?: string;
}

interface PageViewProps {
  session: PdfDocumentSession;
  pageIndex: number;
  scale: number;
  rotation: number;
  current: boolean;
  tool: ReaderTool;
  annotations: Annotation[];
  selectedId: string | null;
  inkColor: string;
  inkThickness: number;
  nightMode: boolean;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  searchQuery: string;
  searchCaseSensitive: boolean;
  activePageOrdinal: number | null;
  textDraft: TextDraft | null;
  textColor: string;
  textFontSize: number;
  signaturePreview: SignaturePreviewState | null;
  onSelect: (annotationId: string | null) => void;
  onCreateInk: (strokes: PdfPoint[][]) => void;
  onTextRequest: (quad: PdfQuad, point: ScreenPoint) => void;
  onSubmitText: (text: string) => void;
  onCancelText: () => void;
  onSignatureQuadChange: (quad: PdfQuad) => void;
  onChangeAnnotation: (annotation: Annotation) => void;
}

function clampRect(rect: ScreenRect, width: number, height: number): ScreenRect {
  const minWidth = 48;
  const minHeight = 24;
  const w = Math.min(Math.max(rect.width, minWidth), width);
  const h = Math.min(Math.max(rect.height, minHeight), height);
  return {
    x: Math.max(0, Math.min(rect.x, width - w)),
    y: Math.max(0, Math.min(rect.y, height - h)),
    width: w,
    height: h,
  };
}

export function PageView({
  session,
  pageIndex,
  scale,
  rotation,
  current,
  tool,
  annotations,
  selectedId,
  inkColor,
  inkThickness,
  nightMode,
  scrollRoot,
  searchQuery,
  searchCaseSensitive,
  activePageOrdinal,
  textDraft,
  textColor,
  textFontSize,
  signaturePreview,
  onSelect,
  onCreateInk,
  onTextRequest,
  onSubmitText,
  onCancelText,
  onSignatureQuadChange,
  onChangeAnnotation,
}: PageViewProps) {
  const page = session.pages[pageIndex];
  const frameRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfAnnotationsRef = useRef<HTMLDivElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkDrawingRef = useRef<{ points: ScreenPoint[]; pointerId: number } | null>(null);
  const previewDragRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    rect: ScreenRect;
    bbox: ScreenRect;
    screenQuad: Record<keyof PdfQuad, ScreenPoint>;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const [renderScale, setRenderScale] = useState(scale);
  const [textVersion, setTextVersion] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [hasPainted, setHasPainted] = useState(false);
  const [previewRect, setPreviewRect] = useState<ScreenRect | null>(null);
  const [previewQuad, setPreviewQuad] = useState<PdfQuad | null>(null);
  const [searchAnchor, setSearchAnchor] = useState<{ x: number; y: number } | null>(null);
  const [liveEdit, setLiveEdit] = useState<{ id: string; quad: PdfQuad } | null>(null);
  const annotationDragRef = useRef<{
    mode: 'move' | 'resize';
    annotation: BoxAnnotation;
    start: ScreenPoint;
    screenQuad: Record<keyof PdfQuad, ScreenPoint>;
    bbox: ScreenRect;
    moved: boolean;
  } | null>(null);

  const viewport = useMemo(() => {
    if (!page) return null;
    return page.getViewport({ scale, rotation: page.rotate + rotation });
  }, [page, scale, rotation]);
  const canvasViewport = useMemo(() => {
    if (!page) return null;
    return page.getViewport({ scale: renderScale, rotation: page.rotate + rotation });
  }, [page, renderScale, rotation]);

  const width = viewport?.width ?? 0;
  const height = viewport?.height ?? 0;
  const hostDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const renderKey = `${renderScale.toFixed(4)}:${rotation}:${Math.min(hostDpr, 2)}`;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setVisible(entry.isIntersecting);
      },
      { root: scrollRoot.current, rootMargin: '900px 0px', threshold: 0.01 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    registerCanvas(canvas);
    return () => unregisterCanvas(canvas);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setRenderScale(scale), 140);
    return () => clearTimeout(timer);
  }, [scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page || !canvasViewport) return;
    setCanvasVisible(canvas, visible);
    if (!visible) return;
    if (canvas.dataset.renderKey === renderKey && canvas.width > 0) {
      setHasPainted(true);
      return;
    }
    const controller = new AbortController();
    setRenderError(null);
    void renderPageToCanvas(page, canvasViewport, canvas, hostDpr, controller.signal)
      .then((painted) => {
        if (painted && !controller.signal.aborted) {
          canvas.dataset.renderKey = renderKey;
          setHasPainted(true);
          if (pageIndex === 0 && !performance.getEntriesByName('folio:first-page:rendered').length) {
            performance.mark('folio:first-page:rendered');
            try {
              performance.measure('folio:open-to-first-page', 'folio:open:start', 'folio:first-page:rendered');
            } catch {
              // The mark is diagnostic only.
            }
          }
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRenderError(error instanceof Error ? error.message : 'This page could not be rendered.');
      });
    return () => controller.abort();
  }, [visible, page, canvasViewport, renderKey, hostDpr, pageIndex]);


  useEffect(() => {
    const host = pdfAnnotationsRef.current;
    if (!host || !page || !viewport) return;
    if (!visible) {
      host.replaceChildren();
      return;
    }
    const rawDims = viewport.rawDims as { pageWidth: number; pageHeight: number };
    const linkService = new SimpleLinkService();
    let annotationDiv: HTMLElement | null = null;
    const builder = new AnnotationLayerBuilder({
      pdfPage: page,
      linkService,
      renderForms: false,
      imageResourcesPath: new URL('pdfjs/images/', document.baseURI).href,
      onAppend: (element: HTMLElement) => {
        annotationDiv = element;
        element.classList.add('folio-pdf-annotations');
        host.replaceChildren(element);
      },
    });
    host.style.setProperty('--total-scale-factor', String(viewport.scale));
    void builder
      .render({ viewport })
      .then(() => {
        if (!annotationDiv) return;
        annotationDiv.style.width = `${rawDims.pageWidth * viewport.scale}px`;
        annotationDiv.style.height = `${rawDims.pageHeight * viewport.scale}px`;
      })
      .catch(() => undefined);
    return () => {
      builder.cancel();
      host.replaceChildren();
    };
  }, [visible, page, viewport]);

  useEffect(() => {
    const container = textLayerRef.current;
    if (!container || !page || !viewport) return;
    if (!visible) {
      clearPageSearchRanges(pageIndex);
      return;
    }
    let cancelled = false;
    let layer: TextLayer | null = null;
    container.replaceChildren();
    const rawDims = viewport.rawDims as { pageWidth: number; pageHeight: number };
    container.style.setProperty('--total-scale-factor', String(viewport.scale));
    void session.getTextContent(pageIndex).then((textContent) => {
      if (cancelled) return;
      layer = new TextLayer({
        textContentSource: textContent,
        container,
        viewport,
      });
      container.style.width = `${rawDims.pageWidth * viewport.scale}px`;
      container.style.height = `${rawDims.pageHeight * viewport.scale}px`;
      void layer.render().then(() => {
        if (!cancelled) setTextVersion((value) => value + 1);
      });
    });
    return () => {
      cancelled = true;
      layer?.cancel();
      container.replaceChildren();
      clearPageSearchRanges(pageIndex);
    };
  }, [visible, page, viewport, pageIndex, session]);

  useEffect(() => {
    const container = textLayerRef.current;
    if (!container || !visible || !searchQuery.trim()) {
      clearPageSearchRanges(pageIndex);
      return;
    }
    const ranges = findTextRanges(container, searchQuery.trim(), searchCaseSensitive);
    const active =
      activePageOrdinal !== null && activePageOrdinal >= 0 && activePageOrdinal < ranges.length
        ? ranges[activePageOrdinal]
        : undefined;
    setPageSearchRanges(pageIndex, ranges, active);
    if (active) {
      const rangeRect = active.getBoundingClientRect();
      const frameRect = frameRef.current?.getBoundingClientRect();
      if (frameRect) {
        setSearchAnchor({ x: rangeRect.left - frameRect.left, y: rangeRect.top - frameRect.top });
      }
    } else {
      setSearchAnchor(null);
    }
    return () => {
      clearPageSearchRanges(pageIndex);
      setSearchAnchor(null);
    };
  }, [textVersion, searchQuery, searchCaseSensitive, activePageOrdinal, visible, pageIndex]);


  useEffect(() => {
    if (!searchAnchor || activePageOrdinal === null) return;
    const area = scrollRoot.current;
    const frame = frameRef.current;
    if (!area || !frame) return;
    const frameRect = frame.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    const targetTop = frameRect.top + searchAnchor.y;
    if (targetTop < areaRect.top + 64 || targetTop > areaRect.bottom - 72) {
      area.scrollTop += targetTop - areaRect.top - area.clientHeight * 0.32;
    }
  }, [activePageOrdinal, scrollRoot, searchAnchor]);

  useEffect(() => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    if (!visible || tool !== 'ink' || !viewport) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    const dpr = Math.min(hostDpr, 2);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const context = canvas.getContext('2d');
    if (context) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.lineCap = 'round';
      context.lineJoin = 'round';
    }
  }, [visible, tool, viewport, width, height, hostDpr]);

  useEffect(() => {
    if (!signaturePreview || signaturePreview.pageIndex !== pageIndex || !viewport) {
      setPreviewRect(null);
      setPreviewQuad(null);
      return;
    }
    const screen = quadToScreen(signaturePreview.quad, viewport);
    const xs = [screen.p0.x, screen.p1.x, screen.p2.x, screen.p3.x];
    const ys = [screen.p0.y, screen.p1.y, screen.p2.y, screen.p3.y];
    setPreviewQuad(signaturePreview.quad);
    setPreviewRect(
      clampRect(
        {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        },
        width,
        height,
      ),
    );
  }, [signaturePreview, viewport, width, height, pageIndex]);

  if (!page || !viewport) {
    return (
      <div className="page-frame" ref={frameRef} aria-label={`Page ${pageIndex + 1} unavailable`}>
        <div className="page-error">This page is unavailable.</div>
      </div>
    );
  }

  const pageAnnotations = annotations.filter((annotation) => annotation.pageIndex === pageIndex);
  const vectorAnnotations = pageAnnotations.filter(
    (annotation) => annotation.kind === 'highlight' || annotation.kind === 'ink',
  );
  const boxAnnotations = pageAnnotations.filter(
    (annotation) => annotation.kind === 'text' || annotation.kind === 'signature',
  );

  const localPoint = (clientX: number, clientY: number): ScreenPoint | null => {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const beginAnnotationDrag = (
    event: ReactPointerEvent<HTMLElement>,
    annotation: BoxAnnotation,
    mode: 'move' | 'resize',
  ) => {
    if (annotation.kind !== 'text' && annotation.kind !== 'signature') return;
    const point = localPoint(event.clientX, event.clientY);
    if (!point) return;
    const screenQuad = quadToScreen(annotation.quad, viewport);
    const xs = [screenQuad.p0.x, screenQuad.p1.x, screenQuad.p2.x, screenQuad.p3.x];
    const ys = [screenQuad.p0.y, screenQuad.p1.y, screenQuad.p2.y, screenQuad.p3.y];
    const bbox = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    annotationDragRef.current = {
      mode,
      annotation,
      start: point,
      screenQuad,
      bbox,
      moved: false,
    };
    setLiveEdit({ id: annotation.id, quad: annotation.quad });
    event.preventDefault();
    event.stopPropagation();
    surfaceRef.current?.setPointerCapture(event.pointerId);
  };

  const updateAnnotationDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = annotationDragRef.current;
    if (!drag) return;
    const point = localPoint(event.clientX, event.clientY);
    if (!point) return;
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    if (drag.mode === 'move') {
      const [startX, startY] = viewport.convertToPdfPoint(drag.start.x, drag.start.y) as [number, number];
      const [endX, endY] = viewport.convertToPdfPoint(point.x, point.y) as [number, number];
      setLiveEdit({
        id: drag.annotation.id,
        quad: translateQuad(drag.annotation.quad, endX - startX, endY - startY),
      });
      return;
    }
    const newWidth = Math.max(60, drag.bbox.width + dx);
    const newHeight = Math.max(30, drag.bbox.height + dy);
    const scaleX = newWidth / Math.max(drag.bbox.width, 1);
    const scaleY = newHeight / Math.max(drag.bbox.height, 1);
    const mapPoint = (value: ScreenPoint): ScreenPoint => ({
      x: drag.bbox.x + (value.x - drag.bbox.x) * scaleX,
      y: drag.bbox.y + (value.y - drag.bbox.y) * scaleY,
    });
    const mapped = {
      p0: mapPoint(drag.screenQuad.p0),
      p1: mapPoint(drag.screenQuad.p1),
      p2: mapPoint(drag.screenQuad.p2),
      p3: mapPoint(drag.screenQuad.p3),
    };
    const toPdf = (value: ScreenPoint) => {
      const [x, y] = viewport.convertToPdfPoint(value.x, value.y) as [number, number];
      return { x, y };
    };
    setLiveEdit({
      id: drag.annotation.id,
      quad: { p0: toPdf(mapped.p0), p1: toPdf(mapped.p1), p2: toPdf(mapped.p2), p3: toPdf(mapped.p3) },
    });
  };

  const finishAnnotationDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = annotationDragRef.current;
    if (!drag) return;
    const edit = liveEdit;
    annotationDragRef.current = null;
    setLiveEdit(null);
    try {
      surfaceRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    if (drag.moved && edit) {
      onChangeAnnotation({ ...drag.annotation, quad: edit.quad, updatedAt: Date.now() } as Annotation);
    }
  };

  const handleSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const point = localPoint(event.clientX, event.clientY);
    if (!point) return;
    if (tool === 'select') {
      const hit = annotationAtPoint(pageAnnotations, pageIndex, point, viewport);
      onSelect(hit?.id ?? null);
      if (hit && (hit.kind === 'text' || hit.kind === 'signature')) {
        beginAnnotationDrag(event, hit, 'move');
      }
      return;
    }
    if (tool === 'text') {
      const textWidth = Math.min(240, width * 0.62);
      const textHeight = Math.max(58, textFontSize * scale * 4.2);
      const localRect = {
        x: Math.max(12, Math.min(point.x, width - textWidth - 12)),
        y: Math.max(12, Math.min(point.y, height - textHeight - 12)),
        width: textWidth,
        height: textHeight,
      };
      const quad = quadFromScreenRect(localRect, viewport);
      onTextRequest(quad, point);
    }
  };

  const handleInkPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool !== 'ink' || event.button !== 0) return;
    const point = localPoint(event.clientX, event.clientY);
    if (!point) return;
    const canvas = inkCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    inkDrawingRef.current = { points: [point], pointerId: event.pointerId };
    context.strokeStyle = inkColor;
    context.lineWidth = Math.max(1, inkThickness * scale);
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const handleInkPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drawing = inkDrawingRef.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    const point = localPoint(event.clientX, event.clientY);
    const context = inkCanvasRef.current?.getContext('2d');
    if (!point || !context) return;
    event.preventDefault();
    drawing.points.push(point);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const finishInk = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drawing = inkDrawingRef.current;
    if (!drawing) return;
    inkDrawingRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    if (drawing.points.length < 2) return;
    const pdfPoints = drawing.points.map((point) => {
      const [x, y] = viewport.convertToPdfPoint(point.x, point.y) as [number, number];
      return { x, y };
    });
    onCreateInk([pdfPoints]);
    const canvas = inkCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
    }
  };

  const startPreviewDrag = (event: ReactPointerEvent<HTMLElement>, mode: 'move' | 'resize') => {
    if (!previewRect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const screenQuad = signaturePreview ? quadToScreen(signaturePreview.quad, viewport) : null;
    if (!screenQuad) return;
    const xs = [screenQuad.p0.x, screenQuad.p1.x, screenQuad.p2.x, screenQuad.p3.x];
    const ys = [screenQuad.p0.y, screenQuad.p1.y, screenQuad.p2.y, screenQuad.p3.y];
    previewDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      rect: previewRect,
      bbox: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      screenQuad,
    };
  };

  const movePreviewDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = previewDragRef.current;
    if (!drag) return;
    event.preventDefault();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const nextRect =
      drag.mode === 'move'
        ? clampRect({ ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy }, width, height)
        : clampRect(
            { ...drag.rect, width: drag.rect.width + dx, height: drag.rect.height + dy },
            width,
            height,
          );
    setPreviewRect(nextRect);
    const scaleX = nextRect.width / Math.max(drag.bbox.width, 1);
    const scaleY = nextRect.height / Math.max(drag.bbox.height, 1);
    const mapPoint = (value: ScreenPoint): ScreenPoint => ({
      x: nextRect.x + (value.x - drag.bbox.x) * scaleX,
      y: nextRect.y + (value.y - drag.bbox.y) * scaleY,
    });
    const toPdf = (value: ScreenPoint) => {
      const [x, y] = viewport.convertToPdfPoint(value.x, value.y) as [number, number];
      return { x, y };
    };
    setPreviewQuad({
      p0: toPdf(mapPoint(drag.screenQuad.p0)),
      p1: toPdf(mapPoint(drag.screenQuad.p1)),
      p2: toPdf(mapPoint(drag.screenQuad.p2)),
      p3: toPdf(mapPoint(drag.screenQuad.p3)),
    });
  };

  const finishPreviewDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = previewDragRef.current;
    if (!drag || !previewRect) return;
    previewDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    const scaleX = previewRect.width / Math.max(drag.bbox.width, 1);
    const scaleY = previewRect.height / Math.max(drag.bbox.height, 1);
    const mapPoint = (value: ScreenPoint): ScreenPoint => ({
      x: previewRect.x + (value.x - drag.bbox.x) * scaleX,
      y: previewRect.y + (value.y - drag.bbox.y) * scaleY,
    });
    const toPdf = (value: ScreenPoint) => {
      const [x, y] = viewport.convertToPdfPoint(value.x, value.y) as [number, number];
      return { x, y };
    };
    onSignatureQuadChange({
      p0: toPdf(mapPoint(drag.screenQuad.p0)),
      p1: toPdf(mapPoint(drag.screenQuad.p1)),
      p2: toPdf(mapPoint(drag.screenQuad.p2)),
      p3: toPdf(mapPoint(drag.screenQuad.p3)),
    });
  };

  const draftForPage = textDraft?.pageIndex === pageIndex ? textDraft : null;
  const textStyle = draftForPage ? quadToCssStyle(draftForPage.quad, viewport) : null;
  const previewContentStyle = previewQuad ? quadToCssStyle(previewQuad, viewport) : null;
  const selectedBox = boxAnnotations.find((annotation) => annotation.id === selectedId);
  const selectedBoxScreen = selectedBox
    ? quadToScreen(liveEdit?.id === selectedBox.id ? liveEdit.quad : selectedBox.quad, viewport)
    : null;
  const selectedBoxBounds = selectedBoxScreen
    ? (() => {
        const xs = [selectedBoxScreen.p0.x, selectedBoxScreen.p1.x, selectedBoxScreen.p2.x, selectedBoxScreen.p3.x];
        const ys = [selectedBoxScreen.p0.y, selectedBoxScreen.p1.y, selectedBoxScreen.p2.y, selectedBoxScreen.p3.y];
        return {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        };
      })()
    : null;

  return (
    <div
      ref={frameRef}
      className={`page-frame ${current ? 'current' : ''} ${nightMode ? 'night' : ''} tool-${tool}`}
      style={{ width: `${width}px`, height: `${height}px` }}
      data-page-index={pageIndex}
      aria-label={`Page ${pageIndex + 1} of ${session.pageCount}`}
    >
      <div
        className="page-surface"
        ref={surfaceRef}
        onPointerDown={handleSurfacePointerDown}
        onPointerMove={updateAnnotationDrag}
        onPointerUp={finishAnnotationDrag}
        onPointerCancel={finishAnnotationDrag}
      >
        {!hasPainted && !renderError ? <div className="page-placeholder">Page {pageIndex + 1}</div> : null}
        <canvas ref={canvasRef} className="page-canvas" aria-hidden="true" />
        <div ref={pdfAnnotationsRef} className="pdf-annotation-host" aria-label="Existing PDF annotations and form appearances" />
        <div ref={textLayerRef} className="page-text-layer" />
        {searchAnchor ? (
          <span
            className="search-anchor"
            style={{ left: `${searchAnchor.x}px`, top: `${searchAnchor.y}px` }}
            aria-hidden="true"
          />
        ) : null}
        <div className="annotation-layer">
          <svg
            className="annotation-svg"
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            aria-hidden="true"
          >
            {vectorAnnotations.map((annotation) => {
              if (annotation.kind === 'highlight') {
                const color = highlightHex(annotation.color);
                return (
                  <g key={annotation.id}>
                    {annotation.quads.map((quad, index) => {
                      const screen = quadToScreen(quad, viewport);
                      const points = [screen.p0, screen.p1, screen.p2, screen.p3]
                        .map((point) => `${point.x},${point.y}`)
                        .join(' ');
                      return (
                        <polygon
                          key={index}
                          className="highlight-band"
                          points={points}
                          fill={color}
                          opacity={0.34}
                        />
                      );
                    })}
                    {selectedId === annotation.id
                      ? annotation.quads.map((quad, index) => {
                          const screen = quadToScreen(quad, viewport);
                          const points = [screen.p0, screen.p1, screen.p2, screen.p3]
                            .map((point) => `${point.x},${point.y}`)
                            .join(' ');
                          return <polygon key={`sel-${index}`} className="selected-outline" points={points} />;
                        })
                      : null}
                  </g>
                );
              }
              if (annotation.kind === 'ink') {
                return (
                  <g key={annotation.id}>
                    {annotation.strokes.map((stroke, index) => {
                      const points = stroke
                        .map((point) => {
                          const [x, y] = viewport.convertToViewportPoint(point.x, point.y) as [number, number];
                          return `${x},${y}`;
                        })
                        .join(' ');
                      return (
                        <polyline
                          key={index}
                          className="ink-stroke"
                          points={points}
                          stroke={annotation.color}
                          strokeWidth={Math.max(1, annotation.thickness * scale)}
                        />
                      );
                    })}
                    {selectedId === annotation.id ? (
                      <InkSelectionBox annotation={annotation} viewport={viewport} />
                    ) : null}
                  </g>
                );
              }
              return null;
            })}
          </svg>
          {boxAnnotations.map((annotation) => {
            const displayQuad = liveEdit?.id === annotation.id ? liveEdit.quad : annotation.quad;
            const style = quadToCssStyle(displayQuad, viewport);
            if (annotation.kind === 'signature') {
              return (
                <div key={annotation.id} className="annotation-dom" style={style}>
                  <img
                    className={`annotation-signature ${selectedId === annotation.id ? 'selected' : ''}`}
                    src={annotation.dataUrl}
                    alt={annotation.label ? `Signature: ${annotation.label}` : 'Signature stamp'}
                    draggable={false}
                  />
                </div>
              );
            }
            return (
              <div key={annotation.id} className="annotation-dom" style={style}>
                <div
                  className={`annotation-note ${selectedId === annotation.id ? 'selected' : ''}`}
                  style={{
                    color: annotation.color,
                    fontSize: `${annotation.fontSize * scale}px`,
                  }}
                >
                  {annotation.text}
                </div>
              </div>
            );
          })}
        </div>

        <canvas
          ref={inkCanvasRef}
          className="ink-canvas"
          onPointerDown={handleInkPointerDown}
          onPointerMove={handleInkPointerMove}
          onPointerUp={finishInk}
          onPointerCancel={finishInk}
          aria-label={tool === 'ink' ? 'Draw on page' : undefined}
        />

        {draftForPage && textStyle ? (
          <TextComposer
            key={`${pageIndex}-${draftForPage.quad.p0.x}-${draftForPage.quad.p0.y}`}
            style={textStyle}
            color={textColor}
            fontSize={textFontSize * scale}
            viewportWidth={width}
            viewportHeight={height}
            onSubmit={onSubmitText}
            onCancel={onCancelText}
          />
        ) : null}

        {selectedBox && selectedBoxBounds && tool === 'select' ? (
          <span
            className="annotation-resize-handle"
            style={{
              left: selectedBoxBounds.x + selectedBoxBounds.width - 9,
              top: selectedBoxBounds.y + selectedBoxBounds.height - 9,
            }}
            onPointerDown={(event) => beginAnnotationDrag(event, selectedBox, 'resize')}
            role="presentation"
            aria-label="Resize annotation"
          />
        ) : null}

        {signaturePreview && signaturePreview.pageIndex === pageIndex && previewRect ? (
          <div
            className="signature-preview"
            style={{
              left: previewRect.x,
              top: previewRect.y,
              width: previewRect.width,
              height: previewRect.height,
            }}
            onPointerDown={(event) => startPreviewDrag(event, 'move')}
            onPointerMove={movePreviewDrag}
            onPointerUp={finishPreviewDrag}
            onPointerCancel={finishPreviewDrag}
            role="group"
            aria-label="Signature preview. Drag to move, use the corner handle to resize."
          >
            <span className="signature-badge">{signaturePreview.targetLabel ?? 'Move signature'}</span>
            {previewContentStyle ? (
              <span
                className="signature-preview-visual"
                style={{
                  left: previewContentStyle.left - previewRect.x,
                  top: previewContentStyle.top - previewRect.y,
                  width: previewContentStyle.width,
                  height: previewContentStyle.height,
                  transform: previewContentStyle.transform,
                }}
              >
                <img src={signaturePreview.dataUrl} alt="Signature preview, not yet added" draggable={false} />
              </span>
            ) : null}
            <span
              className="signature-handle"
              onPointerDown={(event) => startPreviewDrag(event, 'resize')}
              onPointerMove={movePreviewDrag}
              onPointerUp={finishPreviewDrag}
              onPointerCancel={finishPreviewDrag}
              role="presentation"
            />
          </div>
        ) : null}

        {renderError ? (
          <div className="page-error">
            <strong>Page {pageIndex + 1} did not render</strong>
            <span>{renderError}</span>
          </div>
        ) : null}
        <span className="page-number-ghost">{pageIndex + 1}</span>
      </div>
    </div>
  );
}

function InkSelectionBox({
  annotation,
  viewport,
}: {
  annotation: Extract<Annotation, { kind: 'ink' }>;
  viewport: ReturnType<PdfDocumentSession['getViewport']>;
}) {
  const points = annotation.strokes.flat();
  if (points.length === 0) return null;
  const screen = points.map((point) => {
    const [x, y] = viewport.convertToViewportPoint(point.x, point.y) as [number, number];
    return { x, y };
  });
  const minX = Math.min(...screen.map((point) => point.x));
  const minY = Math.min(...screen.map((point) => point.y));
  const maxX = Math.max(...screen.map((point) => point.x));
  const maxY = Math.max(...screen.map((point) => point.y));
  return (
    <rect
      className="selected-outline"
      x={minX - 4}
      y={minY - 4}
      width={maxX - minX + 8}
      height={maxY - minY + 8}
    />
  );
}

function TextComposer({
  style,
  color,
  fontSize,
  viewportWidth,
  viewportHeight,
  onSubmit,
  onCancel,
}: {
  style: { left: number; top: number; width: number; height: number; transform: string };
  color: string;
  fontSize: number;
  viewportWidth: number;
  viewportHeight: number;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const left = Math.max(0, Math.min(style.left, viewportWidth - 270));
  const top = Math.max(0, Math.min(style.top + 4, viewportHeight - 210));

  useEffect(() => {
    const timer = setTimeout(() => ref.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="text-composer"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Write a note…"
        maxLength={2000}
        style={{ color, fontSize: Math.max(11, Math.min(fontSize, 20)) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (text.trim()) onSubmit(text.trim());
          }
        }}
        aria-label="Text annotation"
      />
      <div className="text-composer-actions">
        <span className="hint">Ctrl+Enter</span>
        <button className="button sm ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button sm primary"
          type="button"
          disabled={!text.trim()}
          onClick={() => onSubmit(text.trim())}
        >
          Add note
        </button>
      </div>
    </div>
  );
}
