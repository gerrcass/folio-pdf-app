import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  screen,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveEdition } from './edition';
import { UpdateManager } from './updater';
import { attachWindowStatePersistence, loadWindowState } from './window-state';
import type {
  AppInfo,
  Edition,
  OpenFilePayload,
  WindowAction,
} from '../src/platform/bridge-types';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

if (process.env.FOLIO_USER_DATA_DIR) {
  const userData = path.resolve(process.env.FOLIO_USER_DATA_DIR);
  fs.mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DEV_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : null;
const MAX_PDF_BYTES = 512 * 1024 * 1024;
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob:",
  "media-src 'self' blob:",
  "frame-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

let mainWindow: BrowserWindow | null = null;
let pendingLaunchPath: string | null = findPdfArgument(process.argv);
let allowClose = false;
let closeTimer: NodeJS.Timeout | null = null;
let updateManager: UpdateManager | null = null;

function edition(): Edition {
  return resolveEdition({
    isPackaged: app.isPackaged,
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE),
  });
}

function isTrustedUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol === 'app:' && url.host === 'folio') return true;
    return DEV_ORIGIN !== null && url.origin === DEV_ORIGIN;
  } catch {
    return false;
  }
}

function assertTrusted(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Untrusted sender');
  }
  if (!isTrustedUrl(event.senderFrame?.url)) {
    throw new Error('Untrusted sender');
  }
}

function findPdfArgument(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    if (!arg.toLowerCase().endsWith('.pdf')) continue;
    const resolved = path.resolve(arg);
    try {
      if (fs.statSync(resolved).isFile()) return resolved;
    } catch {
      // Not a file we can open; ignore it.
    }
  }
  return null;
}

async function readPdfFile(filePath: string): Promise<OpenFilePayload> {
  const resolved = path.resolve(filePath);
  if (path.extname(resolved).toLowerCase() !== '.pdf') {
    throw new Error('That file is not a PDF.');
  }
  const stat = await fsp.stat(resolved);
  if (!stat.isFile()) throw new Error('That path is not a file.');
  if (stat.size <= 0) throw new Error('That PDF is empty.');
  if (stat.size > MAX_PDF_BYTES) throw new Error('That PDF is larger than the 512 MB limit.');
  const buffer = await fsp.readFile(resolved);
  const header = buffer.subarray(0, Math.min(1024, buffer.length)).toString('latin1');
  if (!header.includes('%PDF-')) throw new Error('That file is not a valid PDF.');
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return { name: path.basename(resolved), data, size: buffer.byteLength };
}

function sendOpenError(message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('folio:open-error', message);
  }
}

async function deliverFile(filePath: string): Promise<void> {
  try {
    const payload = await readPdfFile(filePath);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('folio:open-file', payload);
    }
  } catch (error) {
    sendOpenError(error instanceof Error ? error.message : 'Could not open that PDF.');
  }
}

function registerAppProtocol(): void {
  const root = path.join(app.getAppPath(), 'dist');
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'folio') return new Response('Not found', { status: 404 });
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const resolved = path.resolve(root, `.${pathname}`);
      if (!resolved.startsWith(root + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      return await net.fetch(pathToFileURL(resolved).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function configureSecurity(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith('app://folio')) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CSP],
          'X-Content-Type-Options': ['nosniff'],
        },
      });
      return;
    }
    callback({ responseHeaders: details.responseHeaders });
  });

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (permission !== 'media' || !isTrustedUrl(contents.getURL())) {
      callback(false);
      return;
    }
    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    if (mediaTypes.includes('audio')) {
      callback(false);
      return;
    }
    if (mediaTypes.length > 0 && !mediaTypes.includes('video')) {
      callback(false);
      return;
    }
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return permission === 'media' && isTrustedUrl(requestingOrigin);
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedUrl(url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

function registerIpc(): void {
  ipcMain.handle('folio:open-dialog', async (event) => {
    assertTrusted(event);
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open a PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return readPdfFile(result.filePaths[0]);
  });

  ipcMain.handle('folio:consume-launch', async (event) => {
    assertTrusted(event);
    if (!pendingLaunchPath) return null;
    const target = pendingLaunchPath;
    pendingLaunchPath = null;
    return readPdfFile(target);
  });

  ipcMain.on('folio:window', (event, action: WindowAction) => {
    try {
      assertTrusted(event);
    } catch {
      return;
    }
    if (!mainWindow) return;
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
    if (action === 'close') mainWindow.close();
  });

  ipcMain.handle('folio:app-info', async (event) => {
    assertTrusted(event);
    const currentEdition = edition();
    const manager = updateManager;
    const info: AppInfo = {
      name: 'Folio',
      version: app.getVersion(),
      edition: currentEdition,
      platform: process.platform,
      installPath: app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath(),
      isPackaged: app.isPackaged,
      updateFeedConfigured: Boolean(manager?.feedUrl),
      updatesSupported: Boolean(manager?.supported),
      updateFeedHost: manager?.feedUrl?.hostname,
    };
    return info;
  });

  ipcMain.handle('folio:open-external', async (event, raw: unknown) => {
    assertTrusted(event);
    if (typeof raw !== 'string') return false;
    try {
      const url = new URL(raw);
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return false;
      await shell.openExternal(url.toString());
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('folio:show-install-folder', async (event) => {
    assertTrusted(event);
    if (!app.isPackaged) return false;
    shell.showItemInFolder(app.getPath('exe'));
    return true;
  });

  ipcMain.handle('folio:save-pdf', async (event, name: unknown, data: unknown) => {
    assertTrusted(event);
    if (!mainWindow) return false;
    if (typeof name !== 'string' || !name.toLowerCase().endsWith('.pdf')) return false;
    if (!(data instanceof ArrayBuffer)) return false;
    if (data.byteLength <= 0 || data.byteLength > MAX_PDF_BYTES) return false;
    const header = new TextDecoder('latin1').decode(new Uint8Array(data, 0, Math.min(1024, data.byteLength)));
    if (!header.includes('%PDF-')) return false;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export annotated PDF',
      defaultPath: name,
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fsp.writeFile(result.filePath, Buffer.from(data));
    return true;
  });

  ipcMain.on('folio:close-ready', (event) => {
    try {
      assertTrusted(event);
    } catch {
      return;
    }
    allowClose = true;
    if (closeTimer) clearTimeout(closeTimer);
    mainWindow?.close();
  });

  ipcMain.handle('folio:update-state', async (event) => {
    assertTrusted(event);
    return updateManager?.getState() ?? {
      phase: 'disabled',
      feedConfigured: false,
      supported: false,
      message: 'Updates are unavailable.',
    };
  });

  ipcMain.handle('folio:update-check', async (event) => {
    assertTrusted(event);
    return updateManager?.check() ?? { phase: 'disabled', feedConfigured: false, supported: false };
  });

  ipcMain.handle('folio:update-download', async (event) => {
    assertTrusted(event);
    return updateManager?.download() ?? { phase: 'disabled', feedConfigured: false, supported: false };
  });

  ipcMain.handle('folio:update-install', async (event) => {
    assertTrusted(event);
    return updateManager?.install() ?? false;
  });
}

function createWindow(): void {
  const stored = loadWindowState();
  const bounds = stored.bounds;

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1240,
    height: bounds?.height ?? 840,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 780,
    minHeight: 520,
    show: false,
    frame: false,
    backgroundColor: '#f6f2ea',
    autoHideMenuBar: true,
    title: 'Folio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  if (stored.maximized) mainWindow.maximize();
  attachWindowStatePersistence(mainWindow);

  const window = mainWindow;
  window.once('ready-to-show', () => {
    window.show();
    if (stored.maximized) window.maximize();
  });

  window.on('maximize', () => {
    window.webContents.send('folio:window-state', { maximized: true });
  });
  window.on('unmaximize', () => {
    window.webContents.send('folio:window-state', { maximized: false });
  });

  window.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (closeTimer) return;
    window.webContents.send('folio:before-close');
    closeTimer = setTimeout(() => {
      allowClose = true;
      if (!window.isDestroyed()) window.close();
    }, 2500);
  });

  window.on('closed', () => {
    mainWindow = null;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  });

  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[folio] renderer failed to load', code, description);
    if (!window.isDestroyed()) window.show();
  });

  if (DEV_URL) {
    void window.loadURL(DEV_URL);
  } else {
    void window.loadURL('app://folio/index.html');
  }

  updateManager = new UpdateManager(edition());
  updateManager.attachWindow(window);

  if (app.isPackaged) {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        event.preventDefault();
      }
    });
  }
}

if (gotLock) {
  app.on('second-instance', (_event, argv) => {
    const filePath = findPdfArgument(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (filePath) {
        if (mainWindow.webContents.isLoadingMainFrame()) pendingLaunchPath = filePath;
        else void deliverFile(filePath);
      }
    } else if (filePath) {
      pendingLaunchPath = filePath;
      createWindow();
    }
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
      if (mainWindow.webContents.isLoadingMainFrame()) pendingLaunchPath = filePath;
      else void deliverFile(filePath);
      mainWindow.focus();
    } else {
      pendingLaunchPath = filePath;
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('app.folio.reader');
    Menu.setApplicationMenu(null);
    registerAppProtocol();
    configureSecurity();
    registerIpc();
    createWindow();

    screen.on('display-removed', () => {
      if (!mainWindow) return;
      const bounds = mainWindow.getBounds();
      const displays = screen.getAllDisplays().map((display) => display.workArea);
      const visible = displays.some(
        (area) =>
          Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x) >= 120 &&
          Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y) >= 80,
      );
      if (!visible) mainWindow.center();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
