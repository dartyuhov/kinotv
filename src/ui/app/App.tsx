import { ScreenStack } from '../nav/ScreenStack';
import { SCREENS } from './screens';
import { Stage } from './Stage';

export function App() {
  return (
    <Stage>
      <ScreenStack screens={SCREENS} />
    </Stage>
  );
}
