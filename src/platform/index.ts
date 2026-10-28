import type {
  AppInfo,
  FolioBridge,
  OpenFilePayload,
  UpdateState,
  WindowAction,
  WindowState,
} from './bridge-types';

export type { AppInfo, Edition, OpenFilePayload, UpdateState, WindowAction, WindowState } from './bridge-types';

export const bridge: FolioBridge | undefined = typeof window !== 'undefined' ? window.folio : undefined;
export const isDesktop = Boolean(bridge);

const DISABLED_UPDATES: UpdateState = {
  phase: 'disabled',
  supported: false,
  feedConfigured: false,
  message: 'The Browser Edition updates when the site is refreshed.',
};

export async function getAppInfo(): Promise<AppInfo> {
  if (bridge) return bridge.appInfo();
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

export async function choosePdf(): Promise<OpenFilePayload | null> {
  if (bridge) return bridge.openFileDialog();
  return choosePdfInBrowser();
}

export async function consumeLaunchFile(): Promise<OpenFilePayload | null> {
  if (bridge) return bridge.consumeLaunchFile();
  return null;
}

export function onOpenFile(listener: (payload: OpenFilePayload) => void): () => void {
  return bridge?.onOpenFile(listener) ?? (() => undefined);
}

export function onOpenError(listener: (message: string) => void): () => void {
  return bridge?.onOpenError(listener) ?? (() => undefined);
}

export function windowControls(action: WindowAction): void {
  bridge?.windowControls(action);
}

export function onWindowState(listener: (state: WindowState) => void): () => void {
  return bridge?.onWindowState(listener) ?? (() => undefined);
}

export async function openExternal(url: string): Promise<boolean> {
  if (bridge) return bridge.openExternal(url);
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    return opened !== null;
  } catch {
    return false;
  }
}

export async function showInstallFolder(): Promise<boolean> {
  return bridge?.showInstallFolder() ?? false;
}

export async function savePdfFile(name: string, data: ArrayBuffer): Promise<boolean> {
  if (bridge) return bridge.savePdfFile(name, data);
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 5_000);
  return true;
}

export function onBeforeClose(listener: () => void): () => void {
  return bridge?.onBeforeClose(listener) ?? (() => undefined);
}

export function closeReady(): void {
  bridge?.closeReady();
}

export async function getUpdateState(): Promise<UpdateState> {
  return bridge ? bridge.updates.getState() : DISABLED_UPDATES;
}

export async function checkForUpdates(): Promise<UpdateState> {
  return bridge ? bridge.updates.check() : DISABLED_UPDATES;
}

export async function downloadUpdate(): Promise<UpdateState> {
  return bridge ? bridge.updates.download() : DISABLED_UPDATES;
}

export async function installUpdate(): Promise<boolean> {
  return bridge ? bridge.updates.install() : false;
}

export function onUpdateState(listener: (state: UpdateState) => void): () => void {
  return bridge?.updates.onState(listener) ?? (() => undefined);
}

export async function payloadFromFile(file: File): Promise<OpenFilePayload> {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error('That file is not a PDF.');
  }
  if (file.size > 512 * 1024 * 1024) throw new Error('That PDF is larger than the 512 MB limit.');
  const data = await file.arrayBuffer();
  const header = new TextDecoder('latin1').decode(new Uint8Array(data, 0, Math.min(1024, data.byteLength)));
  if (!header.includes('%PDF-')) throw new Error('That file is not a valid PDF.');
  return { name: file.name, data, size: data.byteLength };
}

function choosePdfInBrowser(): Promise<OpenFilePayload | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.style.display = 'none';
    document.body.append(input);

    let settled = false;
    const cleanup = () => {
      input.remove();
      window.removeEventListener('focus', onFocus);
    };
    const finish = (value: OpenFilePayload | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const onFocus = () => {
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) finish(null);
      }, 450);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      void payloadFromFile(file).then(
        (payload) => finish(payload),
        (error: unknown) => finish(null, error),
      );
    });
    window.addEventListener('focus', onFocus);
    input.click();
  });
}
