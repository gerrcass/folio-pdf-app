import { Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Annotation } from '../annotations/types';
import type { PdfDocumentSession } from '../pdf/document';
import { parsePageRange, printDocument } from '../pdf/print';
import { Modal } from './Modal';

interface PrintDialogProps {
  open: boolean;
  onClose: () => void;
  session: PdfDocumentSession;
  annotations: Annotation[];
  currentPage: number;
  viewerRotation?: number;
  onPrinted: (pageCount: number) => void;
}

type Mode = 'all' | 'current' | 'range';

export function PrintDialog({
  open,
  onClose,
  session,
  annotations,
  currentPage,
  viewerRotation = 0,
  onPrinted,
}: PrintDialogProps) {
  const [mode, setMode] = useState<Mode>('all');
  const [range, setRange] = useState('');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('all');
    setRange('');
    setIncludeAnnotations(true);
    setPrinting(false);
    setProgress({ completed: 0, total: 0 });
    setError(null);
  }, [open]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const requestedPages =
    mode === 'all'
      ? Array.from({ length: session.pageCount }, (_, index) => index)
      : mode === 'current'
        ? [currentPage]
        : parsePageRange(range, session.pageCount);

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const runPrint = async () => {
    if (requestedPages.length === 0) {
      setError('Enter a valid page range, such as 2-5 or 1, 4, 9.');
      return;
    }
    setError(null);
    setPrinting(true);
    setProgress({ completed: 0, total: requestedPages.length });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const count = await printDocument(session, {
        pageIndices: requestedPages,
        annotations,
        includeAnnotations,
        viewerRotation,
        signal: controller.signal,
        onProgress: (completed, total) => setProgress({ completed, total }),
      });
      setPrinting(false);
      abortRef.current = null;
      onPrinted(count);
      onClose();
    } catch (caught) {
      abortRef.current = null;
      setPrinting(false);
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'Printing could not start.');
    }
  };

  const footer = printing ? (
    <>
      <span className="hint" style={{ marginRight: 'auto' }}>
        Preparing {progress.completed} of {progress.total} pages…
      </span>
      <button className="button" type="button" onClick={close}>
        Cancel printing
      </button>
    </>
  ) : (
    <>
      <button className="button ghost" type="button" onClick={close}>
        Cancel
      </button>
      <button
        className="button primary"
        type="button"
        onClick={() => void runPrint()}
        disabled={requestedPages.length === 0}
      >
        <Printer size={14} />
        Print
      </button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title="Print"
      subtitle={session.title}
      footer={footer}
      closeLabel="Cancel printing"
    >
      <div className="print-summary">
        <Printer size={18} style={{ color: 'var(--ink-3)', flex: '0 0 auto' }} />
        <div>
          <strong>
            {requestedPages.length} {requestedPages.length === 1 ? 'page' : 'pages'}
          </strong>{' '}
          · Letter/A4 sized to each PDF page
          <div className="hint" style={{ marginTop: 2 }}>
            Annotations are printed as they appear in the reader.
          </div>
        </div>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <legend className="field" style={{ fontSize: 11.5, fontWeight: 600 }}>
          Pages
        </legend>
        <label className="checkbox-row">
          <input
            type="radio"
            name="print-pages"
            checked={mode === 'all'}
            onChange={() => setMode('all')}
            disabled={printing}
          />
          All pages ({session.pageCount})
        </label>
        <label className="checkbox-row">
          <input
            type="radio"
            name="print-pages"
            checked={mode === 'current'}
            onChange={() => setMode('current')}
            disabled={printing}
          />
          Current page ({currentPage + 1})
        </label>
        <label className="checkbox-row" style={{ alignItems: 'center' }}>
          <input
            type="radio"
            name="print-pages"
            checked={mode === 'range'}
            onChange={() => setMode('range')}
            disabled={printing}
          />
          Pages
          <input
            className="input"
            style={{ height: 28, width: 150 }}
            value={range}
            onChange={(event) => {
              setRange(event.target.value);
              setMode('range');
            }}
            placeholder="e.g. 2-5, 9"
            disabled={printing}
            aria-label="Page range"
          />
        </label>
      </fieldset>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={includeAnnotations}
          onChange={(event) => setIncludeAnnotations(event.target.checked)}
          disabled={printing}
        />
        Include highlights, ink, notes, and signatures
      </label>

      {mode === 'range' && range.trim() && requestedPages.length === 0 ? (
        <div className="hint warning-text">That range does not contain any printable pages. Use a range such as 2-5 or 9.</div>
      ) : null}

      {printing ? (
        <div className="progress" aria-label={`Preparing ${progress.completed} of ${progress.total} pages`}>
          <span style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }} />
        </div>
      ) : null}

      {error ? <div className="notice warn">{error}</div> : null}

      <div className="hint">
        Print preview opens through your system print dialog. Margins and paper size are controlled there; choose
        “Fit to page” if your printer cannot reproduce the full PDF page.
      </div>
    </Modal>
  );
}
