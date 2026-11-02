import type { ComponentType } from 'react';
import { ScreenHost } from './ScreenHost';
import { useScreenStackStore, type ScreenName, type ScreenParams, type StackEntry } from './stack';

export type ScreenRegistry = { [N in ScreenName]: ComponentType<{ params: ScreenParams[N] }> };

/** Renders the top of the screen stack. */
export function ScreenStack({ screens }: { screens: ScreenRegistry }) {
  const top = useScreenStackStore((s) => s.stack[s.stack.length - 1]!);
  const Screen = screens[top.name] as ComponentType<{ params: StackEntry['params'] }>;
  return (
    <ScreenHost key={top.id} entry={top}>
      <Screen params={top.params} />
    </ScreenHost>
  );
}
