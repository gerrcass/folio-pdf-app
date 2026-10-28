import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  FolderOpen,
  Globe2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  isDesktop,
  onUpdateState,
  openExternal,
  showInstallFolder,
  type AppInfo,
  type UpdateState,
} from '../platform';
import { Modal } from './Modal';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  info: AppInfo;
  dirty: boolean;
}

const REPOSITORY = 'https://github.com/gerrcass/folio-pdf-app';
const LIVE_APP = 'https://gerrcass.github.io/folio-pdf-app/';

function editionCopy(info: AppInfo): string {
  switch (info.edition) {
    case 'browser':
      return 'Browser Edition. Same reader core, with no operating-system integration, native window controls, or self-update.';
    case 'portable':
      return 'Portable Edition. It cannot self-update; replace the portable files to move to a new version.';
    case 'development':
      return 'Development Edition. Self-update is disabled while running from source.';
    default:
      return 'Installed Edition. Update checks are available only when a distributor has configured an update feed.';
  }
}

function phaseLabel(state: UpdateState): string {
  switch (state.phase) {
    case 'checking':
      return 'Checking';
    case 'available':
      return 'Available';
    case 'downloading':
      return 'Downloading';
    case 'ready':
      return 'Ready';
    case 'up-to-date':
      return 'Up to date';
    case 'error':
      return 'Needs attention';
    case 'disabled':
      return 'Updates off';
    default:
      return 'Idle';
  }
}

export function AboutDialog({ open, onClose, info, dirty }: AboutDialogProps) {
  const [update, setUpdate] = useState<UpdateState>({
    phase: 'disabled',
    supported: false,
    feedConfigured: false,
    message: 'Updates are not available.',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void getUpdateState().then((state) => {
      if (active) setUpdate(state);
    });
    const unsubscribe = onUpdateState((state) => {
      if (active) setUpdate(state);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [open]);

  const run = async (
    action: () => Promise<UpdateState>,
    label: string,
    onResult?: (state: UpdateState) => void,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const state = await action();
      setUpdate(state);
      onResult?.(state);
      if (state.phase === 'error') setError(state.message ?? `${label} failed.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${label} failed.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="About Folio"
      subtitle="A calm, local-first PDF reader."
      className="wide"
      footer={
        <>
          <button
            className="button ghost"
            type="button"
            onClick={() => void openExternal(REPOSITORY)}
          >
            <ArrowUpRight size={14} />
            Source
          </button>
          <button className="button" type="button" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="about-hero">
        <div className="about-mark" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 64 64">
            <rect x="2" y="2" width="60" height="60" rx="14" fill="#f6f2ea" />
            <rect x="17" y="12" width="29" height="41" rx="3" fill="#d7cfc1" />
            <rect x="22" y="10" width="29" height="41" rx="3" fill="#fffdf8" />
            <rect x="22" y="10" width="6" height="41" rx="3" fill="#b55330" />
            <rect x="33" y="23" width="13" height="2.2" rx="1.1" fill="#6f675d" />
            <rect x="33" y="30" width="13" height="2.2" rx="1.1" fill="#91887b" />
            <rect x="33" y="37" width="9" height="2.2" rx="1.1" fill="#91887b" />
          </svg>
        </div>
        <div>
          <h3 className="about-name">Folio</h3>
          <div className="about-version">
            Version {info.version} · {info.edition === 'browser' ? 'Browser Edition' : info.edition === 'portable' ? 'Portable Edition' : info.edition === 'development' ? 'Development Edition' : 'Installed Edition'}
          </div>
        </div>
        <button
          className="button sm"
          style={{ marginLeft: 'auto' }}
          type="button"
          onClick={() => void openExternal(LIVE_APP)}
        >
          <Globe2 size={14} />
          Browser edition
        </button>
      </div>

      <p className="hint" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
        {editionCopy(info)}
      </p>

      <dl className="about-grid">
        <dt>Edition</dt>
        <dd style={{ textTransform: 'capitalize' }}>{info.edition}</dd>
        <dt>Installation</dt>
        <dd>{info.installPath}</dd>
        <dt>Platform</dt>
        <dd>{info.platform}</dd>
        <dt>Update feed</dt>
        <dd>{info.updateFeedConfigured ? info.updateFeedHost ?? 'Configured' : 'Not configured'}</dd>
      </dl>

      <div className="update-box">
        <div className="update-head">
          <RefreshCw size={14} />
          Updates
          <span className="badge">{phaseLabel(update)}</span>
        </div>
        <div className="update-message" aria-live="polite">
          {update.message ?? (info.updatesSupported ? 'Check for a new version when you are ready.' : 'This edition does not self-update.')}
        </div>
        {update.phase === 'downloading' ? (
          <div className="progress" aria-label={`Downloading update: ${update.percent ?? 0}%`}>
            <span style={{ width: `${update.percent ?? 0}%` }} />
          </div>
        ) : null}
        {error ? <div className="hint warning-text">{error}</div> : null}
        {dirty && update.phase === 'ready' ? (
          <div className="hint warning-text">
            Folio is still saving annotations. Wait a moment, then restart.
          </div>
        ) : null}
        <div className="update-actions">
          {info.updatesSupported ? (
            <>
              <button
                className="button sm"
                type="button"
                disabled={busy || update.phase === 'checking' || update.phase === 'downloading'}
                onClick={() => void run(checkForUpdates, 'Update check')}
              >
                {update.phase === 'checking' ? <span className="spinner" /> : <RefreshCw size={13} />}
                Check for updates
              </button>
              {update.phase === 'available' ? (
                <button
                  className="button sm primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void run(downloadUpdate, 'Download')}
                >
                  <Download size={13} />
                  Download {update.version ?? 'update'}
                </button>
              ) : null}
              {update.phase === 'ready' ? (
                <button
                  className="button sm primary"
                  type="button"
                  disabled={busy || dirty}
                  onClick={() => {
                    setBusy(true);
                    setError(null);
                    void installUpdate()
                      .then((started) => {
                        if (!started) setError('The update could not start. Try checking again.');
                      })
                      .catch((caught: unknown) => {
                        setError(caught instanceof Error ? caught.message : 'The update could not start.');
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  <CheckCircle2 size={13} />
                  Restart to install
                </button>
              ) : null}
            </>
          ) : null}
          {isDesktop && info.isPackaged ? (
            <button
              className="button sm"
              type="button"
              onClick={() => void showInstallFolder()}
            >
              <FolderOpen size={13} />
              Open installation folder
            </button>
          ) : null}
        </div>
        {info.edition === 'installed' ? (
          <div className="hint">
            Windows may still show a SmartScreen or elevation prompt when installing an update. That prompt comes
            from Windows, not a Folio failure.
          </div>
        ) : null}
      </div>

      <div className="notice info signature-warning">
        <ShieldCheck size={16} style={{ flex: '0 0 auto', marginTop: 1 }} />
        <div>
          <strong>Visual signatures are not digital certificates.</strong> Folio places the signature image you
          approve as a PDF stamp. It does not verify identity, create a cryptographic signature, or guarantee that a
          later edit is detectable.
        </div>
      </div>

      <div className="notice signature-warning">
        <TriangleAlert size={16} style={{ flex: '0 0 auto', marginTop: 1 }} />
        <div>
          PDFs and signature images are processed on this device. Recent documents and reusable signatures are stored
          locally and are not uploaded. Remembered signatures are not encrypted at rest.
        </div>
      </div>
    </Modal>
  );
}
