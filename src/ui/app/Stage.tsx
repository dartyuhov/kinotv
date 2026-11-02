import { useEffect, useState, type ReactNode } from 'react';
import './Stage.css';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

function fitScale(): number {
  return Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
}

// On the TV the window is exactly 1920×1080. In dev, scale the stage so the whole frame fits the browser.
function useDevStageScale(): number {
  const [scale, setScale] = useState(() => (import.meta.env.DEV ? fitScale() : 1));
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onResize = () => setScale(fitScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

/** The fixed 1920×1080 logical frame that every screen is laid out in (spec §6.4). */
export function Stage({ children }: { children: ReactNode }) {
  const scale = useDevStageScale();
  return (
    <div className="stage-viewport">
      <div className="stage" data-testid="stage" style={scale === 1 ? undefined : { transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
