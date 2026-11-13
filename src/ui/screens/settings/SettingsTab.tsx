import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { t } from '../../../core/i18n';
import { signOut } from '../../../core/services';
import { userQuery } from '../../app/queries';
import { Button } from '../../components/Button';
import { OptionPicker } from '../../components/OptionPicker';
import { screenStack } from '../../nav/stack';
import { HOME_TAB, TAB_IDS, useTabStore } from '../../root/tabs';
import { readStartupTab, saveStartupTab } from '../../root/startupPreference';
import { UpdateNotice } from './UpdateNotice';
import { ImageCacheSettings } from './ImageCacheSettings';
import './SettingsTab.css';

/**
 * Account, startup preference, managed artwork storage and the pinned update notice.
 */
export function SettingsTab() {
  const { data: user } = useQuery(userQuery);
  const [startupTab, setStartupTab] = useState(() => readStartupTab(TAB_IDS));
  const [pickingStartup, setPickingStartup] = useState(false);

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
        <ImageCacheSettings />
        <Button
          focusKey="settings:startup-tab"
          label={`${t('settings.startupTab')}: ${t(`tabs.${startupTab}`)}`}
          onPress={() => setPickingStartup(true)}
        />
      </div>
      {pickingStartup && (
        <OptionPicker
          id="settings:startup-picker"
          title={t('settings.startupTab')}
          options={TAB_IDS.map((id) => ({ value: id, label: t(`tabs.${id}`) }))}
          selected={startupTab}
          onClose={() => setPickingStartup(false)}
          onPick={(value) => {
            const tab = TAB_IDS.find((id) => id === value);
            if (tab) {
              saveStartupTab(tab);
              setStartupTab(tab);
            }
            setPickingStartup(false);
          }}
        />
      )}
    </div>
  );
}
