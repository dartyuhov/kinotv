import { useSyncExternalStore } from 'react';
import { t } from '../../../core/i18n';
import { getAvailableUpdate, subscribeToUpdates } from '../../../core/updates/updateCheck';
import './UpdateNotice.css';

/** "Update available (vX.Y.Z)" when the launch-time check found a newer release; nothing otherwise. */
export function UpdateNotice() {
  const update = useSyncExternalStore(subscribeToUpdates, getAvailableUpdate);
  if (!update) return null;
  return (
    <div className="update-notice" role="status">
      <p className="update-notice__title">{t('settings.updateAvailable', { version: update.version })}</p>
      <p className="update-notice__hint">{t('settings.updateHint')}</p>
    </div>
  );
}
