import { useEffect } from 'react';
import { create } from 'zustand';
import './Toast.css';

/** How long a message stays on screen. */
const TOAST_MS = 5_000;

interface ToastState {
  message: string | null;
  /** Bumped by every showToast, so the same message shown twice restarts its timer. */
  serial: number;
}

const useToastStore = create<ToastState>(() => ({ message: null, serial: 0 }));

/**
 * Shows a short message at the bottom of the screen for a few seconds, e.g. "couldn't save that change".
 * It never takes focus, so it can be called from anywhere, including after the screen that caused it
 * has gone. A newer message replaces the one on screen.
 */
export function showToast(message: string): void {
  useToastStore.setState((s) => ({ message, serial: s.serial + 1 }));
}

/** Where toasts appear. Rendered once, inside the Stage, above every screen. */
export function Toast() {
  const { message, serial } = useToastStore();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => useToastStore.setState({ message: null }), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, serial]);
  return (
    <div className="toast" role="status" aria-live="polite">
      {message && (
        <p key={serial} className="toast__message">
          {message}
        </p>
      )}
    </div>
  );
}
