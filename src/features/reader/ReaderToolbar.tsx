import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  Focus,
  Highlighter,
  MoreHorizontal,
  MousePointer2,
  PanelLeft,
  PenLine,
  Printer,
  Redo2,
  RotateCw,
  Search,
  Stamp,
  StickyNote,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { HighlightColor } from '../../annotations/types';
import { HIGHLIGHT_COLORS, INK_COLORS, TEXT_COLORS } from '../../annotations/types';
import type { ReaderTool } from './types';
import type { SpreadMode, ZoomMode } from '../../storage';

type PopoverId = 'highlight' | 'ink' | 'text' | 'zoom' | 'more' | null;

interface ReaderToolbarProps {
  tool: ReaderTool;
  onToolChange: (tool: ReaderTool) => void;
  highlightColor: HighlightColor;
  onHighlightColorChange: (color: HighlightColor) => void;
  inkColor: string;
  onInkColorChange: (color: string) => void;
  inkThickness: number;
  onInkThicknessChange: (thickness: number) => void;
  textColor: string;
  onTextColorChange: (color: string) => void;
  textFontSize: number;
  onTextFontSizeChange: (size: number) => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  page: number;
  pageCount: number;
  onGoToPage: (pageIndex: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  scale: number;
  zoomMode: ZoomMode;
  onSetZoom: (mode: ZoomMode, value: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  rotation: number;
  onRotate: () => void;
  spreadMode: SpreadMode;
  onToggleSpread: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  rightPanel: 'search' | 'annotations' | null;
  onToggleSearch: () => void;
  onToggleAnnotations: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSignature: () => void;
  onExport: () => void;
  exporting: boolean;
  onPrint: () => void;
  onInfo: () => void;
  onOpenFile: () => void;
  onAbout: () => void;
  readOnly?: boolean;
}

function usePopover(onClose: () => void, open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}

function Popover({
  open,
  children,
  align = 'left',
  className = '',
}: {
  open: boolean;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  if (!open) return null;
  return (
    <div
      className={`popover ${className}`}
      style={align === 'right' ? { right: 0, left: 'auto' } : undefined}
      role="group"
    >
      {children}
    </div>
  );
}

function ToolButton({
  active,
  label,
  shortcut,
  onClick,
  children,
  expanded,
  dot,
  disabled,
}: {
  active?: boolean;
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
  expanded?: boolean;
  dot?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button has-color ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      aria-expanded={expanded}
      disabled={disabled}
      data-tooltip={shortcut ? `${label}  ${shortcut}` : label}
      type="button"
    >
      {children}
      {dot ? <span className="tool-dot" style={{ background: dot }} aria-hidden="true" /> : null}
    </button>
  );
}

function Swatches({
  colors,
  value,
  onChange,
  labels,
}: {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
  labels?: readonly string[];
}) {
  return (
    <div className="swatch-row">
      {colors.map((color, index) => (
        <button
          key={color}
          className={`swatch ${color === value ? 'active' : ''}`}
          style={{ background: color }}
          onClick={() => onChange(color)}
          aria-label={labels?.[index] ?? color}
          aria-pressed={color === value}
          type="button"
        />
      ))}
    </div>
  );
}

export function ReaderToolbar({
  tool,
  onToolChange,
  highlightColor,
  onHighlightColorChange,
  inkColor,
  onInkColorChange,
  inkThickness,
  onInkThicknessChange,
  textColor,
  onTextColorChange,
  textFontSize,
  onTextFontSizeChange,
  sidebarVisible,
  onToggleSidebar,
  page,
  pageCount,
  onGoToPage,
  onPreviousPage,
  onNextPage,
  scale,
  zoomMode,
  onSetZoom,
  onZoomIn,
  onZoomOut,
  rotation,
  onRotate,
  spreadMode,
  onToggleSpread,
  focusMode,
  onToggleFocus,
  rightPanel,
  onToggleSearch,
  onToggleAnnotations,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenSignature,
  onExport,
  exporting,
  onPrint,
  onInfo,
  onOpenFile,
  onAbout,
  readOnly = false,
}: ReaderToolbarProps) {
  const [popover, setPopover] = useState<PopoverId>(null);
  const [pageField, setPageField] = useState(String(page + 1));
  const pageInputRef = useRef<HTMLInputElement>(null);
  const closePopover = () => setPopover(null);
  const highlightRef = usePopover(closePopover, popover === 'highlight');
  const inkRef = usePopover(closePopover, popover === 'ink');
  const textRef = usePopover(closePopover, popover === 'text');
  const zoomRef = usePopover(closePopover, popover === 'zoom');
  const moreRef = usePopover(closePopover, popover === 'more');
  const highlightHex = HIGHLIGHT_COLORS.find((entry) => entry.id === highlightColor)?.hex;

  useEffect(() => {
    if (document.activeElement !== pageInputRef.current) setPageField(String(page + 1));
  }, [page]);

  useEffect(() => {
    setPopover(null);
  }, [page, rightPanel]);

  const commitPage = () => {
    const value = Number(pageField);
    if (Number.isFinite(value)) {
      const index = Math.max(0, Math.min(pageCount - 1, Math.round(value) - 1));
      onGoToPage(index);
      setPageField(String(index + 1));
    } else {
      setPageField(String(page + 1));
    }
  };

  const zoomOptions: Array<{ label: string; mode: ZoomMode; value: number }> = [
    { label: 'Fit width', mode: 'fit-width', value: 1 },
    { label: 'Fit page', mode: 'fit-page', value: 1 },
    { label: '50%', mode: 'custom', value: 0.5 },
    { label: '75%', mode: 'custom', value: 0.75 },
    { label: '100%', mode: 'custom', value: 1 },
    { label: '125%', mode: 'custom', value: 1.25 },
    { label: '150%', mode: 'custom', value: 1.5 },
    { label: '200%', mode: 'custom', value: 2 },
  ];

  const activateTool = (next: ReaderTool, popoverId: PopoverId) => {
    onToolChange(next);
    setPopover((current) => (current === popoverId ? null : popoverId));
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Document controls">
      <div className="toolbar-group">
        <button
          className={`icon-button ${sidebarVisible ? 'active' : ''}`}
          onClick={onToggleSidebar}
          aria-label={sidebarVisible ? 'Hide thumbnails' : 'Show thumbnails'}
          aria-pressed={sidebarVisible}
          data-tooltip={sidebarVisible ? 'Hide thumbnails' : 'Show thumbnails'}
          data-shortcut=""
          type="button"
        >
          <PanelLeft size={15} />
        </button>
        <div className="toolbar-divider" />
        <div className="page-control">
          <button
            className="icon-button small"
            onClick={onPreviousPage}
            disabled={page <= 0}
            aria-label="Previous page"
            data-tooltip="Previous page"
            type="button"
          >
            <ChevronLeft size={15} />
          </button>
          <input
            ref={pageInputRef}
            className="page-input"
            value={pageField}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setPageField(event.target.value.replace(/[^\d]/g, ''))}
            onBlur={commitPage}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitPage();
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setPageField(String(page + 1));
                event.currentTarget.blur();
              }
            }}
            aria-label="Current page"
            inputMode="numeric"
          />
          <span className="page-total">/ {pageCount}</span>
          <button
            className="icon-button small"
            onClick={onNextPage}
            disabled={page >= pageCount - 1}
            aria-label="Next page"
            data-tooltip="Next page"
            type="button"
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="toolbar-divider" />
        <div className="zoom-control">
          <button
            className="icon-button small"
            onClick={onZoomOut}
            aria-label="Zoom out"
            data-tooltip="Zoom out"
            type="button"
          >
            <ZoomOut size={14} />
          </button>
          <div style={{ position: 'relative' }} ref={zoomRef}>
            <button
              className="zoom-value"
              onClick={() => setPopover(popover === 'zoom' ? null : 'zoom')}
              aria-label={`Zoom ${Math.round(scale * 100)} percent`}
              aria-expanded={popover === 'zoom'}
              data-tooltip="Zoom"
              type="button"
            >
              {Math.round(scale * 100)}%
            </button>
            <Popover open={popover === 'zoom'} align="left">
              <div className="menu">
                {zoomOptions.map((option) => (
                  <button
                    key={option.label}
                    className="menu-item"
                    onClick={() => {
                      onSetZoom(option.mode, option.value);
                      setPopover(null);
                    }}
                    type="button"
                  >
                    <span style={{ width: 16 }}>
                      {(option.mode === 'custom' && zoomMode === 'custom' && Math.abs(scale - option.value) < 0.005) ||
                      (option.mode !== 'custom' && zoomMode === option.mode)
                        ? '•'
                        : ''}
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>
            </Popover>
          </div>
          <button
            className="icon-button small"
            onClick={onZoomIn}
            aria-label="Zoom in"
            data-tooltip="Zoom in"
            type="button"
          >
            <ZoomIn size={14} />
          </button>
        </div>
        <button
          className="icon-button"
          onClick={onRotate}
          aria-label={`Rotate view 90 degrees (currently ${rotation} degrees)`}
          data-tooltip="Rotate view"
          type="button"
        >
          <RotateCw size={15} />
        </button>
        <button
          className={`icon-button ${spreadMode === 'double' ? 'active' : ''}`}
          onClick={onToggleSpread}
          aria-label={spreadMode === 'double' ? 'Use single page' : 'Use two-page spread'}
          aria-pressed={spreadMode === 'double'}
          data-tooltip={spreadMode === 'double' ? 'Single page' : 'Two-page spread'}
          type="button"
        >
          <Columns2 size={15} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <ToolButton
          active={tool === 'select'}
          label="Select annotations"
          onClick={() => {
            onToolChange('select');
            setPopover(null);
          }}
        >
          <MousePointer2 size={15} />
        </ToolButton>
        <div style={{ position: 'relative' }} ref={highlightRef}>
          <ToolButton
            active={tool === 'highlight'}
            label="Highlight text"
            expanded={popover === 'highlight'}
            onClick={() => activateTool('highlight', 'highlight')}
            dot={highlightHex}
            disabled={readOnly}
          >
            <Highlighter size={15} />
          </ToolButton>
          <Popover open={popover === 'highlight'}>
            <div className="popover-label">Highlight color</div>
            <div className="swatch-row">
              {HIGHLIGHT_COLORS.map((entry) => (
                <button
                  key={entry.id}
                  className={`swatch ${highlightColor === entry.id ? 'active' : ''}`}
                  style={{ background: entry.hex }}
                  onClick={() => {
                    onHighlightColorChange(entry.id);
                    onToolChange('highlight');
                  }}
                  aria-label={`${entry.label} highlight`}
                  aria-pressed={highlightColor === entry.id}
                  type="button"
                />
              ))}
            </div>
            <div className="hint" style={{ padding: '8px 5px 2px' }}>
              Select text on a page to mark it.
            </div>
          </Popover>
        </div>
        <div style={{ position: 'relative' }} ref={inkRef}>
          <ToolButton
            active={tool === 'ink'}
            label="Draw ink"
            expanded={popover === 'ink'}
            onClick={() => activateTool('ink', 'ink')}
            dot={inkColor}
            disabled={readOnly}
          >
            <PenLine size={15} />
          </ToolButton>
          <Popover open={popover === 'ink'}>
            <div className="popover-label">Ink color</div>
            <Swatches colors={INK_COLORS} value={inkColor} onChange={onInkColorChange} />
            <div className="popover-label" style={{ paddingTop: 10 }}>
              Thickness
            </div>
            <div className="range-row">
              <input
                type="range"
                min={0.75}
                max={6}
                step={0.25}
                value={inkThickness}
                onChange={(event) => onInkThicknessChange(Number(event.target.value))}
                aria-label="Ink thickness"
              />
              <span className="range-value">{inkThickness.toFixed(2)} pt</span>
            </div>
          </Popover>
        </div>
        <div style={{ position: 'relative' }} ref={textRef}>
          <ToolButton
            active={tool === 'text'}
            label="Add a text note"
            expanded={popover === 'text'}
            onClick={() => activateTool('text', 'text')}
            dot={textColor}
            disabled={readOnly}
          >
            <Type size={15} />
          </ToolButton>
          <Popover open={popover === 'text'}>
            <div className="popover-label">Text color</div>
            <Swatches colors={TEXT_COLORS} value={textColor} onChange={onTextColorChange} />
            <div className="popover-label" style={{ paddingTop: 10 }}>
              Size
            </div>
            <div className="range-row">
              <input
                type="range"
                min={9}
                max={24}
                step={1}
                value={textFontSize}
                onChange={(event) => onTextFontSizeChange(Number(event.target.value))}
                aria-label="Text note size"
              />
              <span className="range-value">{textFontSize} pt</span>
            </div>
          </Popover>
        </div>
        <button
          className="icon-button"
          onClick={() => {
            setPopover(null);
            onOpenSignature();
          }}
          disabled={readOnly}
          aria-label="Add a signature"
          data-tooltip="Add signature"
          type="button"
        >
          <Stamp size={15} />
        </button>
        <div className="toolbar-divider" />
        <button
          className="icon-button"
          onClick={onUndo}
          disabled={!canUndo || readOnly}
          aria-label="Undo annotation change"
          data-tooltip="Undo"
          type="button"
        >
          <Undo2 size={14} />
        </button>
        <button
          className="icon-button"
          onClick={onRedo}
          disabled={!canRedo || readOnly}
          aria-label="Redo annotation change"
          data-tooltip="Redo"
          type="button"
        >
          <Redo2 size={14} />
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button
          className={`icon-button ${rightPanel === 'search' ? 'active' : ''}`}
          onClick={onToggleSearch}
          aria-label="Search document"
          aria-pressed={rightPanel === 'search'}
          data-tooltip="Search  Ctrl F"
          type="button"
        >
          <Search size={15} />
        </button>
        <button
          className={`icon-button ${rightPanel === 'annotations' ? 'active' : ''}`}
          onClick={onToggleAnnotations}
          aria-label="Show annotations"
          aria-pressed={rightPanel === 'annotations'}
          data-tooltip="Annotations"
          type="button"
        >
          <StickyNote size={15} />
        </button>
        <div className="toolbar-divider" />
        <button
          className="button sm"
          onClick={onExport}
          disabled={exporting}
          data-tooltip="Export annotated PDF  Ctrl S"
          type="button"
        >
          {exporting ? <span className="spinner" /> : <Download size={14} />}
          Export
        </button>
        <div style={{ position: 'relative' }} ref={moreRef}>
          <button
            className={`icon-button ${popover === 'more' ? 'active' : ''}`}
            onClick={() => setPopover(popover === 'more' ? null : 'more')}
            aria-label="More document actions"
            aria-expanded={popover === 'more'}
            data-tooltip="More actions"
            type="button"
          >
            <MoreHorizontal size={16} />
          </button>
          <Popover open={popover === 'more'} align="right">
            <div className="menu">
              <button
                className="menu-item"
                type="button"
                onClick={() => {
                  setPopover(null);
                  onPrint();
                }}
              >
                <Printer size={14} />
                Print
                <span className="shortcut" aria-hidden="true">Ctrl P</span>
              </button>
              <button
                className="menu-item"
                type="button"
                onClick={() => {
                  setPopover(null);
                  onInfo();
                }}
              >
                <StickyNote size={14} />
                Document information
              </button>
              <button
                className="menu-item"
                type="button"
                onClick={() => {
                  setPopover(null);
                  onOpenFile();
                }}
              >
                <Download size={14} style={{ transform: 'rotate(180deg)' }} />
                Open another PDF
                <span className="shortcut" aria-hidden="true">Ctrl O</span>
              </button>
              <div className="menu-separator" />
              <button
                className="menu-item"
                type="button"
                onClick={() => {
                  setPopover(null);
                  onToggleFocus();
                }}
              >
                <Focus size={14} />
                {focusMode ? 'Leave focus mode' : 'Focus reading'}
              </button>
              <button
                className="menu-item"
                type="button"
                onClick={() => {
                  setPopover(null);
                  onAbout();
                }}
              >
                <MoreHorizontal size={14} />
                About Folio
              </button>
            </div>
          </Popover>
        </div>
      </div>
    </div>
  );
}
