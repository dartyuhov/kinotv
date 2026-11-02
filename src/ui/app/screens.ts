import type { ScreenRegistry } from '../nav/ScreenStack';
import { RootScreen } from '../root/RootScreen';
import { DemoScreen } from '../screens/demo/DemoScreen';

/** Component for each pushable screen. The params type for each name lives in ui/nav/stack.ts. */
export const SCREENS: ScreenRegistry = {
  root: RootScreen,
  demo: DemoScreen,
};
