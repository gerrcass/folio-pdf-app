export interface DebouncedTask {
  (): void;
  flush: () => void;
  cancel: () => void;
  pending: () => boolean;
}

export function debounce(task: () => void | Promise<void>, delay = 250): DebouncedTask {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  const invoke = () => {
    timer = null;
    const result = task();
    if (result instanceof Promise) {
      running = result.finally(() => {
        running = null;
      });
    }
  };

  const debounced = (() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(invoke, delay);
  }) as DebouncedTask;

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      invoke();
    }
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  debounced.pending = () => timer !== null || running !== null;

  return debounced;
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function yieldToMain(): Promise<void> {
  if (
    typeof window !== 'undefined' &&
    'scheduler' in window &&
    typeof window.scheduler?.yield === 'function'
  ) {
    await window.scheduler.yield();
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}
