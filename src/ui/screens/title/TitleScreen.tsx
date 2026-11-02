import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useQuery } from '@tanstack/react-query';
import { Heart, Play, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ItemDetails } from '../../../core/api/types';
import { formatDuration, is4k, languageName, ratingLabels, trackLanguages, typeLabel } from '../../../core/catalog/facts';
import { playTarget, type PlayTarget } from '../../../core/catalog/playTarget';
import { progressLookup } from '../../../core/catalog/progress';
import { splitTitle } from '../../../core/catalog/titles';
import { t, tn } from '../../../core/i18n';
import { itemQuery, watchingQuery } from '../../app/queries';
import { Backdrop } from '../../components/Backdrop';
import { Button } from '../../components/Button';
import { screenStack, type ScreenParams } from '../../nav/stack';
import { useInitialFocus } from '../../nav/useInitialFocus';
import { FolderPicker } from '../bookmarks/FolderPicker';
import { Seasons } from './Seasons';
import './TitleScreen.css';

/** Focus keys of a title page, derived from the item id so Back restores them. */
const keys = (id: number) => ({
  root: `title:${id}`,
  actions: `title:${id}:actions`,
  play: `title:${id}:play`,
  bookmark: `title:${id}:bookmark`,
  follow: `title:${id}:follow`,
});

/**
 * The title page (spec §4, mockup tvos-style, second frame): full-bleed art, the title and its facts,
 * Play/Resume with focus on it, and for series the season tabs over a row of episodes.
 */
export function TitleScreen({ params }: { params: ScreenParams['title'] }) {
  const k = keys(params.id);
  const item = useQuery(itemQuery(params.id));
  const watching = useQuery(watchingQuery(params.id));
  // Play/Resume waits for the viewer's progress, so its label doesn't change under the viewer. Without
  // progress (it failed to load) it plays from the start.
  const ready = item.isSuccess && !watching.isPending;
  const play = useMemo(() => (item.data && ready ? playTarget(item.data, watching.data) : null), [item.data, ready, watching.data]);
  const progress = useMemo(() => progressLookup(watching.data), [watching.data]);
  const seasons = useMemo(() => playableSeasons(item.data), [item.data]);
  const next = useMemo(
    () => (play?.season !== undefined && play.episode !== undefined ? { season: play.season, episode: play.episode } : null),
    [play],
  );

  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({ focusKey: k.root, preferredChildFocusKey: k.actions });
  useInitialFocus(ready, k.play, focusKey);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={seasons.length > 0 ? 'title-page' : 'title-page title-page--film'}>
        {item.data && <Backdrop posters={item.data.posters} />}
        {/* Minimal on purpose: retry and recovery come with the errors ticket (18). Back still works. */}
        {item.isError && <p className="title-page__error">{t('title.failed')}</p>}
        {item.data && (
          <div className="title-page__details">
            <Facts item={item.data} />
            {play && <Actions itemId={params.id} keys={k} play={play} series={seasons.length > 0} />}
            <Chips item={item.data} />
          </div>
        )}
        {item.data && play && seasons.length > 0 && <Seasons item={item.data} seasons={seasons} progress={progress} next={next} />}
      </div>
    </FocusContext.Provider>
  );
}

/** Title, original title, the meta line and the plot. */
function Facts({ item }: { item: ItemDetails }) {
  const names = splitTitle(item.title);
  return (
    <>
      <h1 className="title-page__title">{names.title}</h1>
      {names.original && <p className="title-page__original">{names.original}</p>}
      <p className="title-page__meta">
        <span>{metaLine(item)}</span>
        {ageRating(item) && <span className="title-page__badge">{ageRating(item)}</span>}
        {is4k(item) && <span className="title-page__badge">4K</span>}
      </p>
      {item.plot && <p className="title-page__plot">{item.plot}</p>}
    </>
  );
}

/**
 * Rating chips, then what the title can be heard and read in: "Озвучка: русский, английский · Субтитры:
 * английский". Information only: choosing a track happens in the player (ticket 08).
 */
function Chips({ item }: { item: ItemDetails }) {
  const ratings = ratingLabels(item);
  const { audio, subtitles } = trackLanguages(item);
  const list = (codes: string[]) => codes.map(languageName).join(', ');
  const languages = [
    audio.length ? t('title.audio', { list: list(audio) }) : null,
    subtitles.length ? t('title.subtitles', { list: list(subtitles) }) : null,
  ].filter(Boolean);
  return (
    <>
      {ratings.length > 0 && (
        <p className="title-page__chips">
          {ratings.map((label) => (
            <span key={label} className="title-page__chip">
              {label}
            </span>
          ))}
        </p>
      )}
      {languages.length > 0 && <p className="title-page__languages">{languages.join(' · ')}</p>}
    </>
  );
}

interface ActionsProps {
  itemId: number;
  keys: ReturnType<typeof keys>;
  play: PlayTarget;
  /** Series get Follow ("I Watch"). */
  series: boolean;
}

/**
 * Play/Resume, then Bookmark and, for series, Follow. Bookmark opens the folder picker. Follow (ticket 13)
 * is a focusable placeholder for now: OK on it does nothing.
 */
function Actions({ itemId, keys: k, play, series }: ActionsProps) {
  const { ref } = useFocusable<object, HTMLDivElement>({ focusKey: k.actions, preferredChildFocusKey: k.play });
  const { resume: _resume, ...where } = play;
  // The Bookmark button's folder picker (ticket 12). The details are cached: the page is showing them.
  const [picking, setPicking] = useState(false);
  const item = useQuery(itemQuery(itemId)).data;
  return (
    <FocusContext.Provider value={k.actions}>
      <div ref={ref} className="title-page__actions">
        <Button
          focusKey={k.play}
          variant="primary"
          icon={Play}
          label={playLabel(play)}
          onPress={() => screenStack.push('player', { itemId, ...where })}
        />
        <Button focusKey={k.bookmark} icon={Plus} iconOnly label={t('title.bookmark')} onPress={() => setPicking(true)} />
        {picking && item && <FolderPicker item={item} onClose={() => setPicking(false)} />}
        {series && <Button focusKey={k.follow} icon={Heart} iconOnly label={t('title.follow')} onPress={notYet} />}
      </div>
    </FocusContext.Provider>
  );
}

const notYet = () => undefined;

/** "Фильм · Драма, Детектив · 2019 · 1 ч 52 мин"; "Сериал · 3 сезона · Драма, Детектив · 2022". */
function metaLine(item: ItemDetails): string {
  const genres = (item.genres ?? []).slice(0, 3).map((g) => g.title).join(', ');
  const seasons = playableSeasons(item).length;
  const length = item.seasons ? null : item.duration?.total ? formatDuration(item.duration.total) : null;
  return [typeLabel(item.type), seasons ? tn('title.seasons', seasons) : null, genres || null, item.year || null, length]
    .filter(Boolean)
    .join(' · ');
}

/** "16+" from 16 or "16+"; null when the API sends none (API v1 has no documented age rating field). */
function ageRating({ age_rating: age }: ItemDetails): string | null {
  if (age === null || age === undefined || age === '' || age === 0) return null;
  return typeof age === 'number' || /^\d+$/.test(age) ? `${age}+` : age;
}

/** A series' seasons that have episodes; empty for films. */
function playableSeasons(item: ItemDetails | undefined) {
  return (item?.seasons ?? []).filter((season) => season.episodes.length > 0);
}

/** "Смотреть", "Продолжить · 48 мин", "Смотреть S1 · E4", "Продолжить S1 · E3". */
function playLabel({ season, episode, startAt, resume }: PlayTarget): string {
  if (season !== undefined && episode !== undefined) {
    return t(resume ? 'title.resumeEpisode' : 'title.playEpisode', { season, episode });
  }
  return resume ? t('title.resume', { time: formatDuration(startAt) }) : t('title.play');
}
