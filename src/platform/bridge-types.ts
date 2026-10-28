export type Edition = 'installed' | 'portable' | 'development' | 'browser';

export type WindowAction = 'minimize' | 'maximize' | 'close';

export interface OpenFilePayload {
  name: string;
  data: ArrayBuffer;
  size: number;
}

export interface WindowState {
  maximized: boolean;
}

export type UpdatePhase =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  version?: string;
  percent?: number;
  message?: string;
  feedConfigured: boolean;
  supported: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  edition: Edition;
  platform: string;
  installPath: string;
  isPackaged: boolean;
  updateFeedConfigured: boolean;
  updatesSupported: boolean;
  updateFeedHost?: string;
}

export interface FolioBridge {
  readonly isDesktop: true;
  readonly platform: string;
  openFileDialog: () => Promise<OpenFilePayload | null>;
  consumeLaunchFile: () => Promise<OpenFilePayload | null>;
  onOpenFile: (listener: (payload: OpenFilePayload) => void) => () => void;
  onOpenError: (listener: (message: string) => void) => () => void;
  windowControls: (action: WindowAction) => void;
  onWindowState: (listener: (state: WindowState) => void) => () => void;
  appInfo: () => Promise<AppInfo>;
  openExternal: (url: string) => Promise<boolean>;
  showInstallFolder: () => Promise<boolean>;
  savePdfFile: (name: string, data: ArrayBuffer) => Promise<boolean>;
  onBeforeClose: (listener: () => void) => () => void;
  closeReady: () => void;
  updates: {
    getState: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    download: () => Promise<UpdateState>;
    install: () => Promise<boolean>;
    onState: (listener: (state: UpdateState) => void) => () => void;
  };
}
