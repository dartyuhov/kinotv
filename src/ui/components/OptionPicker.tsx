import { doesFocusableExist, FocusContext, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Check } from 'lucide-react';
import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useBackHandler } from '../nav/useBackHandler';
import './OptionPicker.css';

export interface PickerOption {
  /** Unique among the options; part of the option's focus key. */
  value: string;
  label: string;
}

interface OptionPickerProps {
  /** Prefix for the picker's focus keys; must be unique among mounted pickers. */
  id: string;
  title: string;
  options: readonly PickerOption[];
  /** The current choice: it is marked, and focus starts on it. */
  selected: string;
  onPick(value: string): void;
  /** Called for Back. */
  onClose(): void;
}

// Layout in logical pixels; keep in step with OptionPicker.css.
const OPTION_PITCH = 72;
const LIST_HEIGHT = 720;
/** Options rendered beyond each end of the list's viewport. */
const BUFFER = 10;

/**
 * A panel listing the choices for one setting, over the right side of the screen. Render it only while open.
 *
 * - It is a focus boundary: Up/Down move through the options, nothing else leaves it. Focus starts on
 *   the current choice. OK picks the focused option (`onPick`); the owner closes the picker.
 * - It takes Back (`onClose`) ahead of the screen underneath.
 * - When it closes, focus returns to whatever was focused before it opened (usually what opened it).
 * - Long lists (countries) are virtualised and scroll with focus.
 */
export function OptionPicker({ id, title, options, selected, onPick, onClose }: OptionPickerProps) {
  const titleId = useId();
  const optionKey = useCallback((value: string) => `${id}:option:${value}`, [id]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === selected),
  );
  const [index, setIndex] = useState(selectedIndex);
  // Read during the first render, before the picker moves focus.
  const [returnFocusKey] = useState(getCurrentFocusKey);
  const { ref, focusKey } = useFocusable({ focusKey: id, isFocusBoundary: true, preferredChildFocusKey: optionKey(selected) });

  useBackHandler(() => onClose());

  const startKey = useRef(optionKey(options[selectedIndex]?.value ?? selected));
  useEffect(() => {
    void setFocus(startKey.current);
    return () => {
      if (doesFocusableExist(returnFocusKey)) void setFocus(returnFocusKey);
    };
  }, [returnFocusKey]);

  const latest = useRef({ options, onPick });
  latest.current = { options, onPick };
  const onPickIndex = useCallback((i: number) => {
    const option = latest.current.options[i];
    if (option) latest.current.onPick(option.value);
  }, []);

  const maxOffset = Math.max(0, options.length * OPTION_PITCH - LIST_HEIGHT);
  const offset = Math.min(maxOffset, Math.max(0, index * OPTION_PITCH - (LIST_HEIGHT - OPTION_PITCH) / 2));
  const first = Math.max(0, Math.floor(offset / OPTION_PITCH) - BUFFER);
  const last = Math.min(options.length, Math.ceil((offset + LIST_HEIGHT) / OPTION_PITCH) + BUFFER);

  return (
    <div className="option-picker">
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="option-picker__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <h2 id={titleId} className="option-picker__title">
            {title}
          </h2>
          <div className="option-picker__viewport">
            <div
              role="listbox"
              aria-labelledby={titleId}
              className="option-picker__list"
              style={{ height: options.length * OPTION_PITCH, transform: `translate3d(0, ${-offset}px, 0)` }}
            >
              {options.slice(first, last).map((option, i) => (
                <PickerItem
                  key={option.value}
                  focusKey={optionKey(option.value)}
                  index={first + i}
                  label={option.label}
                  selected={option.value === selected}
                  onFocusIndex={setIndex}
                  onPickIndex={onPickIndex}
                />
              ))}
            </div>
          </div>
        </div>
      </FocusContext.Provider>
    </div>
  );
}

interface PickerItemProps {
  focusKey: string;
  index: number;
  label: string;
  selected: boolean;
  onFocusIndex(index: number): void;
  onPickIndex(index: number): void;
}

const PickerItem = memo(function PickerItem({ focusKey, index, label, selected, onFocusIndex, onPickIndex }: PickerItemProps) {
  const onFocus = useCallback(() => onFocusIndex(index), [index, onFocusIndex]);
  const onEnterPress = useCallback(() => onPickIndex(index), [index, onPickIndex]);
  const { ref } = useFocusable<object, HTMLDivElement>({ focusKey, onFocus, onEnterPress });
  return (
    <div ref={ref} role="option" aria-selected={selected} className="option-picker__option" style={{ top: index * OPTION_PITCH }}>
      <span className="option-picker__label">{label}</span>
      {selected && <Check className="option-picker__check" aria-hidden strokeWidth={3} />}
    </div>
  );
});
