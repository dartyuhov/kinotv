import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import './Button.css';

interface ButtonProps {
  /** Stable, unique focus key. Screens are restored by focus key, so derive it from data, not render order. */
  focusKey: string;
  label: string;
  variant?: 'primary' | 'secondary';
  onPress(): void;
}

/** A remote-focusable pill button: primary is white, secondary is translucent grey (spec §6.1). */
export function Button({ focusKey, label, variant = 'secondary', onPress }: ButtonProps) {
  const { ref } = useFocusable({ focusKey, onEnterPress: onPress });
  return (
    <div ref={ref} role="button" className={`button button--${variant}`}>
      {label}
    </div>
  );
}
