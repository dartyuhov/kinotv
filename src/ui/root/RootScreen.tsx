import { FocusContext, getCurrentFocusKey, setFocus, SpatialNavigation, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useState } from 'react';
import { t } from '../../core/i18n';
import { exitApp } from '../../core/platform/app';
import { Backdrop } from '../components/Backdrop';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useBackHandler } from '../nav/useBackHandler';
import { TabBar, TABBAR_FOCUS_KEY } from './TabBar';
import { ROOT_CONTENT_FOCUS_KEY, TabContent } from './TabContent';
import { useRootBackdropStore } from './rootBackdrop';
import { HOME_TAB, tabFocusKey, useTabStore } from './tabs';

/** The active tab's full-bleed art, behind the tab bar and the content (see useRootBackdrop). */
function RootBackdrop() {
  const posters = useRootBackdropStore((s) => s.posters);
  return posters ? <Backdrop posters={posters} /> : null;
}

/** The root layer: the tab bar plus the active tab's content. Initial focus is the active tab. */
export function RootScreen() {
  const { activeTab, setActiveTab } = useTabStore();
  const [askingToExit, setAskingToExit] = useState(false);
  const { ref, focusKey } = useFocusable({ focusKey: 'root', preferredChildFocusKey: TABBAR_FOCUS_KEY });

  // Back at the root: content → its tab → Home tab → "Exit app?".
  useBackHandler(() => {
    const onTabBar = SpatialNavigation.isDescendantOf(getCurrentFocusKey(), TABBAR_FOCUS_KEY);
    if (!onTabBar) {
      void setFocus(tabFocusKey(activeTab));
    } else if (activeTab !== HOME_TAB) {
      void setFocus(tabFocusKey(HOME_TAB)); // focusing the tab makes it active
    } else {
      setAskingToExit(true);
    }
  });

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref}>
        <RootBackdrop />
        <TabBar active={activeTab} onTabFocus={setActiveTab} onTabEnter={() => void setFocus(ROOT_CONTENT_FOCUS_KEY)} />
        <TabContent key={activeTab} tab={activeTab} />
        {askingToExit && (
          <ConfirmDialog
            id="exit-dialog"
            title={t('exit.title')}
            confirmLabel={t('exit.confirm')}
            cancelLabel={t('exit.cancel')}
            onConfirm={() => {
              exitApp();
              setAskingToExit(false);
            }}
            onCancel={() => setAskingToExit(false)}
          />
        )}
      </div>
    </FocusContext.Provider>
  );
}
