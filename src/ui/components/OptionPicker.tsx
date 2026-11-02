import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Check } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import { Overlay } from './Overlay';
import './OptionPicker.css';

export interface PickerOption {
  /** Unique among the options; part of the option's focus key. */
  value: string;
  label: string;
}

interface OptionPickerProps {
  /** The picker's focus key, and the prefix of its options' keys. Unique among mounted overlays. */
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
const LIST_HEIGHT = 792;
/** Options rendered beyond each end of the list's viewport. */
const BUFFER = 10;

/**
 * A list of choices for one setting, in an Overlay panel. Render it only while open.
 *
 * - Focus starts on the current choice; Up/Down move, OK picks (`onPick`), and the owner closes it.
 * - From Overlay: arrows can't leave it, Back closes it (`onClose`), and focus returns to whatever
 *   opened it.
 * - Long lists (countries) are virtualised and scroll with focus.
 */
export function OptionPicker({ id, title, options, selected, onPick, onClose }: OptionPickerProps) {
  const optionKey = (value: string) => `${id}:option:${value}`;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === selected),
  );
  const [index, setIndex] = useState(selectedIndex);
  const [initialFocusKey] = useState(() => optionKey(options[selectedIndex]?.value ?? selected));

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
    <Overlay id={id} title={title} initialFocusKey={initialFocusKey} onClose={onClose}>
      <div className="option-picker">
        <div
          role="listbox"
          aria-label={title}
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
    </Overlay>
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
