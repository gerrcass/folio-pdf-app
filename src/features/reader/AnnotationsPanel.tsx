import { Highlighter, PenLine, Stamp, Trash2, Type, X } from 'lucide-react';
import type { Annotation } from '../../annotations/types';
import { highlightHex } from '../../annotations/types';

interface AnnotationsPanelProps {
  annotations: Annotation[];
  selectedId: string | null;
  onSelect: (annotation: Annotation) => void;
  onDelete: (annotation: Annotation) => void;
  onClose: () => void;
}

function iconFor(annotation: Annotation) {
  if (annotation.kind === 'highlight') return <Highlighter size={12} />;
  if (annotation.kind === 'ink') return <PenLine size={12} />;
  if (annotation.kind === 'text') return <Type size={12} />;
  return <Stamp size={12} />;
}

function labelFor(annotation: Annotation): string {
  if (annotation.kind === 'highlight') return 'Highlight';
  if (annotation.kind === 'ink') return 'Ink';
  if (annotation.kind === 'text') return annotation.text.slice(0, 80) || 'Text note';
  return annotation.label ? `Signature · ${annotation.label}` : 'Signature stamp';
}

function snippetFor(annotation: Annotation): string {
  if (annotation.kind === 'ink') return `${annotation.strokes.reduce((sum, stroke) => sum + stroke.length, 0)} points`;
  if (annotation.kind === 'highlight') return `${annotation.quads.length} selected ${annotation.quads.length === 1 ? 'line' : 'lines'}`;
  if (annotation.kind === 'text') return 'Text note';
  return 'Visual signature — not a certificate';
}

export function AnnotationsPanel({
  annotations,
  selectedId,
  onSelect,
  onDelete,
  onClose,
}: AnnotationsPanelProps) {
  const grouped = new Map<number, Annotation[]>();
  for (const annotation of annotations) {
    const group = grouped.get(annotation.pageIndex);
    if (group) group.push(annotation);
    else grouped.set(annotation.pageIndex, [annotation]);
  }
  const pages = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <aside className="side-panel" aria-label="Annotations">
      <div className="panel-head">
        <span className="panel-title">Annotations</span>
        <span className="sidebar-count">{annotations.length}</span>
        <button
          className="icon-button small"
          onClick={onClose}
          aria-label="Close annotations"
          data-tooltip="Close annotations"
          type="button"
        >
          <X size={14} />
        </button>
      </div>
      <div className="panel-body">
        {annotations.length === 0 ? (
          <div className="panel-empty">
            <h4>Nothing marked yet</h4>
            Select text with the highlighter, draw with the pen, or place a note. Your annotations stay local to this
            document and are saved as you work.
          </div>
        ) : (
          <div className="annotation-list">
            {pages.map((pageIndex) => (
              <div key={pageIndex}>
                <div className="annotation-page-label">Page {pageIndex + 1}</div>
                {grouped.get(pageIndex)?.map((annotation) => (
                  <div
                    key={annotation.id}
                    className={`annotation-row ${selectedId === annotation.id ? 'active' : ''}`}
                  >
                    <button
                      className="annotation-open"
                      type="button"
                      onClick={() => onSelect(annotation)}
                      aria-current={selectedId === annotation.id ? 'true' : undefined}
                    >
                      <span
                        className="annotation-kind"
                        style={
                          annotation.kind === 'highlight'
                            ? { color: highlightHex(annotation.color) }
                            : annotation.kind === 'ink' || annotation.kind === 'text'
                              ? { color: annotation.color }
                              : undefined
                        }
                      >
                        {iconFor(annotation)}
                      </span>
                      <span className="annotation-copy">
                        <span className="annotation-label" title={labelFor(annotation)}>
                          {labelFor(annotation)}
                        </span>
                        <span className="annotation-snippet">{snippetFor(annotation)}</span>
                      </span>
                    </button>
                    <button
                      className="annotation-delete"
                      type="button"
                      aria-label="Delete annotation"
                      data-tooltip="Delete annotation"
                      onClick={() => onDelete(annotation)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
