import type { PlayerEvent, PlayerEvents } from './types';

/** The `on`/emit half every adapter shares. A failing listener never stops the others. */
export function createEmitter() {
  const listeners = new Map<PlayerEvent, Set<(payload: never) => void>>();
  return {
    on<E extends PlayerEvent>(event: E, listener: (payload: PlayerEvents[E]) => void): () => void {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(listener as (payload: never) => void);
      return () => set.delete(listener as (payload: never) => void);
    },
    emit<E extends PlayerEvent>(event: E, payload: PlayerEvents[E]): void {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        try {
          (listener as (payload: PlayerEvents[E]) => void)(payload);
        } catch (error) {
          console.error('player listener failed', event, error);
        }
      }
    },
    clear(): void {
      listeners.clear();
    },
  };
}
