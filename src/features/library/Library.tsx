import {
  ArrowUpRight,
  BookOpen,
  Clock3,
  FileText,
  FolderOpen,
  Globe2,
  HardDrive,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import type { AppInfo } from '../../platform';
import { openExternal } from '../../platform';
import { formatBytes, formatDate } from '../../lib/utils';
import type { ReadingSession, RecentDocument } from '../../storage';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface LibraryProps {
  documents: RecentDocument[];
  session: ReadingSession | null;
  info: AppInfo;
  busy: boolean;
  onOpen: () => void;
  onOpenRecent: (document: RecentDocument) => void;
  onResume: (document: RecentDocument) => void;
  onRemove: (document: RecentDocument) => Promise<void>;
}

const REPOSITORY = 'https://github.com/gerrcass/folio-pdf-app';
const LIVE_APP = 'https://gerrcass.github.io/folio-pdf-app/';

export function Library({
  documents,
  session,
  info,
  busy,
  onOpen,
  onOpenRecent,
  onResume,
  onRemove,
}: LibraryProps) {
  const [removeTarget, setRemoveTarget] = useState<RecentDocument | null>(null);
  const lastDocument = session ? documents.find((document) => document.id === session.documentId) : undefined;
  const progress = lastDocument && session ? Math.min(100, ((session.page + 1) / lastDocument.pageCount) * 100) : 0;

  return (
    <div className="library">
      <div className="library-inner">
        <header className="library-header">
          <div>
            <div className="library-eyebrow">Local-first reading</div>
            <h1 className="library-title">
              Read with less <em>friction.</em>
            </h1>
            <p className="library-lede">
              Open a PDF, find the line, mark it, sign it. Folio keeps the reading and the annotations on this
              device, and stays out of the way while you work.
            </p>
          </div>
          <div className="library-actions">
            <button className="library-open" type="button" onClick={onOpen} disabled={busy}>
              <FolderOpen size={16} />
              Open PDF
            </button>
          </div>
        </header>

        <section className="library-drop" aria-label="Open a PDF">
          <div className="library-drop-icon" aria-hidden="true">
            <Upload size={21} />
          </div>
          <div className="library-drop-copy">
            <h2 className="library-drop-title">Drop a PDF anywhere</h2>
            <p className="library-drop-sub">
              It stays in your local library. No upload, no account, no document leaves this device.
            </p>
          </div>
          <div className="library-drop-shortcut">
            or press <kbd>Ctrl</kbd> <kbd>O</kbd>
          </div>
        </section>

        {lastDocument && session ? (
          <section className="resume-strip" aria-label="Continue reading">
            {lastDocument.thumbnail ? (
              <img className="resume-thumb" src={lastDocument.thumbnail} alt="" />
            ) : (
              <div className="resume-thumb" style={{ display: 'grid', placeItems: 'center' }}>
                <FileText size={16} style={{ color: 'var(--ink-3)' }} />
              </div>
            )}
            <div className="resume-copy">
              <div className="resume-label">Continue reading</div>
              <div className="resume-title">{lastDocument.title || lastDocument.name}</div>
              <div className="resume-sub">
                Page {session.page + 1} of {lastDocument.pageCount}
                {lastDocument.thumbnail ? ` · ${Math.round(progress)}% through` : ''}
              </div>
            </div>
            <button className="button sm primary" type="button" onClick={() => onResume(lastDocument)}>
              <BookOpen size={13} />
              Resume
            </button>
          </section>
        ) : null}

        <div className="section-head">
          <h2 className="section-title">Recent documents</h2>
          <span className="section-count">{documents.length}</span>
          <span className="section-note">
            <HardDrive size={11} />
            Stored on this device
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="library-empty">
            <div className="empty-icon">
              <BookOpen size={24} />
            </div>
            <h3>Your reading room is empty</h3>
            <p>
              Open a PDF to begin. Recent documents and annotations are cached locally, so reopening is immediate
              and your place in the document is remembered.
            </p>
            <button className="button" type="button" onClick={onOpen}>
              <FolderOpen size={14} />
              Choose a PDF
            </button>
          </div>
        ) : (
          <div className="recent-grid">
            {documents.map((document) => {
              const isCurrent = session?.documentId === document.id;
              const docProgress = isCurrent && document.pageCount > 0 ? ((session.page + 1) / document.pageCount) * 100 : 0;
              return (
                <article className="recent-card" key={document.id}>
                  <button
                    className="recent-thumb"
                    onClick={() => onOpenRecent(document)}
                    aria-label={`Open ${document.title || document.name}`}
                    type="button"
                    style={{ padding: 0, display: 'block' }}
                  >
                    {document.thumbnail ? (
                      <img src={document.thumbnail} alt="" loading="lazy" />
                    ) : (
                      <span className="thumb-fallback">
                        <FileText size={21} />
                        PDF
                      </span>
                    )}
                    {isCurrent && docProgress > 0 ? (
                      <span className="recent-progress" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, docProgress)}%` }} />
                      </span>
                    ) : null}
                  </button>
                  <button
                    className="recent-remove"
                    aria-label={`Remove ${document.title || document.name} from library`}
                    onClick={() => setRemoveTarget(document)}
                    type="button"
                  >
                    <Trash2 size={12} />
                  </button>
                  <button
                    className="recent-meta"
                    onClick={() => onOpenRecent(document)}
                    type="button"
                    style={{ textAlign: 'left', padding: 0 }}
                  >
                    <h3 className="recent-title" title={document.title || document.name}>
                      {document.title || document.name}
                    </h3>
                    <div className="recent-sub">
                      <Clock3 size={10} />
                      {formatDate(document.lastOpened)}
                      <span className="dot" />
                      {document.pageCount} {document.pageCount === 1 ? 'page' : 'pages'}
                      <span className="dot" />
                      {formatBytes(document.size)}
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <footer className="library-footer">
          <span>Folio {info.version}</span>
          <span>·</span>
          <span style={{ textTransform: 'capitalize' }}>{info.edition} edition</span>
          <span className="privacy-pill">
            <ShieldCheck size={11} />
            Local only
          </span>
          <span className="grow" />
          <button className="footer-link" type="button" onClick={() => void openExternal(LIVE_APP)}>
            <Globe2 size={11} />
            Browser edition
          </button>
          <button className="footer-link" type="button" onClick={() => void openExternal(REPOSITORY)}>
            <ArrowUpRight size={11} />
            Source
          </button>
        </footer>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove from library?"
        message={
          removeTarget
            ? `“${removeTarget.title || removeTarget.name}” and its cached annotations will be removed from this device. Your original PDF file will not be deleted.`
            : ''
        }
        confirmLabel="Remove from library"
        danger
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          const target = removeTarget;
          setRemoveTarget(null);
          void onRemove(target);
        }}
      />
    </div>
  );
}
