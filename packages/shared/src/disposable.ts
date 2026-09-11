/**
 * Minimal disposable primitives used across every subsystem (workers, watchers,
 * subscriptions, worker pools) so lifetimes are explicit instead of relying on GC.
 */

export interface Disposable {
  dispose(): void;
}

export function toDisposable(fn: () => void): Disposable {
  return { dispose: fn };
}

export const Disposable = {
  none: Object.freeze({ dispose(): void {} }) as Disposable,
};

/**
 * Aggregates child disposables so a subsystem can tear down everything it
 * owns with a single call. Disposing twice is a no-op (idempotent), which
 * matters because shutdown paths race with error paths.
 */
export class DisposableStore implements Disposable {
  private readonly items = new Set<Disposable>();
  private disposed = false;

  add<T extends Disposable>(item: T): T {
    if (this.disposed) {
      item.dispose();
      return item;
    }
    this.items.add(item);
    return item;
  }

  delete(item: Disposable): void {
    if (this.items.delete(item)) {
      item.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.items) {
      item.dispose();
    }
    this.items.clear();
  }
}
