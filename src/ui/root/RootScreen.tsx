import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { TabBar, TABBAR_FOCUS_KEY } from './TabBar';
import { ROOT_CONTENT_FOCUS_KEY, TabContent } from './TabContent';
import { useTabStore } from './tabs';

/** The root layer: the tab bar plus the active tab's content. Initial focus is the active tab. */
export function RootScreen() {
  const { activeTab, setActiveTab } = useTabStore();
  const { ref, focusKey } = useFocusable({ focusKey: 'root', preferredChildFocusKey: TABBAR_FOCUS_KEY });

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref}>
        <TabBar active={activeTab} onTabFocus={setActiveTab} onTabEnter={() => void setFocus(ROOT_CONTENT_FOCUS_KEY)} />
        <TabContent key={activeTab} tab={activeTab} />
      </div>
    </FocusContext.Provider>
  );
}
