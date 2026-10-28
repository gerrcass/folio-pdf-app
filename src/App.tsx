import { Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AboutDialog } from './components/AboutDialog';
import { BrandMark } from './components/BrandMark';
import { OpeningOverlay } from './components/OpeningOverlay';
import { PasswordDialog } from './components/PasswordDialog';
import { TitleBar } from './components/TitleBar';
import { useToast } from './components/Toast';
import { Library } from './features/library/Library';
import { Reader, type ReaderHandle } from './features/reader/Reader';
import type { OpenedDocument } from './features/reader/types';
import { fingerprintBytes } from './pdf/fingerprint';
import { PdfDocumentSession, PdfOpenError, type PasswordReason } from './pdf/document';
import { renderThumbnail } from './pdf/render';
import {
  choosePdf,
  closeReady,
  consumeLaunchFile,
  getAppInfo,
  onBeforeClose,
  onOpenError,
  onOpenFile,
  payloadFromFile,
  type AppInfo,
  type OpenFilePayload,
} from './platform';
import {
  getRecentDocument,
  listRecentDocuments,
  loadAnnotations,
  loadDocumentBytes,
  loadPreferences,
  loadSession,
  markSessionNotRestorable,
  removeRecentDocument,
  saveNightMode,
  saveRecentDocument,
  saveSession,
  saveTheme,
  saveThumbnail,
  type Preferences,
  type ReadingSession,
  type RecentDocument,
  type Theme,
} from './storage';

type View = 'boot' | 'library' | 'reader';

interface OpeningState {
  name: string;
  stage: string;
  progress?: number;
  cancel: () => void;
}

function fallbackInfo(): AppInfo {
  return {
    name: 'Folio',
    version: __FOLIO_BUILD__.version,
    edition: 'browser',
    platform: navigator.platform || 'web',
    installPath: 'Browser Edition',
    isPackaged: false,
    updateFeedConfigured: false,
    updatesSupported: false,
  };
}

export function App() {
  const { notify } = useToast();
  const [view, setView] = useState<View>('boot');
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [documents, setDocuments] = useState<RecentDocument[]>([]);
  const [storedSession, setStoredSession] = useState<ReadingSession | null>(null);
  const [opened, setOpened] = useState<OpenedDocument | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [opening, setOpening] = useState<OpeningState | null>(null);
  const [picking, setPicking] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    reason: PasswordReason;
    documentName: string;
  } | null>(null);

  const readerRef = useRef<ReaderHandle | null>(null);
  const sessionRef = useRef<ReadingSession | null>(null);
  const sessionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openAbortRef = useRef<AbortController | null>(null);
  const openTokenRef = useRef(0);
  const passwordResolveRef = useRef<((password: string | null) => void) | null>(null);
  const openingNameRef = useRef('');
  const bootedRef = useRef(false);
  const bootRanRef = useRef(false);
  const queuedOpenRef = useRef<OpenFilePayload | null>(null);
  const explicitOpenRef = useRef(false);
  const viewRef = useRef<View>('boot');
  const openDocumentIdRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    saveTheme(preferences.theme);
    saveNightMode(preferences.nightMode);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = preferences.theme === 'light' ? '#f6f2ea' : '#141311';
  }, [preferences]);

  useEffect(() => {
    document.title =
      view === 'reader' && opened
        ? `${opened.recent.title || opened.recent.name} — Folio`
        : 'Folio — PDF reader and annotations';
  }, [opened, view]);

  const toggleTheme = useCallback(() => {
    setPreferences((current) => {
      const theme: Theme = current.theme === 'light' ? 'dark' : 'light';
      saveTheme(theme);
      return { ...current, theme };
    });
  }, []);

  const toggleNight = useCallback(() => {
    setPreferences((current) => {
      const nightMode = !current.nightMode;
      saveNightMode(nightMode);
      return { ...current, nightMode };
    });
  }, []);

  const resolvePassword = (password: string | null) => {
    const resolve = passwordResolveRef.current;
    passwordResolveRef.current = null;
    setPasswordPrompt(null);
    resolve?.(password);
  };

  const requestPassword = useCallback(
    (reason: PasswordReason) =>
      new Promise<string | null>((resolve) => {
          passwordResolveRef.current = resolve;
        setPasswordPrompt({ reason, documentName: openingNameRef.current });
      }),
    [],
  );

  const cancelOpening = useCallback(() => {
    openTokenRef.current += 1;
    openAbortRef.current?.abort();
    resolvePassword(null);
    setOpening(null);
    setPicking(false);
  }, []);

  const openDocument = useCallback(
    async (
      payload: OpenFilePayload,
      options: { explicit?: boolean; preferredSession?: ReadingSession | null } = {},
    ): Promise<boolean> => {
      const token = openTokenRef.current + 1;
      openTokenRef.current = token;
      openAbortRef.current?.abort();
      const controller = new AbortController();
      openAbortRef.current = controller;
      openingNameRef.current = payload.name;
      performance.mark('folio:open:start');
      if (options.explicit) explicitOpenRef.current = true;
      setOpening({ name: payload.name, stage: 'Identifying document…', cancel: cancelOpening });
      setFocusMode(false);
      const previousReader = readerRef.current;
      if (previousReader) {
        try {
          await previousReader.flush();
        } catch {
          notify('The current document could not be saved. Close the pending change or export before opening another PDF.', 'error');
          setOpening(null);
          setPicking(false);
          return false;
        }
      }
      let loadedSession: PdfDocumentSession | null = null;

      try {
        const fingerprint = await fingerprintBytes(payload.data);
        if (controller.signal.aborted) throw new PdfOpenError('cancelled', 'The open was cancelled.');
        const pdfSession = await PdfDocumentSession.load(payload.data, payload.name, fingerprint, {
          signal: controller.signal,
          isCancelled: () => controller.signal.aborted,
          onPassword: requestPassword,
          onProgress: (progress) => {
            if (token !== openTokenRef.current) return;
            setOpening((current) =>
              current
                ? {
                    ...current,
                    stage: 'Reading PDF…',
                    progress:
                      progress.total > 0 ? Math.min(1, progress.loaded / progress.total) : undefined,
                  }
                : current,
            );
          },
        });
        loadedSession = pdfSession;
        if (controller.signal.aborted) throw new PdfOpenError('cancelled', 'The open was cancelled.');
        setOpening((current) =>
          current ? { ...current, stage: 'Laying out pages…', progress: undefined } : current,
        );
        const metrics = await pdfSession.preparePages(
          (loaded, total) => {
            if (token !== openTokenRef.current) return;
            setOpening((current) =>
              current ? { ...current, stage: `Preparing pages ${loaded} / ${total}`, progress: loaded / total } : current,
            );
          },
          () => controller.signal.aborted,
        );
        if (controller.signal.aborted) throw new PdfOpenError('cancelled', 'The open was cancelled.');

        const existing = await getRecentDocument(fingerprint).catch(() => undefined);
        const remembered = sessionRef.current?.documentId === fingerprint ? sessionRef.current : null;
        const persisted = remembered ? null : await loadSession().catch(() => null);
        const initialSession =
          options.preferredSession ??
          remembered ??
          (persisted?.documentId === fingerprint ? persisted : null);
        const annotations = await loadAnnotations(fingerprint);
        const recent: RecentDocument = {
          id: fingerprint,
          name: payload.name,
          title: pdfSession.title,
          size: payload.size,
          pageCount: pdfSession.pageCount,
          createdAt: existing?.createdAt ?? Date.now(),
          lastOpened: Date.now(),
          thumbnail: existing?.thumbnail,
        };

        let snapshot: { documents: RecentDocument[]; evicted: RecentDocument[] } | null = null;
        try {
          snapshot = await saveRecentDocument(recent, payload.data, {
            protectedDocumentIds: [openDocumentIdRef.current].filter((id): id is string => Boolean(id)),
          });
        } catch (error) {
          notify(
            error instanceof Error
              ? `Opened, but the local library could not cache this PDF: ${error.message}`
              : 'Opened, but the local library could not cache this PDF.',
            'error',
          );
        }

        if (controller.signal.aborted || token !== openTokenRef.current) {
          await pdfSession.destroy();
          return false;
        }

        loadedSession = null;
        if (snapshot) {
          setDocuments(snapshot.documents);
          if (snapshot.evicted.length > 0) {
            notify(
              `Removed ${snapshot.evicted.length} older ${snapshot.evicted.length === 1 ? 'document' : 'documents'} from the local library. Their annotations are kept and will return if you reopen the files.`,
            );
          }
        } else {
          setDocuments((current) => [recent, ...current.filter((entry) => entry.id !== fingerprint)]);
        }
        sessionRef.current = initialSession;
        openDocumentIdRef.current = fingerprint;
        setStoredSession(initialSession);
        setOpened({
          session: pdfSession,
          recent,
          metrics,
          annotations,
          initialSession,
          openedAt: Date.now(),
        });
        setView('reader');
        performance.mark('folio:reader:ready');
        setDirty(false);
        setOpening(null);
        setPicking(false);

        void renderThumbnail(pdfSession.pages[0], 260)
          .then(async (thumbnail) => {
            if (!thumbnail) return;
            await saveThumbnail(fingerprint, thumbnail).catch(() => undefined);
            setDocuments((current) =>
              current.map((entry) => (entry.id === fingerprint ? { ...entry, thumbnail } : entry)),
            );
            setOpened((current) =>
              current && current.recent.id === fingerprint
                ? { ...current, recent: { ...current.recent, thumbnail } }
                : current,
            );
          })
          .catch(() => undefined);

        return true;
      } catch (error) {
        if (loadedSession) await loadedSession.destroy().catch(() => undefined);
        if (token !== openTokenRef.current) return false;
        setOpening(null);
        setPicking(false);
        if (error instanceof PdfOpenError && error.code === 'cancelled') return false;
        if (error instanceof PdfOpenError) {
          if (error.code !== 'password') notify(error.message, 'error');
        } else {
          notify(error instanceof Error ? error.message : 'That PDF could not be opened.', 'error');
        }
        if (viewRef.current !== 'reader') setView('library');
        return false;
      } finally {
        if (openAbortRef.current === controller) openAbortRef.current = null;
      }
    },
    [cancelOpening, notify, requestPassword],
  );

  const openStoredDocument = useCallback(
    async (
      document: RecentDocument,
      preferredSession: ReadingSession | null = null,
      explicit = true,
    ): Promise<boolean> => {
      try {
        const bytes = await loadDocumentBytes(document.id);
        if (!bytes) {
          notify('The cached copy of that PDF is missing. Open the original file again.', 'error');
          return false;
        }
        return await openDocument(
          { name: document.name, data: bytes, size: bytes.byteLength },
          { explicit, preferredSession },
        );
      } catch (error) {
        notify(error instanceof Error ? error.message : 'That PDF could not be opened.', 'error');
        return false;
      }
    },
    [notify, openDocument],
  );

  const openPicker = useCallback(async () => {
    if (picking || opening) return;
    setPicking(true);
    try {
      const payload = await choosePdf();
      if (!payload) {
        setPicking(false);
        return;
      }
      await openDocument(payload, { explicit: true });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The file picker could not open.', 'error');
      setPicking(false);
    }
  }, [notify, openDocument, opening, picking]);


  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'o') return;
      if (viewRef.current !== 'library' || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      void openPicker();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openPicker]);

  // Boot: resolve explicit launch intent before considering session restoration.
  useEffect(() => {
    if (bootRanRef.current) return;
    bootRanRef.current = true;
    let cancelled = false;
    void (async () => {
      let appInfo: AppInfo;
      try {
        appInfo = await getAppInfo();
      } catch {
        appInfo = fallbackInfo();
      }
      if (cancelled) return;
      setInfo(appInfo);

      let documents: RecentDocument[] = [];
      let session: ReadingSession | null = null;
      try {
        [documents, session] = await Promise.all([listRecentDocuments(), loadSession()]);
      } catch (error) {
        notify(
          error instanceof Error
            ? `The local library is unavailable: ${error.message}`
            : 'The local library is unavailable. Reading still works, but annotations may not persist.',
          'error',
        );
      }
      if (cancelled) return;
      setDocuments(documents);
      setStoredSession(session);
      sessionRef.current = session;

      let launch: OpenFilePayload | null = null;
      try {
        launch = await consumeLaunchFile();
      } catch (error) {
        explicitOpenRef.current = true;
        notify(error instanceof Error ? error.message : 'That PDF could not be opened.', 'error');
      }
      if (cancelled) return;
      bootedRef.current = true;
      setView('library');

      const queued = queuedOpenRef.current;
      queuedOpenRef.current = null;
      const explicit = launch ?? queued;
      if (explicit) {
        await openDocument(explicit, { explicit: true });
        return;
      }
      if (explicitOpenRef.current) return;

      const restorable =
        session?.restorable
          ? documents.find((document) => document.id === session?.documentId)
          : undefined;
      if (session && restorable) {
        const restored = await openStoredDocument(restorable, session, false);
        if (!restored && !explicitOpenRef.current) {
          await markSessionNotRestorable().catch(() => undefined);
          setStoredSession(null);
          sessionRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify, openDocument, openStoredDocument]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (viewRef.current === 'boot') {
        setInfo((current) => current ?? fallbackInfo());
        setView('library');
        notify(
          'Folio took longer than expected to start. You can still open a PDF; local history may be unavailable.',
          'error',
        );
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [notify]);

  useEffect(() => {
    return onOpenFile((payload) => {
      explicitOpenRef.current = true;
      if (!bootedRef.current) {
        queuedOpenRef.current = payload;
        return;
      }
      void openDocument(payload, { explicit: true });
    });
  }, [openDocument]);

  useEffect(() => {
    return onOpenError((message) => notify(message, 'error'));
  }, [notify]);

  const onReaderSessionChange = useCallback((snapshot: ReadingSession) => {
    sessionRef.current = snapshot;
    if (sessionSaveTimerRef.current) clearTimeout(sessionSaveTimerRef.current);
    sessionSaveTimerRef.current = setTimeout(() => {
      sessionSaveTimerRef.current = null;
      const current = sessionRef.current;
      if (current) void saveSession(current).catch(() => undefined);
    }, 240);
  }, []);

  const closeToLibrary = useCallback(async () => {
    const handle = readerRef.current;
    try {
      if (handle) {
        await handle.flush();
        const snapshot = handle.getSession() ?? sessionRef.current;
        if (snapshot) {
          const stored: ReadingSession = { ...snapshot, restorable: false, updatedAt: Date.now() };
          if (sessionSaveTimerRef.current) {
            clearTimeout(sessionSaveTimerRef.current);
            sessionSaveTimerRef.current = null;
          }
          await saveSession(stored);
          sessionRef.current = stored;
          setStoredSession(stored);
        }
      }
    } catch (error) {
      notify(
        error instanceof Error
          ? `Folio could not save your annotations: ${error.message}. Export the document before leaving.`
          : 'Folio could not save your annotations. Export the document before leaving.',
        'error',
      );
      return;
    }
    setFocusMode(false);
    setOpened(null);
    openDocumentIdRef.current = null;
    setDirty(false);
    setView('library');
  }, [notify]);

  useEffect(() => {
    return onBeforeClose(() => {
      void (async () => {
        try {
          const handle = readerRef.current;
          if (handle) {
            await handle.flush();
            const snapshot = handle.getSession();
            if (snapshot) await saveSession({ ...snapshot, restorable: true });
          } else if (sessionRef.current) {
            await saveSession({ ...sessionRef.current, restorable: viewRef.current === 'reader' });
          }
        } catch {
          // Closing must not be blocked by a storage failure; the reader has already tried to persist.
        } finally {
          closeReady();
        }
      })();
    });
  }, []);

  useEffect(() => {
    const flushForUnload = () => {
      const handle = readerRef.current;
      if (handle) {
        void handle.flush();
        const snapshot = handle.getSession();
        if (snapshot) void saveSession(snapshot);
      } else if (sessionRef.current) {
        void saveSession(sessionRef.current);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushForUnload();
    };
    window.addEventListener('pagehide', flushForUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushForUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleRemove = useCallback(
    async (document: RecentDocument) => {
      try {
        await removeRecentDocument(document.id);
        if (sessionRef.current?.documentId === document.id) {
          if (sessionSaveTimerRef.current) clearTimeout(sessionSaveTimerRef.current);
          sessionRef.current = null;
          setStoredSession(null);
        }
        setDocuments(await listRecentDocuments());
        notify('Removed from the local library. Your original file was not touched.');
      } catch (error) {
        notify(error instanceof Error ? error.message : 'That document could not be removed.', 'error');
      }
    },
    [notify],
  );

  useEffect(() => {
    const dragIsFile = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const onDragEnter = (event: DragEvent) => {
      if (!dragIsFile(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!dragIsFile(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!dragIsFile(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!dragIsFile(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      void payloadFromFile(file)
        .then((payload) => openDocument(payload, { explicit: true }))
        .catch((error: unknown) => {
          notify(error instanceof Error ? error.message : 'That file could not be opened.', 'error');
        });
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [notify, openDocument]);

  if (!info || view === 'boot') {
    return (
      <div className="boot-splash">
        <div className="boot-splash-inner">
          <BrandMark size={34} />
          <span>Opening Folio…</span>
          <span className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${focusMode ? 'focus-mode' : ''}`}>
      {!focusMode ? (
        <TitleBar
          edition={info.edition}
          title={view === 'reader' ? opened?.recent.title || opened?.recent.name : undefined}
          onHome={view === 'reader' ? () => void closeToLibrary() : undefined}
          onAbout={() => setAboutOpen(true)}
          theme={preferences.theme}
          onToggleTheme={toggleTheme}
          nightMode={preferences.nightMode}
          onToggleNight={toggleNight}
        />
      ) : null}

      <div className="app-body">
        {view === 'library' ? (
          <Library
            documents={documents}
            session={storedSession}
            info={info}
            busy={picking || Boolean(opening)}
            onOpen={() => void openPicker()}
            onOpenRecent={(document) =>
              void openStoredDocument(
                document,
                sessionRef.current?.documentId === document.id ? sessionRef.current : null,
                true,
              )
            }
            onResume={(document) =>
              void openStoredDocument(document, sessionRef.current ?? storedSession, true)
            }
            onRemove={handleRemove}
          />
        ) : null}

        {view === 'reader' && opened ? (
          <Reader
            key={`${opened.recent.id}:${opened.openedAt}`}
            ref={readerRef}
            doc={opened}
            nightMode={preferences.nightMode}
            onToggleNight={toggleNight}
            onOpenFile={() => void openPicker()}
            onAbout={() => setAboutOpen(true)}
            onDirtyChange={setDirty}
            onFocusChange={setFocusMode}
            onSessionChange={onReaderSessionChange}
          />
        ) : null}

        {opening ? (
          <OpeningOverlay
            name={opening.name}
            stage={opening.stage}
            progress={opening.progress}
            onCancel={cancelOpening}
          />
        ) : null}

        {dragging ? (
          <div className="drop-overlay" aria-hidden="true">
            <div className="drop-icon">
              <Upload size={25} />
            </div>
            <h2>Drop to open</h2>
            <p>The PDF stays on this device.</p>
          </div>
        ) : null}
      </div>

      <PasswordDialog
        open={passwordPrompt !== null}
        reason={passwordPrompt?.reason ?? 'required'}
        documentName={passwordPrompt?.documentName ?? ''}
        onSubmit={resolvePassword}
        onCancel={() => resolvePassword(null)}
      />

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        info={info}
        dirty={dirty}
      />
    </div>
  );
}
