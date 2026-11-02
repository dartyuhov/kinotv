import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { LucideIcon } from 'lucide-react';
import { revealInScroller } from '../focus/reveal';
import './Button.css';

interface ButtonProps {
  /** Stable, unique focus key. Screens are restored by focus key, so derive it from data, not render order. */
  focusKey: string;
  label: string;
  variant?: 'primary' | 'secondary';
  /** Drawn before the label; the accessible name stays the label. */
  icon?: LucideIcon;
  /** Shows only the icon, as a round button; the label is still its accessible name. Needs `icon`. */
  iconOnly?: boolean;
  onPress(): void;
}

/** A remote-focusable pill button: primary is white, secondary is translucent grey (spec §6.1). */
export function Button({ focusKey, label, variant = 'secondary', icon: Icon, iconOnly = false, onPress }: ButtonProps) {
  const { ref } = useFocusable({
    focusKey,
    onEnterPress: onPress,
    onFocus: ({ node }) => revealInScroller(node),
  });
  return (
    <div
      ref={ref}
      role="button"
      aria-label={Icon ? label : undefined}
      className={`button button--${variant}${Icon && iconOnly ? ' button--icon-only' : ''}`}
    >
      {Icon && <Icon className="button__icon" aria-hidden strokeWidth={2.5} />}
      {!(Icon && iconOnly) && label}
    </div>
  );
}
