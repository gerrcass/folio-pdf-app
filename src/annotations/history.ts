import type { Annotation } from './types';

export interface AnnotationHistoryState {
  present: Annotation[];
  past: Annotation[][];
  future: Annotation[][];
}

export type AnnotationHistoryAction =
  | { type: 'reset'; annotations: Annotation[] }
  | { type: 'commit'; annotations: Annotation[] }
  | { type: 'undo' }
  | { type: 'redo' };

const MAX_HISTORY = 100;

export function createHistoryState(annotations: Annotation[] = []): AnnotationHistoryState {
  return { present: annotations, past: [], future: [] };
}

export function historyReducer(
  state: AnnotationHistoryState,
  action: AnnotationHistoryAction,
): AnnotationHistoryState {
  switch (action.type) {
    case 'reset':
      return createHistoryState(action.annotations);
    case 'commit': {
      if (action.annotations === state.present) return state;
      const past = [...state.past, state.present].slice(-MAX_HISTORY);
      return { present: action.annotations, past, future: [] };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        present: next,
        past: [...state.past, state.present],
        future: rest,
      };
    }
    default:
      return state;
  }
}

export function addAnnotations(state: Annotation[], additions: Annotation[]): Annotation[] {
  return [...state, ...additions];
}

export function updateAnnotation(state: Annotation[], updated: Annotation): Annotation[] {
  return state.map((annotation) => (annotation.id === updated.id ? updated : annotation));
}

export function removeAnnotation(state: Annotation[], id: string): Annotation[] {
  return state.filter((annotation) => annotation.id !== id);
}
