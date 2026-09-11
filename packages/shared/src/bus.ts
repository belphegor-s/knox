import { Emitter } from "./emitter.js";
import type { Disposable } from "./disposable.js";
import type { KnoxEventMap, KnoxEventName } from "./events.js";

/**
 * Process-wide typed event bus. One instance lives on `window` (main thread)
 * and workers relay through their RPC channel - see packages/runtime.
 */
export class KnoxEventBus {
  private readonly emitters = new Map<KnoxEventName, Emitter<unknown>>();

  private emitterFor<K extends KnoxEventName>(name: K): Emitter<KnoxEventMap[K]> {
    let emitter = this.emitters.get(name);
    if (!emitter) {
      emitter = new Emitter<unknown>();
      this.emitters.set(name, emitter);
    }
    return emitter as Emitter<KnoxEventMap[K]>;
  }

  on<K extends KnoxEventName>(name: K, listener: (payload: KnoxEventMap[K]) => void): Disposable {
    return this.emitterFor(name).event(listener);
  }

  emit<K extends KnoxEventName>(name: K, payload: KnoxEventMap[K]): void {
    this.emitterFor(name).fire(payload);
  }

  dispose(): void {
    for (const emitter of this.emitters.values()) emitter.dispose();
    this.emitters.clear();
  }
}

export const knoxEvents = new KnoxEventBus();
