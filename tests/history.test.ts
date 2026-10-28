import { describe, expect, it } from 'vitest';
import type { Annotation, HighlightAnnotation } from '../src/annotations/types';
import {
  addAnnotations,
  createHistoryState,
  historyReducer,
  removeAnnotation,
  updateAnnotation,
} from '../src/annotations/history';

function highlight(id: string): Annotation {
  return {
    id,
    kind: 'highlight',
    pageIndex: 0,
    color: 'amber',
    quads: [
      {
        p0: { x: 0, y: 0 },
        p1: { x: 1, y: 0 },
        p2: { x: 1, y: 1 },
        p3: { x: 0, y: 1 },
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('annotation history', () => {
  it('undoes and redoes whole annotation commands', () => {
    const first = highlight('a');
    const second = highlight('b');
    let state = createHistoryState([]);
    state = historyReducer(state, { type: 'commit', annotations: addAnnotations(state.present, [first]) });
    state = historyReducer(state, { type: 'commit', annotations: addAnnotations(state.present, [second]) });
    expect(state.present).toHaveLength(2);
    state = historyReducer(state, { type: 'undo' });
    expect(state.present.map((annotation) => annotation.id)).toEqual(['a']);
    state = historyReducer(state, { type: 'undo' });
    expect(state.present).toHaveLength(0);
    state = historyReducer(state, { type: 'redo' });
    expect(state.present.map((annotation) => annotation.id)).toEqual(['a']);
    state = historyReducer(state, { type: 'redo' });
    expect(state.present.map((annotation) => annotation.id)).toEqual(['a', 'b']);
  });

  it('treats update and delete as single undoable commands', () => {
    const base = highlight('a');
    let state = createHistoryState([base]);
    const changed = { ...base, color: 'rose' as const, updatedAt: 5 };
    state = historyReducer(state, { type: 'commit', annotations: updateAnnotation(state.present, changed) });
    expect((state.present[0] as HighlightAnnotation).color).toBe('rose');
    state = historyReducer(state, { type: 'undo' });
    expect((state.present[0] as HighlightAnnotation).color).toBe('amber');
    state = historyReducer(state, { type: 'commit', annotations: removeAnnotation(state.present, 'a') });
    expect(state.present).toHaveLength(0);
    state = historyReducer(state, { type: 'undo' });
    expect(state.present).toHaveLength(1);
  });

  it('drops the redo branch when a new command lands', () => {
    const a = highlight('a');
    const b = highlight('b');
    let state = createHistoryState([]);
    state = historyReducer(state, { type: 'commit', annotations: [a] });
    state = historyReducer(state, { type: 'undo' });
    expect(state.future).toHaveLength(1);
    state = historyReducer(state, { type: 'commit', annotations: [b] });
    expect(state.future).toHaveLength(0);
    expect(state.present[0].id).toBe('b');
  });
});
