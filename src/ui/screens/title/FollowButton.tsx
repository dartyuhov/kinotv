import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { t } from '../../../core/i18n';
import { useFollow } from '../../app/following';
import { itemQuery } from '../../app/queries';
import { Button } from '../../components/Button';
import './FollowButton.css';

/**
 * Follow ("Буду смотреть") on a series' title page: a toggle, filled while the viewer follows the series.
 * The change shows at once; if the server rejects it, it is undone and a message says so.
 */
export function FollowButton({ focusKey, itemId }: { focusKey: string; itemId: number }) {
  const { data: item } = useQuery(itemQuery(itemId));
  const { followed, failed, toggle } = useFollow(item);
  return (
    <>
      <Button focusKey={focusKey} icon={Heart} iconOnly label={t('title.follow')} pressed={followed} onPress={toggle} />
      {failed && (
        <p role="alert" className="follow-button__failed">
          {t('title.followFailed')}
        </p>
      )}
    </>
  );
}
