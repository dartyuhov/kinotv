import type { Audio, VideoFile } from '../api/types';
import { normalizeLanguage } from './manifestTracks';
import { streamCandidates, type PickedStream } from './streams';
import type { AudioTrack, PlayerCapabilities } from './types';

export interface ServiceAudioSource extends AudioTrack { sources: PickedStream[] }

/** Legacy KinoPub HLS selects a container audio number in master-v1aN.m3u8.
 * This is a source selector, never an AVPlay track index. Only recognize that
 * exact supplied HLS URL shape; do not rewrite HLS2/HLS4, tokens or query data.
 * The coordinator must fetch/validate the requested playlist before loading it. */
export function serviceAudioSources(audios: readonly Audio[], files: readonly VideoFile[], capabilities: PlayerCapabilities): ServiceAudioSource[] {
  const supplied = streamCandidates(files, capabilities).filter(source => source.type === 'hls');
  return audios.flatMap(audio => {
    if (!Number.isSafeInteger(audio.index) || audio.index < 1 ||
      audios.filter(other => other.index === audio.index).length !== 1) return [];
    const sources = supplied.flatMap(source => {
      const url = new URL(source.url);
      if (!/\/master-v1a\d+\.m3u8$/.test(url.pathname)) return [];
      url.pathname = url.pathname.replace(/master-v1a\d+\.m3u8$/, `master-v1a${audio.index}.m3u8`);
      return [{ ...source, url: url.href }];
    });
    if (!sources.length) return [];
    const lang = normalizeLanguage(audio.lang);
    const semantic = `${lang}:${audio.type?.id ?? ''}:${audio.author?.id ?? ''}:${audio.codec}:${audio.channels}`;
    const unique = lang !== 'unk' && audios.filter(other =>
      `${normalizeLanguage(other.lang)}:${other.type?.id ?? ''}:${other.author?.id ?? ''}:${other.codec}:${other.channels}` === semantic).length === 1;
    return [{ id: `service-audio:${audio.id}:${audio.index}`, lang,
      label: [lang === 'unk' ? undefined : lang, audio.type?.title, audio.author?.title,
        audio.codec?.toUpperCase(), audio.channels > 0 ? `${audio.channels}ch` : undefined].filter(Boolean).join(' · '),
      preferenceKey: unique ? `service:${semantic}` : undefined, sources }];
  });
}
