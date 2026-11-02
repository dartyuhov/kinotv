import { doesFocusableExist, FocusContext, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from '../nav/useBackHandler';
import './Overlay.css';

interface OverlayProps {
  /** The overlay's focus key; its contents' keys should start with it. Unique among mounted overlays. */
  id: string;
  /** Heading, and the dialog's accessible name. */
  title: string;
  /**
   * What gets focus when the overlay opens. Pass it once the contents have loaded: until then the
   * overlay itself holds focus (so the screen underneath can't take it), and it moves here as soon as
   * this is set, unless the viewer has already moved.
   */
  initialFocusKey?: string;
  /** Called for Back. Unmount the overlay to close it. */
  onClose(): void;
  children: ReactNode;
}

/**
 * A panel that slides over the right side of the screen, for choices made with the remote (a folder
 * picker, track pickers). Render it only while open.
 *
 * - It is a focus boundary: arrows can't leave it.
 * - It takes Back (close) ahead of the screen underneath.
 * - When it closes, focus returns to whatever was focused before it opened (usually its button).
 * - It is drawn over the whole stage, wherever it is rendered in the tree.
 */
export function Overlay({ id, title, initialFocusKey, onClose, children }: OverlayProps) {
  const titleId = useId();
  // Read during the first render, before this overlay moves focus.
  const [returnFocusKey] = useState(getCurrentFocusKey);
  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({ focusKey: id, isFocusBoundary: true, preferredChildFocusKey: initialFocusKey });

  useBackHandler(() => onClose());

  useEffect(() => {
    const current = getCurrentFocusKey();
    if (!initialFocusKey) void setFocus(id);
    else if (current === id || current === returnFocusKey || !doesFocusableExist(current)) void setFocus(initialFocusKey);
  }, [id, initialFocusKey, returnFocusKey]);

  useEffect(
    () => () => {
      if (doesFocusableExist(returnFocusKey)) void setFocus(returnFocusKey);
    },
    [returnFocusKey],
  );

  const stage = document.querySelector('.stage');
  const overlay = (
    <div className="overlay">
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="overlay__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <h2 id={titleId} className="overlay__title">
            {title}
          </h2>
          {children}
        </div>
      </FocusContext.Provider>
    </div>
  );
  return stage ? createPortal(overlay, stage) : overlay;
}
