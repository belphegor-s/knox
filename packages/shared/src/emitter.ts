import type { Disposable } from "./disposable.js";

type Listener<T> = (payload: T) => void;

export class Emitter<T = void> {
  private listeners: Set<Listener<T>> | null = null;

  get hasListeners(): boolean {
    return !!this.listeners && this.listeners.size > 0;
  }

  readonly event = (listener: Listener<T>): Disposable => {
    this.listeners ??= new Set();
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners?.delete(listener);
      },
    };
  };

  fire(payload: T): void {
    if (!this.listeners) return;
    // Snapshot: a listener disposing itself (or another) mid-fire must not
    // corrupt iteration.
    for (const listener of [...this.listeners]) {
      listener(payload);
    }
  }

  dispose(): void {
    this.listeners?.clear();
    this.listeners = null;
  }
}
