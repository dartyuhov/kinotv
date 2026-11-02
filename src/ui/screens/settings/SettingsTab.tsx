import type { TabId } from '../../root/tabs';
import { PlaceholderTab } from '../placeholder/PlaceholderTab';
import { UpdateNotice } from './UpdateNotice';
import './SettingsTab.css';

/**
 * Settings. Still the placeholder until its own ticket (17) lands; for now it adds the update notice,
 * pinned to the top right next to the title.
 */
export function SettingsTab({ tab }: { tab: TabId }) {
  return (
    <div className="settings-tab">
      <div className="settings-tab__update">
        <UpdateNotice />
      </div>
      <PlaceholderTab tab={tab} />
    </div>
  );
}
