import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppInfo,
  FolioBridge,
  OpenFilePayload,
  UpdateState,
  WindowAction,
  WindowState,
} from '../src/platform/bridge-types';

function on<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: FolioBridge = {
  isDesktop: true,
  platform: process.platform,
  openFileDialog: () => ipcRenderer.invoke('folio:open-dialog') as Promise<OpenFilePayload | null>,
  consumeLaunchFile: () => ipcRenderer.invoke('folio:consume-launch') as Promise<OpenFilePayload | null>,
  onOpenFile: (listener) => on<OpenFilePayload>('folio:open-file', listener),
  onOpenError: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
    ipcRenderer.on('folio:open-error', handler);
    return () => ipcRenderer.removeListener('folio:open-error', handler);
  },
  windowControls: (action: WindowAction) => ipcRenderer.send('folio:window', action),
  onWindowState: (listener) => on<WindowState>('folio:window-state', listener),
  appInfo: () => ipcRenderer.invoke('folio:app-info') as Promise<AppInfo>,
  openExternal: (url: string) => ipcRenderer.invoke('folio:open-external', url) as Promise<boolean>,
  showInstallFolder: () => ipcRenderer.invoke('folio:show-install-folder') as Promise<boolean>,
  savePdfFile: (name: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('folio:save-pdf', name, data) as Promise<boolean>,
  onBeforeClose: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('folio:before-close', handler);
    return () => ipcRenderer.removeListener('folio:before-close', handler);
  },
  closeReady: () => ipcRenderer.send('folio:close-ready'),
  updates: {
    getState: () => ipcRenderer.invoke('folio:update-state') as Promise<UpdateState>,
    check: () => ipcRenderer.invoke('folio:update-check') as Promise<UpdateState>,
    download: () => ipcRenderer.invoke('folio:update-download') as Promise<UpdateState>,
    install: () => ipcRenderer.invoke('folio:update-install') as Promise<boolean>,
    onState: (listener) => on<UpdateState>('folio:update-state', listener),
  },
};

contextBridge.exposeInMainWorld('folio', bridge);
