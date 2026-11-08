import { useEffect, useRef, useState } from 'react';
import type { MediaLinks, Video } from '../../../core/api/types';
import { createSubtitleFiles } from '../../../core/platform/subtitleFiles';
import { storage } from '../../../core/platform/storage';
import { onVisibilityChange } from '../../../core/platform/lifecycle';
import { fallbackChoices, fixedQualities, uniquePreference, type HlsManifestSource } from '../../../core/player/playbackChoices';
import { streamCandidates } from '../../../core/player/streams';
import type { PlayerAdapter, Tracks } from '../../../core/player/types';
import { readManifest, emptyManifest } from '../../../core/player/manifestTracks';

interface SeriesPreference { audio?: string; subtitle?: string }
const QUALITY = 'kinotv:playback:quality';
const seriesKey = (id: number) => `kinotv:playback:series:${id}`;
const emptyTracks = (): Tracks => ({ audio: [], subtitles: [], qualities: [] });

/** One source coordinator per episode. Background query refetches never become load commands. */
export function usePlaybackChoices(player: PlayerAdapter | null, video: Video | null, links: MediaLinks | undefined,
  seriesId: number | undefined, startAt: number) {
  const [tracks, setTracks] = useState<Tracks>(emptyTracks);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [quality, setQuality] = useState('auto');
  const [notice, setNotice] = useState<'none' | 'subtitleFailed' | 'subtitleLoading' | 'fallback'>('none');
  const [external, setExternal] = useState<string | null>(null);
  const control = useRef<ReturnType<typeof coordinator> | null>(null);
  const transitioning = useRef(false);
  const [qualities, setQualities] = useState<string[]>([]);
  const [externalOptions, setExternalOptions] = useState<Array<{ id: string; lang: string; forced: boolean }>>([]);

  useEffect(() => {
    if (!player || !video || !links) return;
    const active = coordinator(player, video, links, seriesId, startAt,
      { tracks: setTracks, qualities: setQualities, busy: (value) => { transitioning.current = value; setBusy(value); }, failed: setFailed, quality: setQuality, notice: setNotice, external: setExternal });
    control.current = active;
    setQualities(fixedQualities(links.files, player.capabilities));
    setExternalOptions(active.externalOptions);
    active.start();
    return () => { active.dispose(); control.current = null; };
    // These are initialization inputs for one episode, not a query-refetch subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, video?.id, Boolean(links)]);

  return { tracks, busy, failed, quality, qualities, notice, external, externalOptions, transitioning,
    chooseAudio: (id: string) => control.current?.audio(id),
    chooseSubtitle: (id: string | null) => control.current?.subtitle(id),
    chooseQuality: (id: string) => control.current?.quality(id),
    retry: () => control.current?.retry(),
  };
}

function coordinator(player: PlayerAdapter, video: Video, links: MediaLinks, seriesId: number | undefined,
  startAt: number, update: {
    tracks(value: Tracks): void; qualities(value: string[]): void; busy(value: boolean): void; failed(value: boolean): void; quality(value: string): void;
    notice(value: 'none' | 'subtitleFailed' | 'subtitleLoading' | 'fallback'): void; external(value: string | null): void;
  }) {
  let disposed = false;
  let version = 0;
  let sourceVersion = 0;
  let restoredAudio = '';
  let restoredSubtitle = '';
  let busy = false;
  let desiredQuality = storage.get<string>(QUALITY) ?? 'auto';
  let manifests: HlsManifestSource[] = [];
  const manifestCache = new Map<string, Awaited<ReturnType<typeof readManifest>>>();
  const availableQualities = () => fixedQualities(links.files, player.capabilities, manifests);
  let preference: SeriesPreference = seriesId === undefined ? {} : storage.get<SeriesPreference>(seriesKey(seriesId)) ?? {};
  let subtitleAbort: AbortController | undefined;
  let subtitleVersion = 0;
  let manifestAbort: AbortController | undefined;
  let transport = { position: startAt, playing: true };
  let backgrounded = document.hidden;
  let visibilityPauseIntent = backgrounded;
  if (backgrounded) transport.playing = false;
  const offVisibility = onVisibilityChange((visible) => {
    backgrounded = !visible;
    // Independent of loading/native pause events. Returning never restores autoplay intent.
    if (!visible) { transport.playing = false; visibilityPauseIntent = true; }
  });
  let activeChoice = -1;
  let activeQuality = desiredQuality;
  let chainStarted = 0;
  const files = createSubtitleFiles();
  const externalOptions = player.setExternalSubtitle && files.available ? links.subtitles.flatMap((s, index) => {
    if (!s.url || !/\.(srt|vtt|ttml)(?:\?|$)/i.test(s.url)) return [];
    return [{ id: `external:${index}`, lang: s.lang, forced: s.forced === true }];
  }) : [];
  const save = () => { if (seriesId !== undefined) storage.set(seriesKey(seriesId), preference); };
  const externalKey = (index: number) => {
    const subtitle = links.subtitles[index];
    if (!subtitle || subtitle.lang === 'unk') return undefined;
    const key = `${subtitle.lang}:${subtitle.forced ? 'forced' : 'full'}`;
    return links.subtitles.filter((s) => `${s.lang}:${s.forced ? 'forced' : 'full'}` === key && s.url).length === 1 ? `external:${key}` : undefined;
  };

  function chooseSubtitle(id: string | null, remember = true) {
    subtitleAbort?.abort();
    const request = ++subtitleVersion;
    update.notice('none');
    if (id?.startsWith('external:')) {
      const index = Number(id.slice('external:'.length));
      const subtitle = links.subtitles[index];
      if (!subtitle?.url || !player.setExternalSubtitle) return;
      if (remember) {
        // Do not let a synchronous adapter notification restore the old embedded preference while
        // this manual external selection is being applied. Persist the new identity on success.
        preference = { ...preference, subtitle: undefined };
        restoredSubtitle = `${sourceVersion}:${preference.subtitle}`;
      }
      const abort = new AbortController();
      subtitleAbort = abort;
      const timer = setTimeout(() => abort.abort(), 15_000);
      update.notice('subtitleLoading');
      void files.download(subtitle.url, abort.signal).then(async (lease) => {
        if (disposed || request !== subtitleVersion) { await lease.release(); return; }
        lease.retain(); // AVPlay now owns deletion, after it replaces/closes the native source.
        await player.setExternalSubtitle!(lease.path, subtitle.shift, lease.release, abort.signal);
        if (disposed || request !== subtitleVersion) return;
        update.external(id);
        update.notice('none');
        if (remember) {
          preference = { ...preference, subtitle: externalKey(index) };
          restoredSubtitle = `${sourceVersion}:${preference.subtitle}`;
          save();
        }
      }).catch(() => {
        if (!disposed && request === subtitleVersion) update.notice('subtitleFailed');
      }).finally(() => clearTimeout(timer));
      return;
    }
    if (remember) {
      const track = player.getTracks().subtitles.find((track) => track.id === id);
      preference = { ...preference, subtitle: id === null ? 'off' : track?.preferenceKey };
      restoredSubtitle = `${sourceVersion}:${preference.subtitle}`;
      save();
    }
    player.selectSubtitle(id);
    update.external(null);
  }

  function refreshTracks() {
    if (disposed) return;
    const tracks = player.getTracks();
    update.tracks(tracks);
    if (busy) return;
    // Metadata can arrive after the initial native track list. Apply each semantic preference once
    // when it actually matches, marking BEFORE commands that synchronously emit another event.
    const audio = uniquePreference(tracks.audio, preference.audio);
    const audioKey = `${sourceVersion}:${preference.audio}`;
    if (audio && restoredAudio !== audioKey) { restoredAudio = audioKey; player.selectAudio(audio.id); }
    const subtitleKey = `${sourceVersion}:${preference.subtitle}`;
    if (restoredSubtitle === subtitleKey) return;
    if (preference.subtitle === 'off') { restoredSubtitle = subtitleKey; chooseSubtitle(null, false); }
    else if (preference.subtitle?.startsWith('external:')) {
      const matches = externalOptions.filter((option) => externalKey(Number(option.id.slice(9))) === preference.subtitle);
      if (matches.length === 1) { restoredSubtitle = subtitleKey; chooseSubtitle(matches[0]!.id, false); }
    } else {
      const subtitle = uniquePreference(tracks.subtitles, preference.subtitle);
      if (subtitle) { restoredSubtitle = subtitleKey; chooseSubtitle(subtitle.id, false); }
    }
  }
  const offTracks = player.on('tracks', refreshTracks);
  const offTime = player.on('time', ({ position }) => { if (!busy) transport.position = position; });
  const offState = player.on('state', (state) => {
    if (!busy && (state === 'playing' || state === 'paused')) {
      transport.playing = state === 'playing' && !backgrounded;
      if (transport.playing) visibilityPauseIntent = false; // explicit foreground transport resumes
    }
  });
  const offError = player.on('error', () => {
    if (busy || disposed) return;
    chainStarted = Date.now(); // a later runtime failure gets its own bounded recovery window
    void load(activeQuality, transport.position, transport.playing, activeChoice + 1);
  });

  async function load(quality: string, position: number, playing: boolean, from = 0) {
    const request = ++version;
    ++sourceVersion;
    subtitleAbort?.abort();
    manifestAbort?.abort();
    ++subtitleVersion;
    busy = true;
    update.busy(true);
    update.failed(false);
    update.external(null);
    update.notice('none');
    if (from === 0) chainStarted = Date.now();
    activeQuality = quality;
    transport = { position, playing: playing && !backgrounded && !visibilityPauseIntent };
    const choices = fallbackChoices(links.files, player.capabilities, quality, manifests);
    for (let index = from; index < choices.length; index++) {
      if (disposed || request !== version) return;
      if (Date.now() - chainStarted > 60_000) break;
      let source = choices[index]!;
      try {
        const abort = new AbortController();
        manifestAbort = abort;
        const manifest = source.manifest ?? manifestCache.get(source.url) ?? (source.type === 'http' ? emptyManifest() : await readManifest(source.url, abort.signal));
        manifestCache.set(source.url, manifest);
        if (disposed || request !== version) return;
        if (source.inspectBeforeLoad && quality !== 'auto') {
          const exact = fallbackChoices([], player.capabilities, quality, [{ ...source, manifest }])
            .filter((choice) => choice.fixedBandwidth !== undefined).slice(0, 4).map((choice) => ({ ...choice, inspectBeforeLoad: false }));
          choices.splice(index, 1, ...exact);
          --index;
          continue;
        }
        await player.load({ ...source, duration: video.duration, audios: video.audios, subtitles: links.subtitles, manifest }, { startAt: position });
        if (disposed || request !== version) return;
        activeChoice = index;
        busy = false;
        update.busy(false);
        update.quality(source.fixed ? source.quality : 'auto');
        if (index > 0) update.notice('fallback');
        if (transport.playing && !visibilityPauseIntent && !backgrounded && !document.hidden) player.play();
        refreshTracks();
        return;
      } catch (error) {
        // A missing callback blocks AVPlay's lane. Repeating loads cannot recover it safely.
        if ((error as { detail?: string })?.detail?.includes('TimeoutError')) break;
      }
    }
    if (disposed || request !== version) return;
    busy = false;
    update.busy(false);
    update.failed(true);
  }

  return {
    externalOptions,
    start() {
      // Discover the actual master ladder before offering fixed choices or restoring saved quality.
      // Only supplied URLs, cached in memory for this episode; no synthesized/local playlist.
      busy = true;
      update.busy(true);
      const abort = new AbortController();
      manifestAbort = abort;
      void (async () => {
        if (player.capabilities.adaptiveBitrate) {
          const sources = streamCandidates(links.files, player.capabilities).filter((source) => source.type !== 'http').slice(0, 2);
          manifests = await Promise.all(sources.map(async (source) => {
            const manifest = await readManifest(source.url, abort.signal);
            manifestCache.set(source.url, manifest);
            return { ...source, manifest };
          }));
        }
        if (disposed || abort.signal.aborted) return;
        const available = availableQualities();
        update.qualities(available);
        if (!['auto', ...available].includes(desiredQuality)) desiredQuality = 'auto';
        await load(desiredQuality, startAt, true);
      })();
    },
    quality(id: string) {
      if (!['auto', ...availableQualities()].includes(id)) return;
      if (busy) return;
      desiredQuality = id;
      storage.set(QUALITY, id);
      void load(id, transport.position, transport.playing);
    },
    audio(id: string) {
      const tracks = player.getTracks().audio;
      const track = tracks.find((track) => track.id === id);
      if (!track) return;
      preference = { ...preference, audio: uniquePreference(tracks, track.preferenceKey)?.preferenceKey };
      restoredAudio = `${sourceVersion}:${preference.audio}`;
      save();
      player.selectAudio(id);
    },
    subtitle: chooseSubtitle,
    retry() { if (!busy) { visibilityPauseIntent = backgrounded; void load(desiredQuality, transport.position, true); } },
    dispose() { disposed = true; ++version; ++subtitleVersion; subtitleAbort?.abort(); manifestAbort?.abort(); offVisibility(); offTracks(); offTime(); offState(); offError(); void files.dispose(); },
  };
}
