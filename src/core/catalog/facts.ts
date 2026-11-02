import type { ItemDetails, ItemSummary } from '../api/types';
import { t, type MessageKey } from '../i18n';

const TYPE_LABELS: Record<string, MessageKey> = {
  movie: 'type.movie',
  serial: 'type.serial',
  documovie: 'type.documovie',
  docuserial: 'type.docuserial',
  tvshow: 'type.tvshow',
  concert: 'type.concert',
  '3d': 'type.3d',
};

/** "Фильм", "Сериал"…, or null for a content type the app has no name for. */
export function typeLabel(type: string): string | null {
  const key = TYPE_LABELS[type.toLowerCase()];
  return key ? t(key) : null;
}

/** "IMDb 7.8", "КП 8.1": the ratings a title has. */
export function ratingLabels(item: Pick<ItemSummary, 'imdb_rating' | 'kinopoisk_rating'>): string[] {
  const out: string[] = [];
  if (item.imdb_rating) out.push(t('rating.imdb', { value: item.imdb_rating.toFixed(1) }));
  if (item.kinopoisk_rating) out.push(t('rating.kinopoisk', { value: item.kinopoisk_rating.toFixed(1) }));
  return out;
}

/** True for titles with 2160p video. */
export function is4k(item: Pick<ItemSummary, 'quality'>): boolean {
  return (item.quality ?? 0) >= 2160;
}

/** A length for people: "48 мин", "1 ч 52 мин", "2 ч". Rounded to the minute. */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t('time.minutes', { m });
  if (m === 0) return t('time.hours', { h });
  return t('time.hoursMinutes', { h, m });
}

/** What a title can be heard and read in: ISO 639-2 codes, in first-seen order, across all its videos. */
export function trackLanguages(item: Pick<ItemDetails, 'videos' | 'seasons'>): { audio: string[]; subtitles: string[] } {
  const audio = new Set<string>();
  const subtitles = new Set<string>();
  const videos = [...(item.videos ?? []), ...(item.seasons ?? []).flatMap((s) => s.episodes)];
  for (const video of videos) {
    for (const track of video.audios) audio.add(track.lang.toLowerCase());
    for (const track of video.subtitles) subtitles.add(track.lang.toLowerCase());
  }
  const known = (lang: string) => lang !== '' && lang !== 'unk' && lang !== 'und';
  return { audio: [...audio].filter(known), subtitles: [...subtitles].filter(known) };
}

// ISO 639-2 codes (both the B and T forms) of the languages kino.watch commonly has.
const LANGUAGE_NAMES: Record<string, MessageKey> = {
  rus: 'lang.rus',
  eng: 'lang.eng',
  ukr: 'lang.ukr',
  deu: 'lang.deu',
  ger: 'lang.deu',
  fra: 'lang.fra',
  fre: 'lang.fra',
  spa: 'lang.spa',
  ita: 'lang.ita',
  jpn: 'lang.jpn',
  kor: 'lang.kor',
  zho: 'lang.zho',
  chi: 'lang.zho',
};

/** "русский" for "rus"; the code in capitals for a language the app has no name for. */
export function languageName(code: string): string {
  const key = LANGUAGE_NAMES[code.toLowerCase()];
  return key ? t(key) : code.toUpperCase();
}

/** A position on a clock: "48:10", "1:02:03". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}
