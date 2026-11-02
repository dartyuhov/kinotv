import type { ItemSummary, WatchingSerial } from '../../../core/api/types';
import { splitTitle } from '../../../core/catalog/titles';
import { tn } from '../../../core/i18n';
import { artwork } from '../../components/artwork';
import { Card, type CardSlot } from '../../components/Card';

/** A followed series as a poster card, with a badge counting its new episodes (I Watch and Home). */
export function renderSeriesCard(item: ItemSummary & Partial<Pick<WatchingSerial, 'new'>>, slot: CardSlot) {
  const { title } = splitTitle(item.title);
  const fresh = item.new ?? 0;
  return (
    <Card
      {...slot}
      label={fresh > 0 ? tn('card.newEpisodes', fresh, { label: title }) : title}
      title={title}
      image={artwork(item.posters, 'poster')}
      badge={fresh}
    />
  );
}
