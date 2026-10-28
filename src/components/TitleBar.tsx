import { CircleHelp, Copy, Library, Minus, Moon, MoonStar, Square, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Edition, WindowState } from '../platform';
import { isDesktop, onWindowState, windowControls } from '../platform';
import type { Theme } from '../storage';
import { BrandMark } from './BrandMark';

interface TitleBarProps {
  edition: Edition;
  title?: string;
  onHome?: () => void;
  onAbout: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  nightMode: boolean;
  onToggleNight: () => void;
}

function editionLabel(edition: Edition): string | null {
  if (edition === 'browser') return 'Browser';
  if (edition === 'portable') return 'Portable';
  if (edition === 'development') return 'Dev';
  return null;
}

export function TitleBar({
  edition,
  title,
  onHome,
  onAbout,
  theme,
  onToggleTheme,
  nightMode,
  onToggleNight,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    return onWindowState((state: WindowState) => setMaximized(state.maximized));
  }, []);

  const badge = editionLabel(edition);

  return (
    <header
      className="titlebar"
      onDoubleClick={(event) => {
        if (!isDesktop) return;
        if ((event.target as HTMLElement).closest('button')) return;
        windowControls('maximize');
      }}
    >
      <button
        className="titlebar-brand"
        onClick={onHome}
        aria-label={onHome ? 'Back to Library' : 'Folio'}
        data-tooltip={onHome ? 'Back to Library' : undefined}
        data-tooltip-position="bottom"
        style={{ cursor: onHome ? 'pointer' : 'default' }}
        type="button"
      >
        <BrandMark size={18} />
        <span>Folio</span>
      </button>

      {title ? (
        <div className="titlebar-context" aria-label={`Current document: ${title}`}>
          <span className="slash" aria-hidden="true">
            /
          </span>
          <span className="doc-title">{title}</span>
        </div>
      ) : null}

      <div className="titlebar-spacer" />

      <div className="titlebar-tools">
        {badge ? <span className="edition-badge">{badge}</span> : null}
        {onHome ? (
          <button
            className="icon-button"
            onClick={onHome}
            aria-label="Go to Library"
            data-tooltip="Library"
            data-tooltip-position="bottom"
            type="button"
          >
            <Library size={15} />
          </button>
        ) : null}
        <button
          className="icon-button"
          onClick={onToggleNight}
          aria-label={nightMode ? 'Turn off Night Reading' : 'Turn on Night Reading'}
          aria-pressed={nightMode}
          data-tooltip={nightMode ? 'Night Reading: on' : 'Night Reading: off'}
          data-tooltip-position="bottom"
          type="button"
        >
          <MoonStar size={15} />
        </button>
        <button
          className="icon-button"
          onClick={onToggleTheme}
          aria-label={theme === 'light' ? 'Use dark interface' : 'Use light interface'}
          data-tooltip={theme === 'light' ? 'Dark interface' : 'Light interface'}
          data-tooltip-position="bottom"
          type="button"
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
        <button
          className="icon-button"
          onClick={onAbout}
          aria-label="About Folio"
          data-tooltip="About Folio"
          data-tooltip-position="bottom"
          type="button"
        >
          <CircleHelp size={15} />
        </button>
      </div>

      {isDesktop ? (
        <div className="window-controls" aria-label="Window controls">
          <button
            className="window-control"
            onClick={() => windowControls('minimize')}
            aria-label="Minimize window"
            type="button"
          >
            <Minus size={14} />
          </button>
          <button
            className="window-control"
            onClick={() => windowControls('maximize')}
            aria-label={maximized ? 'Restore window' : 'Maximize window'}
            type="button"
          >
            {maximized ? <Copy size={12} /> : <Square size={11} />}
          </button>
          <button
            className="window-control close"
            onClick={() => windowControls('close')}
            aria-label="Close window"
            type="button"
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
    </header>
  );
}
