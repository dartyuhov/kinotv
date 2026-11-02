import { useQuery } from '@tanstack/react-query';
import { t } from '../../../core/i18n';
import { signOut } from '../../../core/services';
import { userQuery } from '../../app/queries';
import { Button } from '../../components/Button';
import { screenStack } from '../../nav/stack';
import { HOME_TAB, useTabStore } from '../../root/tabs';
import { UpdateNotice } from './UpdateNotice';
import './SettingsTab.css';

/**
 * The Settings tab. For now it only shows the account, offers Sign out and, pinned to the top right
 * next to the title, the update notice; the full Settings screen (language, quality, audio, 4K/HDR,
 * region, diagnostics) comes later.
 */
export function SettingsTab() {
  const { data: user } = useQuery(userQuery);

  const onSignOut = () => {
    // The next viewer starts on Home, not where this one left off.
    screenStack.reset();
    useTabStore.getState().setActiveTab(HOME_TAB);
    signOut();
  };

  return (
    <div className="settings-tab">
      <div className="settings-tab__update">
        <UpdateNotice />
      </div>
      <h1 className="settings-tab__title">{t('tabs.settings')}</h1>
      <p className="settings-tab__account">{user ? t('settings.account', { name: user.username }) : ' '}</p>
      <div className="settings-tab__actions">
        <Button focusKey="settings:sign-out" label={t('settings.signOut')} onPress={onSignOut} />
      </div>
    </div>
  );
}
