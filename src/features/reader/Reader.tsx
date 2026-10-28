import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  Minimize2,
  Minus,
  MoonStar,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { Annotation, HighlightColor, PdfPoint, PdfQuad, TextAnnotation } from '../../annotations/types';
import { createAnnotationBase, HIGHLIGHT_COLORS, INK_COLORS, TEXT_COLORS } from '../../annotations/types';
import { addAnnotations, createHistoryState, historyReducer, removeAnnotation, updateAnnotation } from '../../annotations/history';
import { fitTextQuad } from '../../annotations/text-layout';
import { useToast } from '../../components/Toast';
import type { DigitalSignatureInfo } from '../../pdf/document';
import { findSignatureTargets, type SignatureTarget } from '../../pdf/signature-detect';
import { quadBBox, quadCenter, quadFromScreenRect, translateQuad, type ScreenRect } from '../../pdf/geometry';
import { SearchIndex, type SearchProgress, type SearchResultSet } from '../../pdf/search';
import { savePdfFile } from '../../platform';
import { saveAnnotations } from '../../storage/annotations';
import { pruneLibrary } from '../../storage/library';
import { rememberSignature } from '../../storage/signatures';
import type { ReadingSession, SpreadMode, ZoomMode } from '../../storage';
import { AnnotationsPanel } from './AnnotationsPanel';
import { PageView, type SignaturePreviewState, type TextDraft } from './PageView';
import { ReaderToolbar } from './ReaderToolbar';
import { SearchPanel } from './SearchPanel';
import { ThumbnailSidebar } from './ThumbnailSidebar';
import type { OpenedDocument, ReaderTool } from './types';
import { DocumentInfoDialog } from '../../components/DocumentInfoDialog';
import { PrintDialog } from '../../components/PrintDialog';
import { SignatureDialog } from '../signature/SignatureDialog';

export interface ReaderHandle {
  flush: () => Promise<void>;
  getSession: () => ReadingSession | null;
}

interface ReaderProps {
  doc: OpenedDocument;
  nightMode: boolean;
  onToggleNight: () => void;
  onOpenFile: () => void;
  onAbout: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onFocusChange: (focus: boolean) => void;
  onSessionChange: (session: ReadingSession) => void;
}

interface PendingSignature {
  pageIndex: number;
  quad: PdfQuad;
  dataUrl: string;
  remember: boolean;
  targetIndex: number;
  targets: SignatureTarget[];
  suppressed: boolean;
  label?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function displayBase(
  metric: OpenedDocument['metrics'][number],
  rotation: number,
): { width: number; height: number } {
  return rotation % 180 === 0
    ? { width: metric.baseWidth, height: metric.baseHeight }
    : { width: metric.baseHeight, height: metric.baseWidth };
}

function filenameForExport(name: string): string {
  const base = name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document';
  return `${base}-annotated.pdf`;
}

export const Reader = forwardRef<ReaderHandle, ReaderProps>(function Reader(
  {
    doc,
    nightMode,
    onToggleNight,
    onOpenFile,
    onAbout,
    onDirtyChange,
    onFocusChange,
    onSessionChange,
  },
  ref,
) {
  const { notify } = useToast();
  const readOnly = Boolean(doc.annotationsUnavailable);
  const initial = doc.initialSession;
  const [history, dispatch] = useReducer(historyReducer, createHistoryState(doc.annotations));
  const annotations = history.present;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ReaderTool>('select');
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('amber');
  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0]);
  const [inkThickness, setInkThickness] = useState(2);
  const [textColor, setTextColor] = useState<string>(TEXT_COLORS[0]);
  const [textFontSize, setTextFontSize] = useState(12);
  const [page, setPage] = useState(() => clamp(initial?.page ?? 0, 0, doc.session.pageCount - 1));
  const [zoomMode, setZoomMode] = useState<ZoomMode>(
    initial?.zoomMode ?? (typeof window !== 'undefined' && window.innerWidth < 900 ? 'fit-width' : 'fit-page'),
  );
  const [zoomValue, setZoomValue] = useState(initial?.zoomValue ?? 1);
  const [rotation, setRotation] = useState(initial?.rotation ?? 0);
  const [sidebarVisible, setSidebarVisible] = useState(
    typeof window !== 'undefined' && window.innerWidth > 760
      ? (initial?.sidebarVisible ?? true)
      : false,
  );
  const [spreadMode, setSpreadMode] = useState<SpreadMode>(initial?.spreadMode ?? 'single');
  const [focusMode, setFocusMode] = useState(false);
  const [rightPanel, setRightPanel] = useState<'search' | 'annotations' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultSet | null>(null);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [searchNavigationToken, setSearchNavigationToken] = useState(0);
  const [searchProgress, setSearchProgress] = useState<SearchProgress>({
    indexedPages: 0,
    totalPages: doc.session.pageCount,
    done: false,
  });
  const [digitalSignatures, setDigitalSignatures] = useState<DigitalSignatureInfo[]>([]);
  const [signatureCheck, setSignatureCheck] = useState<'checking' | 'none' | 'present' | 'unavailable'>('checking');
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [signatureTargets, setSignatureTargets] = useState<SignatureTarget[]>([]);
  const [pendingSignature, setPendingSignature] = useState<PendingSignature | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [restoreTick, setRestoreTick] = useState(0);
  const [readingSize, setReadingSize] = useState({ width: 0, height: 0 });

  const readingAreaRef = useRef<HTMLDivElement>(null);
  const focusExitRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const scrollRafRef = useRef<number | null>(null);
  const anchorRef = useRef<{ pageIndex: number; offset: number } | null>(null);
  const restoringRef = useRef(false);
  const restoredRef = useRef(initial === null);
  const annotationsRef = useRef(annotations);
  const pageRef = useRef(page);
  const lastSavedRef = useRef(JSON.stringify(doc.annotations));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIndexRef = useRef<SearchIndex | null>(null);
  const lastQueryRef = useRef('');
  const mountedRef = useRef(true);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const selectedAnnotation = selectedId ? annotations.find((annotation) => annotation.id === selectedId) ?? null : null;

  const rows = useMemo(() => {
    if (doc.session.pageCount === 0) return [];
    if (spreadMode === 'single') return doc.metrics.map((_, index) => [index]);
    const result: number[][] = [[0]];
    for (let index = 1; index < doc.session.pageCount; index += 2) {
      result.push(index + 1 < doc.session.pageCount ? [index, index + 1] : [index]);
    }
    return result;
  }, [doc.metrics, doc.session.pageCount, spreadMode]);

  const rowWidthPoints = useMemo(() => {
    return Math.max(
      1,
      ...rows.map((row) =>
        row.reduce((sum, pageIndex) => sum + displayBase(doc.metrics[pageIndex], rotation).width, 0),
      ),
    );
  }, [rows, doc.metrics, rotation]);

  const rowHeightPoints = useMemo(() => {
    return Math.max(
      1,
      ...rows.map((row) =>
        Math.max(...row.map((pageIndex) => displayBase(doc.metrics[pageIndex], rotation).height)),
      ),
    );
  }, [rows, doc.metrics, rotation]);

  const availableWidth = Math.max(280, (readingSize.width || 960) - 60);
  const availableHeight = Math.max(240, (readingSize.height || 720) - 76);
  const maxRowLength = useMemo(() => Math.max(1, ...rows.map((row) => row.length)), [rows]);

  const scale = useMemo(() => {
    const fitWidth =
      (availableWidth - Math.max(0, maxRowLength - 1) * 20) / Math.max(1, rowWidthPoints);
    const fitPage = Math.min(fitWidth, availableHeight / Math.max(1, rowHeightPoints));
    if (zoomMode === 'fit-width') return clamp(fitWidth, 0.12, 6);
    if (zoomMode === 'fit-page') return clamp(fitPage, 0.12, 6);
    return clamp(zoomValue, 0.12, 6);
  }, [availableHeight, availableWidth, maxRowLength, rowHeightPoints, rowWidthPoints, zoomMode, zoomValue]);

  const rowForPage = useCallback(
    (pageIndex: number) => rows.find((row) => row.includes(pageIndex)) ?? rows[0],
    [rows],
  );

  const rowTop = useCallback((element: HTMLDivElement, area: HTMLDivElement) => {
    return element.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop;
  }, []);

  const scrollToPage = useCallback(
    (pageIndex: number, behavior: ScrollBehavior = 'auto') => {
      const area = readingAreaRef.current;
      const row = rowForPage(pageIndex);
      if (!area || !row) return;
      const element = rowRefs.current.get(row[0]);
      if (!element) return;
      restoringRef.current = true;
      area.scrollTo({ top: Math.max(0, rowTop(element, area) - 18), behavior });
      setPage(row[0]);
      window.setTimeout(() => {
        restoringRef.current = false;
      }, 320);
    },
    [rowForPage, rowTop],
  );

  const goToAdjacentRow = useCallback(
    (direction: 1 | -1) => {
      const area = readingAreaRef.current;
      if (!area) return;
      const row = rowForPage(pageRef.current);
      const rowIndex = rows.findIndex((candidate) => candidate === row);
      const next = rows[clamp(rowIndex + direction, 0, rows.length - 1)];
      if (next) scrollToPage(next[0]);
    },
    [rowForPage, rows, scrollToPage],
  );

  const captureAnchor = useCallback(() => {
    const area = readingAreaRef.current;
    if (!area) return;
    const currentPage = pageRef.current;
    const row = rowForPage(currentPage);
    if (!row) return;
    const element = rowRefs.current.get(row[0]);
    if (!element) return;
    anchorRef.current = {
      pageIndex: row[0],
      offset: rowTop(element, area) - area.scrollTop,
    };
  }, [rowForPage, rowTop]);

  useLayoutEffect(() => {
    const area = readingAreaRef.current;
    const anchor = anchorRef.current;
    if (!area || !anchor) return;
    const row = rowForPage(anchor.pageIndex);
    const element = row ? rowRefs.current.get(row[0]) : null;
    if (element) {
      area.scrollTop = Math.max(0, rowTop(element, area) - anchor.offset);
    }
    anchorRef.current = null;
  }, [scale, rotation, spreadMode, rows, rowForPage, rowTop]);


  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const collapse = () => {
      if (query.matches) setSidebarVisible(false);
    };
    collapse();
    query.addEventListener('change', collapse);
    return () => query.removeEventListener('change', collapse);
  }, []);

  useEffect(() => {
    const area = readingAreaRef.current;
    if (!area) return;
    const measure = () => setReadingSize({ width: area.clientWidth, height: area.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (restoredRef.current) return;
    if (readingSize.width < 80) return;
    restoringRef.current = true;
    let frame = 0;
    let second = 0;
    frame = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const area = readingAreaRef.current;
        if (!area) return;
        if (initial && initial.scrollTop > 2) {
          area.scrollTop = initial.scrollTop;
          setPage(clamp(initial.page, 0, doc.session.pageCount - 1));
        } else if (initial) {
          const row = rowForPage(initial.page);
          if (row) {
            const element = rowRefs.current.get(row[0]);
            if (element) area.scrollTop = Math.max(0, rowTop(element, area) - 18);
          }
        }
        restoredRef.current = true;
        restoringRef.current = false;
        setRestoreTick((value) => value + 1);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(second);
      restoringRef.current = false;
    };
  }, [doc.session.pageCount, initial, readingSize.width, rowForPage, rowTop, rows]);

  const onScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (restoringRef.current) return;
      const area = readingAreaRef.current;
      if (!area) return;
      const scrollTop = area.scrollTop;
      let bestRow = rows[0];
      const threshold = scrollTop + Math.min(area.clientHeight * 0.4, 340);
      for (const row of rows) {
        const element = rowRefs.current.get(row[0]);
        if (!element) continue;
        if (rowTop(element, area) <= threshold) bestRow = row;
        else break;
      }
      if (bestRow && bestRow[0] !== pageRef.current) setPage(bestRow[0]);
      onSessionChange(buildSessionRef.current(true));
    });
  }, [onSessionChange, rows, rowTop]);

  // ---------------------------------------------------------------------
  // Session persistence (App owns the durable save; Reader publishes state)
  // ---------------------------------------------------------------------
  const buildSession = useCallback(
    (restorable: boolean): ReadingSession => ({
      id: 'last',
      documentId: doc.session.fingerprint,
      page,
      scrollTop: readingAreaRef.current?.scrollTop ?? 0,
      zoomMode,
      zoomValue: scale,
      rotation,
      sidebarVisible,
      spreadMode,
      nightMode,
      restorable,
      updatedAt: Date.now(),
    }),
    [
      doc.session.fingerprint,
      nightMode,
      page,
      rotation,
      scale,
      sidebarVisible,
      spreadMode,
      zoomMode,
    ],
  );
  const buildSessionRef = useRef(buildSession);
  useEffect(() => {
    buildSessionRef.current = buildSession;
  }, [buildSession]);

  useEffect(() => {
    if (!restoredRef.current) return;
    onSessionChange(buildSession(true));
  }, [buildSession, onSessionChange, restoreTick]);

  // ---------------------------------------------------------------------
  // Annotation persistence
  // ---------------------------------------------------------------------
  const persistAnnotations = useCallback(async () => {
    if (readOnly) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const snapshot = annotationsRef.current;
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSavedRef.current) {
      if (mountedRef.current) setDirty(false);
      return;
    }
    try {
      try {
        await saveAnnotations(doc.session.fingerprint, snapshot);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          await pruneLibrary([doc.session.fingerprint]);
          await saveAnnotations(doc.session.fingerprint, snapshot);
        } else {
          throw error;
        }
      }
      lastSavedRef.current = serialized;
      if (mountedRef.current) {
        setDirty(JSON.stringify(annotationsRef.current) !== serialized);
      }
    } catch (error) {
      if (mountedRef.current) {
        setDirty(true);
        notify(
          error instanceof Error
            ? `Annotations could not be saved locally: ${error.message}`
            : 'Annotations could not be saved locally.',
          'error',
        );
      }
      throw error;
    }
  }, [doc.session.fingerprint, notify, readOnly]);

  useEffect(() => {
    annotationsRef.current = annotations;
    if (readOnly) {
      setDirty(false);
      return;
    }
    const serialized = JSON.stringify(annotations);
    if (serialized === lastSavedRef.current) {
      setDirty(false);
      return;
    }
    setDirty(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistAnnotations().catch(() => undefined);
    }, 350);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [annotations, persistAnnotations, readOnly]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (readOnly) return;
      const id = doc.session.fingerprint;
      const snapshot = annotationsRef.current;
      void saveAnnotations(id, snapshot).catch(() => undefined);
    };
  }, [doc.session.fingerprint, readOnly]);

  useEffect(() => {
    return () => {
      void doc.session.destroy();
    };
  }, [doc.session]);

  useImperativeHandle(
    ref,
    () => ({
      flush: persistAnnotations,
      getSession: () => buildSession(true),
    }),
    [buildSession, persistAnnotations],
  );

  // ---------------------------------------------------------------------
  // Search index
  // ---------------------------------------------------------------------
  useEffect(() => {
    const index = new SearchIndex(doc.session, (progress) => setSearchProgress(progress));
    searchIndexRef.current = index;
    void index.build();
    return () => {
      index.destroy();
      searchIndexRef.current = null;
    };
  }, [doc.session]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(null);
      setActiveMatchIndex(0);
      lastQueryRef.current = '';
      return;
    }
    const timer = setTimeout(() => {
      const results = searchIndexRef.current?.search(query) ?? null;
      setSearchResults(results);
      setActiveMatchIndex((current) => {
        if (!results || results.total === 0) return 0;
        return clamp(current, 0, results.total - 1);
      });
      if (results && results.total > 0 && lastQueryRef.current !== query) {
        lastQueryRef.current = query;
        scrollToPage(results.matches[0].pageIndex);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProgress.indexedPages, scrollToPage]);

  const activeMatch =
    searchResults && searchResults.matches.length > 0
      ? searchResults.matches[clamp(activeMatchIndex, 0, searchResults.matches.length - 1)]
      : null;

  const goToMatch = useCallback(
    (index: number) => {
      if (!searchResults || searchResults.total === 0) return;
      const next = ((index % searchResults.total) + searchResults.total) % searchResults.total;
      setActiveMatchIndex(next);
      setSearchNavigationToken((current) => current + 1);
      const match = searchResults.matches[next];
      if (match) scrollToPage(match.pageIndex);
      if (window.innerWidth < 1050) setRightPanel(null);
    },
    [scrollToPage, searchResults],
  );

  // ---------------------------------------------------------------------
  // Digital signatures and signature placement
  // ---------------------------------------------------------------------
  useEffect(() => {
    let active = true;
    void doc.session
      .getDigitalSignatures()
      .then((signatures) => {
        if (!active) return;
        setDigitalSignatures(signatures);
        setSignatureCheck(signatures.length > 0 ? 'present' : 'none');
      })
      .catch(() => {
        if (active) setSignatureCheck('unavailable');
      });
    return () => {
      active = false;
    };
  }, [doc.session]);

  useEffect(() => {
    if (!signatureDialogOpen) return;
    let active = true;
    setSignatureTargets([]);
    const timer = setTimeout(() => {
      void doc.session
        .getPage(page)
        .then((pdfPage) => findSignatureTargets(pdfPage))
        .then((targets) => {
          if (active) setSignatureTargets(targets);
        })
        .catch(() => undefined);
    }, 380);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [doc.session, page, signatureDialogOpen]);

  const beginSignaturePlacement = useCallback(
    (dataUrl: string, remember: boolean) => {
      const suppressed = signatureCheck !== 'none';
      const targets = suppressed ? [] : signatureTargets;
      const target = targets[0];
      let quad: PdfQuad;
      if (target) {
        quad = target.quad;
      } else {
        const viewport = doc.session.getViewport(page, scale, rotation);
        const width = Math.min(280, viewport.width * 0.5);
        const height = width * 0.36;
        quad = quadFromScreenRect(
          {
            x: (viewport.width - width) / 2,
            y: viewport.height * 0.58 - height / 2,
            width,
            height,
          },
          viewport,
        );
      }
      setSignatureDialogOpen(false);
      setTool('select');
      setPendingSignature({
        pageIndex: page,
        quad,
        dataUrl,
        remember,
        targets,
        targetIndex: target ? 0 : -1,
        suppressed,
        label: target?.label,
      });
    },
    [doc.session, page, rotation, scale, signatureCheck, signatureTargets],
  );

  const changeSignatureTarget = () => {
    if (!pendingSignature || pendingSignature.targets.length < 2) return;
    const nextIndex = (pendingSignature.targetIndex + 1) % pendingSignature.targets.length;
    const target = pendingSignature.targets[nextIndex];
    setPendingSignature({
      ...pendingSignature,
      targetIndex: nextIndex,
      quad: target.quad,
      label: target.label,
    });
  };

  const approveSignature = async () => {
    if (!pendingSignature) return;
    const annotation = {
      ...createAnnotationBase(pendingSignature.pageIndex),
      kind: 'signature' as const,
      quad: pendingSignature.quad,
      dataUrl: pendingSignature.dataUrl,
      label: pendingSignature.label,
    };
    dispatch({ type: 'commit', annotations: addAnnotations(annotations, [annotation]) });
    setSelectedId(annotation.id);
    const wasRemembered = pendingSignature.remember;
    setPendingSignature(null);
    if (wasRemembered) {
      try {
        await rememberSignature(annotation.dataUrl);
        notify('Signature added and remembered on this device.', 'success');
      } catch {
        notify('Signature added, but it could not be remembered.', 'error');
      }
    } else {
      notify('Signature added. Undo is available if you need to move it.', 'success');
    }
  };

  // ---------------------------------------------------------------------
  // Annotation interactions
  // ---------------------------------------------------------------------
  const addHighlightFromSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const startElement =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    if (!startElement?.closest('.page-text-layer')) return;
    const rects = Array.from(range.getClientRects());
    const groups = new Map<number, ScreenRect[]>();
    for (const rect of rects) {
      if (rect.width < 1.5 || rect.height < 1.5) continue;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elements = window.document.elementsFromPoint(centerX, centerY);
      const frame = elements
        .map((element) => element.closest<HTMLElement>('.page-frame'))
        .find((element): element is HTMLElement => Boolean(element));
      if (!frame) continue;
      const pageIndex = Number(frame.dataset.pageIndex);
      if (!Number.isInteger(pageIndex)) continue;
      const frameRect = frame.getBoundingClientRect();
      const local: ScreenRect = {
        x: rect.left - frameRect.left,
        y: rect.top - frameRect.top,
        width: rect.width,
        height: rect.height,
      };
      const list = groups.get(pageIndex);
      if (list) list.push(local);
      else groups.set(pageIndex, [local]);
    }
    if (groups.size === 0) return;
    const additions: Annotation[] = [];
    for (const [pageIndex, pageRects] of groups) {
      const viewport = doc.session.getViewport(pageIndex, scale, rotation);
      const quads = pageRects.map((rect) => quadFromScreenRect(rect, viewport));
      if (quads.length === 0) continue;
      additions.push({
        ...createAnnotationBase(pageIndex),
        kind: 'highlight',
        color: highlightColor,
        quads,
      });
    }
    if (additions.length === 0) return;
    dispatch({ type: 'commit', annotations: addAnnotations(annotations, additions) });
    selection.removeAllRanges();
  }, [annotations, doc.session, highlightColor, rotation, scale]);

  useEffect(() => {
    if (tool !== 'highlight' || readOnly) return;
    const onMouseUp = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('button, input, textarea, .toolbar, .side-panel, .modal, .thumb-sidebar')) return;
      addHighlightFromSelection();
    };
    window.document.addEventListener('mouseup', onMouseUp);
    return () => window.document.removeEventListener('mouseup', onMouseUp);
  }, [addHighlightFromSelection, tool, readOnly]);

  useEffect(() => {
    if (tool !== 'text' && textDraft) setTextDraft(null);
  }, [textDraft, tool]);

  const handleCreateInk = (strokes: PdfPoint[][], pageIndex: number) => {
    if (strokes.length === 0) return;
    const annotation: Annotation = {
      ...createAnnotationBase(pageIndex),
      kind: 'ink',
      color: inkColor,
      thickness: inkThickness,
      strokes,
    };
    dispatch({ type: 'commit', annotations: addAnnotations(annotations, [annotation]) });
  };

  const fitAndClampText = (quad: PdfQuad, text: string, fontSize: number, pageIndex: number): PdfQuad => {
    let fitted = fitTextQuad(quad, text, fontSize);
    const page = doc.session.pages[pageIndex];
    if (!page) return fitted;
    const [x0, y0, x1, y1] = page.view;
    const bounds = quadBBox(fitted);
    let dx = 0;
    let dy = 0;
    if (bounds.x < x0) dx = x0 - bounds.x;
    else if (bounds.x + bounds.width > x1) dx = x1 - (bounds.x + bounds.width);
    if (bounds.y < y0) dy = y0 - bounds.y;
    else if (bounds.y + bounds.height > y1) dy = y1 - (bounds.y + bounds.height);
    if (dx !== 0 || dy !== 0) fitted = translateQuad(fitted, dx, dy);
    return fitted;
  };

  const handleSubmitText = (text: string) => {
    if (!textDraft) return;
    const annotation: TextAnnotation = {
      ...createAnnotationBase(textDraft.pageIndex),
      kind: 'text',
      color: textColor,
      fontSize: textFontSize,
      quad: fitAndClampText(textDraft.quad, text, textFontSize, textDraft.pageIndex),
      text,
    };
    dispatch({ type: 'commit', annotations: addAnnotations(annotations, [annotation]) });
    setTextDraft(null);
    setSelectedId(annotation.id);
  };

  const nudgeSelected = (dxScreen: number, dyScreen: number) => {
    if (!selectedAnnotation || (selectedAnnotation.kind !== 'text' && selectedAnnotation.kind !== 'signature')) {
      return;
    }
    const viewport = doc.session.getViewport(page, scale, rotation);
    const [x0, y0] = viewport.convertToPdfPoint(0, 0) as [number, number];
    const [x1, y1] = viewport.convertToPdfPoint(dxScreen, dyScreen) as [number, number];
    updateSelected({
      quad: translateQuad(selectedAnnotation.quad, x1 - x0, y1 - y0),
    } as Partial<Annotation>);
  };

  const scaleSelected = (factor: number) => {
    if (!selectedAnnotation || (selectedAnnotation.kind !== 'text' && selectedAnnotation.kind !== 'signature')) {
      return;
    }
    const center = quadCenter(selectedAnnotation.quad);
    const scalePoint = (point: { x: number; y: number }) => ({
      x: center.x + (point.x - center.x) * factor,
      y: center.y + (point.y - center.y) * factor,
    });
    updateSelected({
      quad: {
        p0: scalePoint(selectedAnnotation.quad.p0),
        p1: scalePoint(selectedAnnotation.quad.p1),
        p2: scalePoint(selectedAnnotation.quad.p2),
        p3: scalePoint(selectedAnnotation.quad.p3),
      },
    } as Partial<Annotation>);
  };

  const updateSelected = (changes: Partial<Annotation>) => {
    if (!selectedAnnotation) return;
    let updated = { ...selectedAnnotation, ...changes, updatedAt: Date.now() } as Annotation;
    if (updated.kind === 'text' && ('fontSize' in changes || 'text' in changes)) {
      updated = {
        ...updated,
        quad: fitAndClampText(updated.quad, updated.text, updated.fontSize, updated.pageIndex),
      };
    }
    dispatch({ type: 'commit', annotations: updateAnnotation(annotations, updated) });
  };

  const deleteSelected = () => {
    if (!selectedAnnotation) return;
    dispatch({ type: 'commit', annotations: removeAnnotation(annotations, selectedAnnotation.id) });
    setSelectedId(null);
  };

  useEffect(() => {
    if (selectedId && !annotations.some((annotation) => annotation.id === selectedId)) {
      setSelectedId(null);
    }
  }, [annotations, selectedId]);

  // ---------------------------------------------------------------------
  // Zoom, focus, keyboard
  // ---------------------------------------------------------------------
  const setZoom = useCallback(
    (mode: ZoomMode, value: number) => {
      captureAnchor();
      setZoomMode(mode);
      if (mode === 'custom') setZoomValue(value);
    },
    [captureAnchor],
  );

  const zoomIn = useCallback(() => {
    captureAnchor();
    setZoomMode('custom');
    setZoomValue(clamp(scale * 1.15, 0.12, 6));
  }, [captureAnchor, scale]);

  const zoomOut = useCallback(() => {
    captureAnchor();
    setZoomMode('custom');
    setZoomValue(clamp(scale / 1.15, 0.12, 6));
  }, [captureAnchor, scale]);

  const rotate = () => {
    captureAnchor();
    setRotation((current) => (current + 90) % 360);
  };

  const toggleSpread = () => {
    captureAnchor();
    setSpreadMode((current) => (current === 'single' ? 'double' : 'single'));
  };

  const toggleSidebar = () => {
    captureAnchor();
    setSidebarVisible((current) => !current);
  };

  const toggleFocus = useCallback(() => {
    captureAnchor();
    setFocusMode((current) => !current);
  }, [captureAnchor]);

  useEffect(() => {
    onFocusChange(focusMode);
    if (focusMode) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => focusExitRef.current?.focus(), 60);
      return () => {
        clearTimeout(timer);
        onFocusChange(false);
        previousFocusRef.current?.focus();
      };
    }
    previousFocusRef.current?.focus();
    return () => onFocusChange(false);
  }, [focusMode, onFocusChange]);

  const exportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      try {
        await persistAnnotations();
      } catch {
        notify('Annotations could not be saved locally; exporting the current in-memory state instead.', 'error');
      }
      const { exportAnnotatedPdf } = await import('../../pdf/export');
      const bytes = await exportAnnotatedPdf(doc.session.bytes, annotationsRef.current);
      const buffer = bytes.slice().buffer;
      const saved = await savePdfFile(filenameForExport(doc.recent.name), buffer);
      if (saved) notify('Annotated PDF exported.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The PDF could not be exported.', 'error');
    } finally {
      setExporting(false);
    }
  }, [doc.recent.name, doc.session.bytes, exporting, notify, persistAnnotations]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (window.document.querySelector('dialog[open]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'o') {
        event.preventDefault();
        onOpenFile();
        return;
      }
      if (mod && key === 'f') {
        event.preventDefault();
        setRightPanel('search');
        return;
      }
      if (mod && key === 'p') {
        event.preventDefault();
        setPrintOpen(true);
        return;
      }
      if (mod && key === 's') {
        event.preventDefault();
        void exportPdf();
        return;
      }
      if (mod && key === 'z') {
        event.preventDefault();
        if (!readOnly) dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        if (!readOnly) dispatch({ type: 'redo' });
        return;
      }
      if (mod && (key === '+' || key === '=')) {
        event.preventDefault();
        zoomIn();
        return;
      }
      if (mod && key === '-') {
        event.preventDefault();
        zoomOut();
        return;
      }
      if (mod && key === '0') {
        event.preventDefault();
        setZoom('fit-page', 1);
        return;
      }
      if (key === 'escape') {
        if (pendingSignature) {
          setPendingSignature(null);
          return;
        }
        if (textDraft) {
          setTextDraft(null);
          return;
        }
        if (focusMode) {
          toggleFocus();
          return;
        }
        if (rightPanel) {
          setRightPanel(null);
          return;
        }
        if (selectedId) {
          setSelectedId(null);
        }
        return;
      }
      if (event.key === 'PageDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        goToAdjacentRow(1);
        return;
      }
      if (event.key === 'PageUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        goToAdjacentRow(-1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        scrollToPage(0);
      }
      if (event.key === 'End') {
        event.preventDefault();
        scrollToPage(doc.session.pageCount - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    doc.session.pageCount,
    exportPdf,
    focusMode,
    goToAdjacentRow,
    onOpenFile,
    pendingSignature,
    readOnly,
    rightPanel,
    scrollToPage,
    selectedId,
    setZoom,
    textDraft,
    toggleFocus,
    zoomIn,
    zoomOut,
  ]);

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  const currentSignaturePreview: SignaturePreviewState | null = pendingSignature
    ? {
          pageIndex: pendingSignature.pageIndex,
          quad: pendingSignature.quad,
          dataUrl: pendingSignature.dataUrl,
          targetLabel:
            pendingSignature.targets.length > 0 && pendingSignature.targetIndex >= 0
              ? `Suggested field ${pendingSignature.targetIndex + 1} of ${pendingSignature.targets.length}`
              : 'Preview only',
      }
    : null;

  return (
    <div className={`reader ${focusMode ? 'focus-mode' : ''}`}>
      <ReaderToolbar
        tool={tool}
        onToolChange={(nextTool) => {
          if (readOnly && nextTool !== 'select') return;
          setTool(nextTool);
          setSignatureDialogOpen(false);
          if (nextTool !== 'text') setTextDraft(null);
        }}
        highlightColor={highlightColor}
        onHighlightColorChange={setHighlightColor}
        inkColor={inkColor}
        onInkColorChange={setInkColor}
        inkThickness={inkThickness}
        onInkThicknessChange={setInkThickness}
        textColor={textColor}
        onTextColorChange={setTextColor}
        textFontSize={textFontSize}
        onTextFontSizeChange={setTextFontSize}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={toggleSidebar}
        page={page}
        pageCount={doc.session.pageCount}
        onGoToPage={scrollToPage}
        onPreviousPage={() => goToAdjacentRow(-1)}
        onNextPage={() => goToAdjacentRow(1)}
        scale={scale}
        zoomMode={zoomMode}
        onSetZoom={setZoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        rotation={rotation}
        onRotate={rotate}
        spreadMode={spreadMode}
        onToggleSpread={toggleSpread}
        focusMode={focusMode}
        onToggleFocus={toggleFocus}
        rightPanel={rightPanel}
        onToggleSearch={() => setRightPanel((current) => (current === 'search' ? null : 'search'))}
        onToggleAnnotations={() =>
          setRightPanel((current) => (current === 'annotations' ? null : 'annotations'))
        }
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onOpenSignature={() => {
          setSignatureDialogOpen(true);
          setSelectedId(null);
        }}
        onExport={() => void exportPdf()}
        exporting={exporting}
        onPrint={() => setPrintOpen(true)}
        onInfo={() => setInfoOpen(true)}
        onOpenFile={onOpenFile}
        onAbout={onAbout}
        readOnly={readOnly}
      />

      <div className="reader-main">
        {sidebarVisible ? (
          <ThumbnailSidebar
            session={doc.session}
            currentPage={page}
            nightMode={nightMode}
            onSelect={(pageIndex) => {
              scrollToPage(pageIndex);
              if (window.innerWidth <= 760) setSidebarVisible(false);
            }}
            onClose={toggleSidebar}
          />
        ) : null}

        <div
          className="reading-area"
          ref={readingAreaRef}
          onScroll={onScroll}
          tabIndex={0}
          aria-label={`${doc.recent.title || doc.recent.name}, ${doc.session.pageCount} pages`}
        >
          <div className="pages">
            {rows.map((row) => (
              <div
                className="page-row"
                key={row[0]}
                ref={(element) => {
                  if (element) rowRefs.current.set(row[0], element);
                  else rowRefs.current.delete(row[0]);
                }}
              >
                {row.map((pageIndex) => (
                  <PageView
                    key={pageIndex}
                    session={doc.session}
                    pageIndex={pageIndex}
                    scale={scale}
                    rotation={rotation}
                    current={pageIndex === page}
                    tool={tool}
                    annotations={annotations}
                    selectedId={selectedId}
                    inkColor={inkColor}
                    inkThickness={inkThickness}
                    nightMode={nightMode}
                    scrollRoot={readingAreaRef}
                    searchQuery={searchQuery}
                    searchCaseSensitive={false}
                    activePageOrdinal={activeMatch?.pageIndex === pageIndex ? activeMatch.ordinalOnPage : null}
                    searchNavigationToken={searchNavigationToken}
                    textDraft={textDraft}
                    textColor={textColor}
                    textFontSize={textFontSize}
                    signaturePreview={
                      pendingSignature?.pageIndex === pageIndex ? currentSignaturePreview : null
                    }
                    onSelect={setSelectedId}
                    onCreateInk={(strokes) => handleCreateInk(strokes, pageIndex)}
                    onTextRequest={(quad) => {
                      setSelectedId(null);
                      setTextDraft({ pageIndex, quad });
                    }}
                    onSubmitText={handleSubmitText}
                    onCancelText={() => setTextDraft(null)}
                    onSignatureQuadChange={(quad) => {
                      setPendingSignature((current) => (current ? { ...current, quad } : current));
                    }}
                    onChangeAnnotation={(updated) => {
                      dispatch({ type: 'commit', annotations: updateAnnotation(annotations, updated) });
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {rightPanel === 'search' ? (
          <SearchPanel
            query={searchQuery}
            onQueryChange={setSearchQuery}
            results={searchResults}
            activeMatchIndex={activeMatchIndex}
            indexing={!searchProgress.done}
            indexedPages={searchProgress.indexedPages}
            totalPages={searchProgress.totalPages}
            onNext={() => goToMatch(activeMatchIndex + 1)}
            onPrevious={() => goToMatch(activeMatchIndex - 1)}
            onSelectMatch={goToMatch}
            onClose={() => setRightPanel(null)}
          />
        ) : null}

        {rightPanel === 'annotations' ? (
          <AnnotationsPanel
            annotations={annotations}
            selectedId={selectedId}
            onSelect={(annotation) => {
              setSelectedId(annotation.id);
              setTool('select');
              scrollToPage(annotation.pageIndex);
            }}
            onDelete={(annotation) => {
              dispatch({ type: 'commit', annotations: removeAnnotation(annotations, annotation.id) });
              if (selectedId === annotation.id) setSelectedId(null);
            }}
            onClose={() => setRightPanel(null)}
          />
        ) : null}

        {readOnly ? (
          <div className="signature-warning-banner" role="status">
            <CircleAlert size={13} />
            Reading only — local annotations could not be read. Existing data will not be overwritten.
          </div>
        ) : null}

        {digitalSignatures.length > 0 ? (
          <button
            className="signature-warning-banner"
            type="button"
            onClick={() => setInfoOpen(true)}
            title="This PDF contains digital signatures. Adding annotations may affect their validity."
          >
            <CircleAlert size={13} />
            This PDF has {digitalSignatures.length} digital signature
            {digitalSignatures.length === 1 ? '' : 's'}. Editing may affect validity.
          </button>
        ) : null}

        {selectedAnnotation ? (
          <div className="inspector" role="group" aria-label="Annotation inspector">
            <span className="inspector-title">
              {selectedAnnotation.kind === 'highlight'
                ? 'Highlight'
                : selectedAnnotation.kind === 'ink'
                  ? 'Ink'
                  : selectedAnnotation.kind === 'text'
                    ? 'Note'
                    : 'Signature'}
            </span>
            {selectedAnnotation.kind === 'highlight' ? (
              <div className="swatch-row">
                {HIGHLIGHT_COLORS.map((entry) => (
                  <button
                    key={entry.id}
                    className={`swatch ${selectedAnnotation.color === entry.id ? 'active' : ''}`}
                    style={{ background: entry.hex }}
                    onClick={() => updateSelected({ color: entry.id } as Partial<Annotation>)}
                    aria-label={`${entry.label} highlight`}
                    aria-pressed={selectedAnnotation.color === entry.id}
                    type="button"
                  />
                ))}
              </div>
            ) : null}
            {selectedAnnotation.kind === 'ink' ? (
              <>
                <div className="swatch-row">
                  {INK_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`swatch ${selectedAnnotation.color === color ? 'active' : ''}`}
                      style={{ background: color }}
                      onClick={() => updateSelected({ color } as Partial<Annotation>)}
                      aria-label={`Ink color ${color}`}
                      aria-pressed={selectedAnnotation.color === color}
                      type="button"
                    />
                  ))}
                </div>
                <span className="inspector-sep" />
                <div className="range-row">
                  <input
                    type="range"
                    min={0.75}
                    max={6}
                    step={0.25}
                    value={selectedAnnotation.thickness}
                    onChange={(event) =>
                      updateSelected({ thickness: Number(event.target.value) } as Partial<Annotation>)
                    }
                    aria-label="Ink thickness"
                  />
                  <span className="range-value">{selectedAnnotation.thickness.toFixed(2)}</span>
                </div>
              </>
            ) : null}
            {selectedAnnotation.kind === 'text' ? (
              <>
                <div className="swatch-row">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`swatch ${selectedAnnotation.color === color ? 'active' : ''}`}
                      style={{ background: color }}
                      onClick={() => updateSelected({ color } as Partial<Annotation>)}
                      aria-label={`Text color ${color}`}
                      aria-pressed={selectedAnnotation.color === color}
                      type="button"
                    />
                  ))}
                </div>
                <span className="inspector-sep" />
                <div className="range-row">
                  <input
                    type="range"
                    min={9}
                    max={24}
                    step={1}
                    value={selectedAnnotation.fontSize}
                    onChange={(event) =>
                      updateSelected({ fontSize: Number(event.target.value) } as Partial<Annotation>)
                    }
                    aria-label="Text note size"
                  />
                  <span className="range-value">{selectedAnnotation.fontSize} pt</span>
                </div>
              </>
            ) : null}
            <span className="inspector-sep" />
            {selectedAnnotation.kind === 'text' || selectedAnnotation.kind === 'signature' ? (
              <>
              <div className="inspector-nudge" role="group" aria-label="Move annotation">
                <button
                  className="icon-button small"
                  onClick={() => nudgeSelected(0, -5)}
                  aria-label="Move annotation up"
                  data-tooltip="Move up"
                  type="button"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  className="icon-button small"
                  onClick={() => nudgeSelected(0, 5)}
                  aria-label="Move annotation down"
                  data-tooltip="Move down"
                  type="button"
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  className="icon-button small"
                  onClick={() => nudgeSelected(-5, 0)}
                  aria-label="Move annotation left"
                  data-tooltip="Move left"
                  type="button"
                >
                  <ArrowLeft size={12} />
                </button>
                <button
                  className="icon-button small"
                  onClick={() => nudgeSelected(5, 0)}
                  aria-label="Move annotation right"
                  data-tooltip="Move right"
                  type="button"
                >
                  <ArrowRight size={12} />
                </button>
              </div>
              <div className="inspector-nudge" role="group" aria-label="Resize annotation">
                <button
                  className="icon-button small"
                  onClick={() => scaleSelected(0.9)}
                  aria-label="Make annotation smaller"
                  data-tooltip="Smaller"
                  type="button"
                >
                  <Minus size={12} />
                </button>
                <button
                  className="icon-button small"
                  onClick={() => scaleSelected(1.1)}
                  aria-label="Make annotation larger"
                  data-tooltip="Larger"
                  type="button"
                >
                  <Plus size={12} />
                </button>
              </div>
              </>
            ) : null}
            <span className="inspector-sep" />
            <button
              className="icon-button small"
              onClick={deleteSelected}
              aria-label="Delete selected annotation"
              data-tooltip="Delete annotation"
              type="button"
            >
              <Trash2 size={13} />
            </button>
            <button
              className="icon-button small"
              onClick={() => setSelectedId(null)}
              aria-label="Close annotation inspector"
              data-tooltip="Close inspector"
              type="button"
            >
              <X size={13} />
            </button>
          </div>
        ) : null}

        {pendingSignature ? (
          <div className="signature-placement-bar" role="status">
            <div className="signature-placement-copy">
              <strong>Preview only.</strong> Page {pendingSignature.pageIndex + 1}
              {pendingSignature.targets.length > 0
                ? ` · ${pendingSignature.label ?? 'Suggested field'}`
                : ' · Drag and resize the signature before approving.'}
              {pendingSignature.suppressed ? ' · Existing digital signatures detected.' : ''}
            </div>
            <div className="signature-placement-actions">
              {pendingSignature.targets.length > 1 ? (
                <button className="button sm ghost" type="button" onClick={changeSignatureTarget}>
                  <ChevronDown size={13} />
                  Next suggested field
                </button>
              ) : null}
              <button
                className="button sm ghost"
                type="button"
                onClick={() => {
                  setPendingSignature(null);
                  notify('Signature preview discarded. Nothing was added.');
                }}
              >
                Cancel
              </button>
              <button className="button sm primary" type="button" onClick={() => void approveSignature()}>
                <Check size={13} />
                Approve and add signature
              </button>
            </div>
          </div>
        ) : null}

        {focusMode ? (
          <div className="focus-exit" role="toolbar" aria-label="Focus mode controls">
            <button
              className="icon-button small"
              onClick={onToggleNight}
              aria-label="Toggle Night Reading"
              data-tooltip="Night Reading"
              type="button"
            >
              <MoonStar size={13} />
            </button>
            <button ref={focusExitRef} className="button sm ghost" onClick={toggleFocus} type="button">
              <Minimize2 size={13} />
              Exit focus
            </button>
          </div>
        ) : null}
      </div>

      <SignatureDialog
        open={signatureDialogOpen}
        onClose={() => setSignatureDialogOpen(false)}
        onUse={(dataUrl, remember) => beginSignaturePlacement(dataUrl, remember)}
        hasDigitalSignatures={digitalSignatures.length > 0}
        signatureStatus={signatureCheck}
        protectedDocument={doc.session.isProtected}
        signatureTargetCount={signatureTargets.length}
        suggestionsSuppressed={signatureCheck !== 'none'}
      />
      <DocumentInfoDialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        name={doc.recent.name}
        title={doc.session.title}
        metadata={doc.session.metadata}
        pageCount={doc.session.pageCount}
        size={doc.recent.size}
        fingerprint={doc.session.fingerprint}
        protectedDocument={doc.session.isProtected}
        annotations={annotations}
        digitalSignatures={digitalSignatures}
        signatureStatus={signatureCheck}
      />
      <PrintDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        session={doc.session}
        annotations={annotations}
        currentPage={page}
        viewerRotation={rotation}
        onPrinted={(count) =>
          notify(`Print preview opened for ${count} ${count === 1 ? 'page' : 'pages'}.`, 'success')
        }
      />
    </div>
  );
});
