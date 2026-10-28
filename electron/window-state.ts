import { app, BrowserWindow, screen, type Rectangle } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

interface StoredWindowState {
  bounds?: Rectangle;
  maximized?: boolean;
}

function stateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function overlaps(a: Rectangle, b: Rectangle): boolean {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width >= 120 && height >= 80;
}

export function visibleBounds(stored?: Rectangle): Rectangle | undefined {
  if (!stored) return undefined;
  const displays = screen.getAllDisplays().map((display) => display.workArea);
  if (!displays.some((area) => overlaps(stored, area))) return undefined;
  const area = displays.find((display) => overlaps(stored, display)) ?? displays[0];
  const width = Math.max(780, Math.min(stored.width, area.width));
  const height = Math.max(520, Math.min(stored.height, area.height));
  const x = Math.max(area.x, Math.min(stored.x, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(stored.y, area.y + area.height - height));
  return { x, y, width, height };
}

export function loadWindowState(): { bounds?: Rectangle; maximized: boolean } {
  try {
    const stored = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as StoredWindowState;
    return { bounds: visibleBounds(stored.bounds), maximized: Boolean(stored.maximized) };
  } catch {
    return { maximized: false };
  }
}

export function attachWindowStatePersistence(window: BrowserWindow): () => void {
  let timer: NodeJS.Timeout | undefined;

  const save = () => {
    if (window.isDestroyed()) return;
    const state: StoredWindowState = {
      bounds: window.isMaximized() ? undefined : window.getNormalBounds(),
      maximized: window.isMaximized(),
    };
    try {
      fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
      fs.writeFileSync(stateFile(), JSON.stringify(state), 'utf8');
    } catch (error) {
      console.warn('[folio] could not persist window state', error);
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 350);
  };

  window.on('resize', schedule);
  window.on('move', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('close', save);

  return () => {
    if (timer) clearTimeout(timer);
    save();
  };
}
