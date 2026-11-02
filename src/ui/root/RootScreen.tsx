import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';
import { TabBar } from './TabBar';
import { tabFocusKey, useTabStore } from './tabs';

/** The root layer: the tab bar plus the active tab's content. */
export function RootScreen() {
  const { activeTab, setActiveTab } = useTabStore();

  useEffect(() => {
    void setFocus(tabFocusKey(useTabStore.getState().activeTab));
  }, []);

  return <TabBar active={activeTab} onTabFocus={setActiveTab} onTabEnter={() => {}} />;
}
