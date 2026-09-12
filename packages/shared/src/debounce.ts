// Trailing-edge debounce; flush() forces a pending call through immediately.
export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  flush(): void;
  cancel(): void;
}

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, waitMs: number): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  const debounced = ((...args: Args) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const toRun = pendingArgs;
      pendingArgs = null;
      if (toRun) fn(...toRun);
    }, waitMs);
  }) as Debounced<Args>;

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingArgs) {
      const toRun = pendingArgs;
      pendingArgs = null;
      fn(...toRun);
    }
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };

  return debounced;
}
