import { doesFocusableExist, FocusContext, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect, useId, useState } from 'react';
import { useBackHandler } from '../nav/useBackHandler';
import { Button } from './Button';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  /** Prefix for the dialog's focus keys; must be unique among mounted dialogs. */
  id: string;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm(): void;
  /** Called for the Cancel button and for Back. */
  onCancel(): void;
}

/**
 * A modal question with two buttons. Render it only while open.
 *
 * - It is a focus boundary: arrows can't leave it. The confirm button gets focus first.
 * - It takes Back (cancel) ahead of the screen underneath.
 * - When it closes, focus returns to whatever was focused before it opened.
 */
export function ConfirmDialog({ id, title, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmKey = `${id}:confirm`;
  const titleId = useId();
  // Read during the first render, before this dialog moves focus.
  const [returnFocusKey] = useState(getCurrentFocusKey);
  const { ref, focusKey } = useFocusable({ focusKey: id, isFocusBoundary: true, preferredChildFocusKey: confirmKey });

  useBackHandler(() => onCancel());

  useEffect(() => {
    void setFocus(confirmKey);
    return () => {
      if (doesFocusableExist(returnFocusKey)) void setFocus(returnFocusKey);
    };
  }, [confirmKey, returnFocusKey]);

  return (
    <div className="confirm-dialog">
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="confirm-dialog__panel" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
          <h2 id={titleId} className="confirm-dialog__title">
            {title}
          </h2>
          <div className="confirm-dialog__actions">
            <Button focusKey={confirmKey} variant="primary" label={confirmLabel} onPress={onConfirm} />
            <Button focusKey={`${id}:cancel`} label={cancelLabel} onPress={onCancel} />
          </div>
        </div>
      </FocusContext.Provider>
    </div>
  );
}
