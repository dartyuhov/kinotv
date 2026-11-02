import type { ScreenRegistry } from '../nav/ScreenStack';
import { RootScreen } from '../root/RootScreen';
import { DemoScreen } from '../screens/demo/DemoScreen';
import { PlayerScreen } from '../screens/player/PlayerScreen';
import { TitleScreen } from '../screens/title/TitleScreen';

/** Component for each pushable screen. The params type for each name lives in ui/nav/stack.ts. */
export const SCREENS: ScreenRegistry = {
  root: RootScreen,
  demo: DemoScreen,
  title: TitleScreen,
  player: PlayerScreen,
};
