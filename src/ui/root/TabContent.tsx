import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { ComponentType } from 'react';
import { useScreenScroller } from '../nav/ScreenHost';
import { PlaceholderTab } from '../screens/placeholder/PlaceholderTab';
import { SettingsTab } from '../screens/settings/SettingsTab';
import type { TabId } from './tabs';
import './TabContent.css';

export const ROOT_CONTENT_FOCUS_KEY = 'root:content';

/** Each tab's screen. Later tickets replace a placeholder with the real screen here. */
const TAB_SCREENS: Record<TabId, ComponentType<{ tab: TabId }>> = {
  search: PlaceholderTab,
  home: PlaceholderTab,
  movies: PlaceholderTab,
  series: PlaceholderTab,
  iwatch: PlaceholderTab,
  tv: PlaceholderTab,
  sport: PlaceholderTab,
  bookmarks: PlaceholderTab,
  history: PlaceholderTab,
  settings: SettingsTab,
};

/**
 * The area under the tab bar. Focusing ROOT_CONTENT_FOCUS_KEY moves focus into the active tab's screen.
 * It is the root screen's scroller, so tab screens scroll (and restore scroll) without extra wiring.
 */
export function TabContent({ tab }: { tab: TabId }) {
  const { ref, focusKey } = useFocusable({ focusKey: ROOT_CONTENT_FOCUS_KEY });
  const scrollerRef = useScreenScroller();
  const Screen = TAB_SCREENS[tab];
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} role="tabpanel" className="tab-content">
        <div ref={scrollerRef} data-scroller className="tab-content__scroller">
          <Screen tab={tab} />
        </div>
      </div>
    </FocusContext.Provider>
  );
}
