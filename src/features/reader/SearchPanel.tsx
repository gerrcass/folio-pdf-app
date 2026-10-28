import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { SearchMatch, SearchResultSet } from '../../pdf/search';

interface SearchPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  results: SearchResultSet | null;
  activeMatchIndex: number;
  indexing: boolean;
  indexedPages: number;
  totalPages: number;
  onNext: () => void;
  onPrevious: () => void;
  onSelectMatch: (globalIndex: number) => void;
  onClose: () => void;
}

interface DisplayedMatch extends SearchMatch {
  globalIndex: number;
}

export function SearchPanel({
  query,
  onQueryChange,
  results,
  activeMatchIndex,
  indexing,
  indexedPages,
  totalPages,
  onNext,
  onPrevious,
  onSelectMatch,
  onClose,
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, []);

  const displayed = useMemo(() => {
    const matches: DisplayedMatch[] = [];
    results?.matches.slice(0, 240).forEach((match, index) => {
      matches.push({ ...match, globalIndex: index });
    });
    const grouped = new Map<number, DisplayedMatch[]>();
    for (const match of matches) {
      const group = grouped.get(match.pageIndex);
      if (group) group.push(match);
      else grouped.set(match.pageIndex, [match]);
    }
    return grouped;
  }, [results]);

  const total = results?.total ?? 0;
  const hasQuery = query.trim().length > 0;
  const progress = totalPages > 0 ? indexedPages / totalPages : 0;

  return (
    <aside className="side-panel" aria-label="Search document">
      <div className="panel-head">
        <span className="panel-title">Search</span>
        <button className="icon-button small" onClick={onClose} aria-label="Close search" type="button">
          <X size={14} />
        </button>
      </div>
      <div className="search-box">
        <Search size={14} style={{ color: 'var(--ink-3)', flex: '0 0 auto' }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (event.shiftKey) onPrevious();
              else onNext();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder="Find in document"
          aria-label="Find in document"
          spellCheck={false}
        />
        {query ? (
          <button
            className="search-clear"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            type="button"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      <div className="search-meta">
        {hasQuery ? (
          <>
            <span className="search-count">
              {total === 0 ? '0' : `${Math.min(activeMatchIndex + 1, total)} / ${total}`}
            </span>
            <span>{total === 1 ? 'match' : 'matches'}</span>
            {indexing ? (
              <>
                <span className="grow" />
                <span className="spinner" style={{ width: 10, height: 10 }} />
                <span>
                  {indexedPages}/{totalPages}
                </span>
              </>
            ) : (
              <>
                <span className="grow" />
                <div className="search-nav">
                  <button
                    className="icon-button small"
                    onClick={onPrevious}
                    disabled={total === 0}
                    aria-label="Previous match"
                    data-tooltip="Previous match"
                    type="button"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    className="icon-button small"
                    onClick={onNext}
                    disabled={total === 0}
                    aria-label="Next match"
                    data-tooltip="Next match"
                    type="button"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <span>Search the indexed text of this PDF.</span>
        )}
      </div>

      {indexing ? (
        <div className="search-progress" aria-hidden="true">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}

      <div className="panel-body">
        {!hasQuery ? (
          <div className="search-empty">
            <strong>Find a thought</strong>
            Type to search every page. Results appear as pages are indexed, so you can keep scrolling while Folio
            works in the background.
          </div>
        ) : total === 0 && indexing ? (
          <div className="search-empty">
            <span className="spinner" style={{ margin: '0 auto 10px' }} />
            Searching {indexedPages} of {totalPages} pages…
          </div>
        ) : total === 0 ? (
          <div className="search-empty">
            <strong>No matches</strong>
            “{query}” was not found in this document. Try a shorter phrase, or check the spelling.
          </div>
        ) : (
          <div className="search-results">
            {[...displayed.entries()].map(([pageIndex, matches]) => (
              <div className="search-page-group" key={pageIndex}>
                <div className="search-page-label">Page {pageIndex + 1}</div>
                {matches.map((match) => (
                  <button
                    key={`${match.pageIndex}-${match.ordinalOnPage}-${match.start}`}
                    className={`search-result ${match.globalIndex === activeMatchIndex ? 'active' : ''}`}
                    onClick={() => onSelectMatch(match.globalIndex)}
                    aria-current={match.globalIndex === activeMatchIndex ? 'true' : undefined}
                    type="button"
                  >
                    <span className="result-page">{pageIndex + 1}</span>
                    {match.snippet.before}
                    <mark>{match.snippet.match}</mark>
                    {match.snippet.after}
                  </button>
                ))}
              </div>
            ))}
            {results && results.matches.length > 240 ? (
              <div className="hint" style={{ padding: '10px 8px' }}>
                Showing the first 240 of {results.total} matches. Use next/previous to step through all of them.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
