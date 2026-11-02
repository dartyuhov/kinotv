import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Search, Settings, type LucideIcon } from 'lucide-react';
import { t } from '../../core/i18n';
import { TAB_IDS, tabFocusKey, type TabId } from './tabs';
import './TabBar.css';

export const TABBAR_FOCUS_KEY = 'tabbar';

const ICONS: Partial<Record<TabId, LucideIcon>> = { search: Search, settings: Settings };

interface TabBarProps {
  active: TabId;
  /** Focusing a tab makes it active (tvOS behaviour). */
  onTabFocus(id: TabId): void;
  /** OK on a tab moves into its content. */
  onTabEnter(id: TabId): void;
}

/** The floating pill tab bar. Coming back up from the content always lands on the active tab. */
export function TabBar({ active, onTabFocus, onTabEnter }: TabBarProps) {
  const { ref, focusKey } = useFocusable({
    focusKey: TABBAR_FOCUS_KEY,
    preferredChildFocusKey: tabFocusKey(active),
  });
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="tabbar" role="tablist" aria-orientation="horizontal">
        {TAB_IDS.map((id) => (
          <Tab key={id} id={id} selected={id === active} onFocus={onTabFocus} onEnter={onTabEnter} />
        ))}
      </div>
    </FocusContext.Provider>
  );
}

interface TabProps {
  id: TabId;
  selected: boolean;
  onFocus(id: TabId): void;
  onEnter(id: TabId): void;
}

function Tab({ id, selected, onFocus, onEnter }: TabProps) {
  const { ref } = useFocusable({
    focusKey: tabFocusKey(id),
    onFocus: () => onFocus(id),
    onEnterPress: () => onEnter(id),
  });
  const Icon = ICONS[id];
  const label = t(`tabs.${id}`);
  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={selected}
      aria-label={Icon ? label : undefined}
      className={selected ? 'tabbar__tab tabbar__tab--active' : 'tabbar__tab'}
    >
      {Icon ? <Icon className="tabbar__icon" aria-hidden strokeWidth={2.5} /> : label}
    </div>
  );
}
