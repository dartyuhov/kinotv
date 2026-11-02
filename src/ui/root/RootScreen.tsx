import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';
import { TabBar, TABBAR_FOCUS_KEY } from './TabBar';
import { ROOT_CONTENT_FOCUS_KEY, TabContent } from './TabContent';
import { tabFocusKey, useTabStore } from './tabs';

/** The root layer: the tab bar plus the active tab's content. */
export function RootScreen() {
  const { activeTab, setActiveTab } = useTabStore();
  const { ref, focusKey } = useFocusable({ focusKey: 'root', preferredChildFocusKey: TABBAR_FOCUS_KEY });

  useEffect(() => {
    void setFocus(tabFocusKey(useTabStore.getState().activeTab));
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref}>
        <TabBar active={activeTab} onTabFocus={setActiveTab} onTabEnter={() => void setFocus(ROOT_CONTENT_FOCUS_KEY)} />
        <TabContent key={activeTab} tab={activeTab} />
      </div>
    </FocusContext.Provider>
  );
}
