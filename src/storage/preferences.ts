import type { Preferences, Theme } from './types';

const THEME_KEY = 'folio.theme';
const NIGHT_KEY = 'folio.night';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadPreferences(): Preferences {
  const storedTheme = read(THEME_KEY);
  const theme: Theme =
    storedTheme === 'dark' || storedTheme === 'light'
      ? storedTheme
      : window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  return {
    theme,
    nightMode: read(NIGHT_KEY) === 'true',
  };
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Preferences are best-effort; the UI has already applied the value.
  }
}

export function saveNightMode(enabled: boolean): void {
  try {
    localStorage.setItem(NIGHT_KEY, String(enabled));
  } catch {
    // See saveTheme.
  }
}
