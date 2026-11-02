import { normaliseKey, type RemoteKey } from '../platform/keys';

/** Gets every key except Back. May return a promise; the next key waits for it. */
export type RemoteListener = (key: RemoteKey) => void | Promise<void>;

/** Gets Back. Return `false` to pass it to the layer underneath; anything else consumes it. */
export type BackHandler = () => boolean | void;

type KeyTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * The app's single source of remote input.
 *
 * - `listen(window)` installs the one keydown listener. Raw events go through `normaliseKey` and
 *   are handled strictly in order, so a fast "right, OK" always acts on the element "right" focused.
 * - Back goes through a stack: the most recently pushed handler (dialog, then screen, then navigator)
 *   gets it first.
 * - Every other key goes to all subscribers (focus navigation, and later the player).
 */
export interface RemoteBus {
  listen(target: KeyTarget): () => void;
  dispatch(key: RemoteKey): Promise<void>;
  subscribe(listener: RemoteListener): () => void;
  pushBackHandler(handler: BackHandler): () => void;
}

export function createRemoteBus(): RemoteBus {
  const listeners = new Set<RemoteListener>();
  const backHandlers: BackHandler[] = [];
  let queue: Promise<void> = Promise.resolve();

  async function handle(key: RemoteKey): Promise<void> {
    if (key === 'back') {
      for (let i = backHandlers.length - 1; i >= 0; i--) {
        if (backHandlers[i]!() !== false) return;
      }
      return;
    }
    for (const listener of [...listeners]) await listener(key);
  }

  function dispatch(key: RemoteKey): Promise<void> {
    queue = queue.then(() => handle(key)).catch((error: unknown) => console.error('remote key handler failed', key, error));
    return queue;
  }

  return {
    listen(target) {
      const onKeyDown = (event: Event) => {
        const key = normaliseKey(event as KeyboardEvent);
        if (!key) return;
        event.preventDefault(); // no page scrolling, no browser "back" on Backspace
        void dispatch(key);
      };
      target.addEventListener('keydown', onKeyDown);
      return () => target.removeEventListener('keydown', onKeyDown);
    },
    dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    pushBackHandler(handler) {
      backHandlers.push(handler);
      return () => {
        const index = backHandlers.lastIndexOf(handler);
        if (index >= 0) backHandlers.splice(index, 1);
      };
    },
  };
}

/** The app-wide bus. Started in main.tsx. */
export const remoteBus = createRemoteBus();
