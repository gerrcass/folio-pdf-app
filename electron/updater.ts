import { app, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppUpdater } from 'electron-updater';
import { parseUpdateFeed } from './update-config';
import type { Edition, UpdateState } from '../src/platform/bridge-types';

function readFeedUrl(): URL | null {
  const fromEnv = process.env.FOLIO_UPDATE_URL?.trim();
  let candidate = fromEnv;
  if (!candidate) {
    try {
      const configPath = path.join(process.resourcesPath, 'update-config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { url?: string };
      candidate = config.url?.trim();
    } catch {
      candidate = undefined;
    }
  }
  return parseUpdateFeed(candidate);
}

export class UpdateManager {
  readonly edition: Edition;
  readonly feedUrl: URL | null;
  readonly supported: boolean;
  private updater: AppUpdater | null = null;
  private window: BrowserWindow | null = null;
  private state: UpdateState;

  constructor(edition: Edition) {
    this.edition = edition;
    this.feedUrl = readFeedUrl();
    this.supported = edition === 'installed' && app.isPackaged && this.feedUrl !== null;
    this.state = {
      phase: this.supported ? 'idle' : 'disabled',
      feedConfigured: this.feedUrl !== null,
      supported: this.supported,
      message: this.disabledReason(),
    };
  }

  private disabledReason(): string {
    if (this.edition === 'development') return 'Updates are not available in the Development Edition.';
    if (this.edition === 'portable') return 'Portable copies cannot self-update. Install Folio to receive updates.';
    if (this.edition === 'browser') return 'The Browser Edition updates when the site is refreshed.';
    if (!this.feedUrl) return 'No update feed is configured for this installation.';
    return 'Updates are unavailable.';
  }

  attachWindow(window: BrowserWindow): void {
    this.window = window;
    this.send();
  }

  private send(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('folio:update-state', this.state);
    }
  }

  private setState(next: Partial<UpdateState>): UpdateState {
    this.state = { ...this.state, ...next };
    this.send();
    return this.state;
  }

  getState(): UpdateState {
    return this.state;
  }

  private async ensureUpdater(): Promise<AppUpdater | null> {
    if (!this.supported || !this.feedUrl) return null;
    if (this.updater) return this.updater;
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = {
      info: () => undefined,
      warn: () => undefined,
      error: (message?: unknown) => console.warn('[folio] update error', message),
      debug: () => undefined,
    };
    autoUpdater.setFeedURL({ provider: 'generic', url: this.feedUrl.href });
    autoUpdater.on('checking-for-update', () => {
      this.setState({ phase: 'checking', message: 'Checking for updates…' });
    });
    autoUpdater.on('update-available', (info) => {
      this.setState({
        phase: 'available',
        version: info.version,
        message: `Folio ${info.version} is available.`,
      });
    });
    autoUpdater.on('update-not-available', () => {
      this.setState({ phase: 'up-to-date', message: 'Folio is up to date.' });
    });
    autoUpdater.on('download-progress', (progress) => {
      this.setState({
        phase: 'downloading',
        percent: Math.round(progress.percent),
        message: `Downloading update… ${Math.round(progress.percent)}%`,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.setState({
        phase: 'ready',
        version: info.version,
        percent: 100,
        message: `Folio ${info.version} is ready to install.`,
      });
    });
    autoUpdater.on('error', (error) => {
      this.setState({
        phase: 'error',
        message: error?.message ? `Update failed: ${error.message}` : 'Update failed.',
      });
    });
    this.updater = autoUpdater;
    return autoUpdater;
  }

  async check(): Promise<UpdateState> {
    const updater = await this.ensureUpdater();
    if (!updater) return this.state;
    try {
      await updater.checkForUpdates();
    } catch (error) {
      this.setState({
        phase: 'error',
        message: error instanceof Error ? `Update check failed: ${error.message}` : 'Update check failed.',
      });
    }
    return this.state;
  }

  async download(): Promise<UpdateState> {
    const updater = await this.ensureUpdater();
    if (!updater || this.state.phase !== 'available') return this.state;
    try {
      await updater.downloadUpdate();
    } catch (error) {
      this.setState({
        phase: 'error',
        message: error instanceof Error ? `Download failed: ${error.message}` : 'Download failed.',
      });
    }
    return this.state;
  }

  async install(): Promise<boolean> {
    const updater = await this.ensureUpdater();
    if (!updater || this.state.phase !== 'ready') return false;
    setImmediate(() => updater.quitAndInstall(false, true));
    return true;
  }
}
