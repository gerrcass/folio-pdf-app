import { PanelLeftClose } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PdfDocumentSession } from '../../pdf/document';
import { renderThumbnail } from '../../pdf/render';

const cache = new Map<string, string>();
let activeRenders = 0;
const waiting: Array<() => void> = [];

async function withThumbSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeRenders >= 2) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  activeRenders += 1;
  try {
    return await task();
  } finally {
    activeRenders -= 1;
    waiting.shift()?.();
  }
}

interface ThumbnailProps {
  session: PdfDocumentSession;
  pageIndex: number;
  current: boolean;
  onSelect: (pageIndex: number) => void;
}

function PageThumb({ session, pageIndex, current, onSelect }: ThumbnailProps) {
  const key = `${session.fingerprint}:${pageIndex}`;
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true);
      },
      { root: element.closest('.sidebar-scroll'), rootMargin: '300px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || src) return;
    let cancelled = false;
    void withThumbSlot(async () => {
      const page = await session.getPage(pageIndex);
      return renderThumbnail(page, 220);
    })
      .then((dataUrl) => {
        if (cancelled) return;
        cache.set(key, dataUrl);
        setSrc(dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, src, key, pageIndex, session]);

  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <button
      ref={ref}
      className={`thumb-button ${current ? 'active' : ''}`}
      onClick={() => onSelect(pageIndex)}
      aria-label={`Go to page ${pageIndex + 1}`}
      aria-current={current ? 'page' : undefined}
      type="button"
    >
      <span className="thumb-frame">
        {src ? <img src={src} alt="" loading="lazy" /> : <span className="thumb-skeleton" />}
        <span className="thumb-number">{pageIndex + 1}</span>
      </span>
    </button>
  );
}

interface ThumbnailSidebarProps {
  session: PdfDocumentSession;
  currentPage: number;
  nightMode: boolean;
  onSelect: (pageIndex: number) => void;
  onClose: () => void;
}

export function ThumbnailSidebar({
  session,
  currentPage,
  nightMode,
  onSelect,
  onClose,
}: ThumbnailSidebarProps) {
  return (
    <aside className={`thumb-sidebar ${nightMode ? 'night' : ''}`} aria-label="Page thumbnails">
      <div className="sidebar-head">
        <span className="sidebar-title">Pages</span>
        <span className="sidebar-count">{session.pageCount}</span>
        <button
          className="icon-button small"
          style={{ marginLeft: 'auto' }}
          onClick={onClose}
          aria-label="Hide thumbnails"
          data-tooltip="Hide thumbnails"
          data-tooltip-position="bottom"
          type="button"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
      <div className="sidebar-scroll">
        <div className="thumb-list">
          {Array.from({ length: session.pageCount }, (_, index) => (
            <PageThumb
              key={index}
              session={session}
              pageIndex={index}
              current={index === currentPage}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
