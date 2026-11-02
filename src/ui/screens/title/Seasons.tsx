import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useCallback, useEffect } from 'react';
import type { ItemDetails, Season, Video } from '../../../core/api/types';
import { formatDuration } from '../../../core/catalog/facts';
import type { ProgressLookup, VideoProgress } from '../../../core/catalog/progress';
import { t } from '../../../core/i18n';
import { artwork } from '../../components/artwork';
import { Card, type CardSlot } from '../../components/Card';
import { Row } from '../../components/Row';
import { useRowMemory } from '../../components/rowMemory';
import { screenStack } from '../../nav/stack';
import { useTitleStore } from './titleStore';
import './Seasons.css';

/** Focus key of the episode row of `season`; it also keys the row's focus memory. */
export const episodeRowKey = (itemId: number, season: number) => `title:${itemId}:season:${season}`;
const tabsKey = (itemId: number) => `title:${itemId}:seasons`;
const tabKey = (itemId: number, season: number) => `title:${itemId}:seasons:${season}`;

// Season tabs have one width, so the strip scrolls by whole tabs (keep in step with SeasonTabs.css).
const TAB_PITCH = 168;
const TABS_VISIBLE_WIDTH = 1920 - 96 - 64;

interface SeasonsProps {
  item: ItemDetails;
  seasons: Season[];
  progress: ProgressLookup;
  /** The episode Play/Resume would play: its season is shown first, and its row starts on it. */
  next: { season: number; episode: number } | null;
}

/**
 * A series' seasons (spec §4, mockup tvos-style): "Сезон N" tabs over a row of that season's episodes,
 * with progress bars and watched marks. Focusing a tab switches the row. The picked season is kept in the
 * title store and each season's row keeps its focused episode in the row memory, so Back from the player
 * lands where the viewer was.
 */
export function Seasons({ item, seasons, progress, next }: SeasonsProps) {
  const picked = useTitleStore((s) => s.season[item.id]);
  const pickSeason = useTitleStore((s) => s.pickSeason);
  const fallback = next?.season ?? seasons[0]!.number;
  const active = seasons.find((s) => s.number === picked) ?? seasons.find((s) => s.number === fallback) ?? seasons[0]!;

  // The next episode's row starts on it, unless the viewer has already been through that row.
  useEffect(() => {
    if (!next) return;
    const rowKey = episodeRowKey(item.id, next.season);
    const index = seasons.find((s) => s.number === next.season)?.episodes.findIndex((e) => e.number === next.episode) ?? -1;
    const memory = useRowMemory.getState();
    if (index >= 0 && memory.index[rowKey] === undefined) memory.remember(rowKey, index);
  }, [item.id, next, seasons]);

  const season = active.number;
  const onPick = useCallback((n: number) => pickSeason(item.id, n), [item.id, pickSeason]);
  const onEpisodePress = useCallback(
    (episode: Video) => {
      const at = progress(season, episode.number);
      const startAt = at && !at.watched ? at.time : 0;
      screenStack.push('player', { itemId: item.id, season, episode: episode.number, startAt });
    },
    [item.id, progress, season],
  );
  const renderCard = useCallback(
    (episode: Video, slot: CardSlot) => (
      <EpisodeCard item={item} episode={episode} progress={progress(season, episode.number)} slot={slot} />
    ),
    [item, progress, season],
  );

  return (
    <div className="title-page__seasons">
      <SeasonTabs itemId={item.id} seasons={seasons.map((s) => s.number)} active={season} onPick={onPick} />
      <Row
        key={season}
        focusKey={episodeRowKey(item.id, season)}
        title={t('title.season', { n: season })}
        hideTitle
        variant="landscape"
        items={active.episodes}
        itemKey={episodeNumber}
        renderCard={renderCard}
        onItemPress={onEpisodePress}
      />
    </div>
  );
}

const episodeNumber = (episode: Video) => episode.number;

interface SeasonTabsProps {
  itemId: number;
  seasons: number[];
  active: number;
  onPick(season: number): void;
}

/** "Сезон 1 · Сезон 2 · …". Focus picks the season, like the tab bar picks a tab. */
function SeasonTabs({ itemId, seasons, active, onPick }: SeasonTabsProps) {
  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({
    focusKey: tabsKey(itemId),
    preferredChildFocusKey: tabKey(itemId, active),
  });
  // Keep the picked tab on screen: scroll by whole tabs once it passes the fourth slot.
  const maxOffset = Math.max(0, seasons.length * TAB_PITCH - TABS_VISIBLE_WIDTH);
  const offset = Math.min(maxOffset, Math.max(0, (seasons.indexOf(active) - 3) * TAB_PITCH));
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} role="tablist" aria-label={t('title.seasonTabs')} className="season-tabs">
        <div className="season-tabs__track" style={{ transform: `translate3d(${-offset}px, 0, 0)` }}>
          {seasons.map((n) => (
            <SeasonTab key={n} focusKey={tabKey(itemId, n)} season={n} selected={n === active} onPick={onPick} />
          ))}
        </div>
      </div>
    </FocusContext.Provider>
  );
}

interface SeasonTabProps {
  focusKey: string;
  season: number;
  selected: boolean;
  onPick(season: number): void;
}

function SeasonTab({ focusKey, season, selected, onPick }: SeasonTabProps) {
  const onFocus = useCallback(() => onPick(season), [onPick, season]);
  const { ref } = useFocusable<object, HTMLDivElement>({ focusKey, onFocus });
  return (
    <div ref={ref} role="tab" aria-selected={selected} className={selected ? 'season-tab season-tab--selected' : 'season-tab'}>
      {t('title.season', { n: season })}
    </div>
  );
}

interface EpisodeCardProps {
  item: ItemDetails;
  episode: Video;
  progress: VideoProgress | null;
  slot: CardSlot;
}

/** "3. Старые письма", its still, its length, and how far the viewer got. */
function EpisodeCard({ item, episode, progress: at, slot }: EpisodeCardProps) {
  const title = episode.title
    ? t('title.episode', { n: episode.number, title: episode.title })
    : t('title.episodeUntitled', { n: episode.number });
  return (
    <Card
      {...slot}
      label={at?.watched ? t('title.watched', { label: title }) : title}
      title={title}
      subtitle={episode.duration > 0 ? formatDuration(episode.duration) : undefined}
      image={episode.thumbnail || artwork(item.posters, 'landscape')}
      progress={at?.fraction ?? null}
      watched={at?.watched ?? false}
    />
  );
}
