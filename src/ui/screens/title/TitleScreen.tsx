import { useQuery } from '@tanstack/react-query';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { itemQuery } from '../../app/queries';
import { Backdrop } from '../../components/Backdrop';
import type { ScreenParams } from '../../nav/stack';
import './TitleScreen.css';

/**
 * STUB for the title page. Ticket 05 replaces it with the real page (Play/Resume, bookmarks, seasons).
 * It shows the title so that opening a card, and Back focus restore, can be tested now.
 */
export function TitleScreen({ params }: { params: ScreenParams['title'] }) {
  const { data: item } = useQuery(itemQuery(params.id));
  const names = item ? splitTitle(item.title) : null;
  return (
    <div className="title-screen">
      {item && <Backdrop posters={item.posters} />}
      <div className="title-screen__info">
        <h1 className="title-screen__title">{names?.title ?? ' '}</h1>
        {names?.original && <p className="title-screen__original">{names.original}</p>}
        <p className="title-screen__note">{t('title.comingSoon')}</p>
      </div>
    </div>
  );
}
