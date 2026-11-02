import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WatchedVideo } from '../../../core/api/client';
import type { ItemDetails, Video } from '../../../core/api/types';
import { findVideo } from '../../../core/catalog/findVideo';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { remoteBus } from '../../../core/input/remoteBus';
import { onVisibilityChange } from '../../../core/platform/lifecycle';
import { createScrubber } from '../../../core/player/scrubber';
import { pickStream } from '../../../core/player/streams';
import type { PlayerAdapter } from '../../../core/player/types';
import type { ProgressReporter } from '../../../core/sync/progressReporter';
import { itemQuery } from '../../app/queries';
import { screenStack, type ScreenParams } from '../../nav/stack';
import { useBackHandler } from '../../nav/useBackHandler';
import { playEpisode, useEpisodeNeighbours } from './episodeSwitch';
import { NextEpisodeCard } from './NextEpisodeCard';
import { PlayerControls } from './PlayerControls';
import { PlayerUiContext, useControlsVisibility, useKeyCaptures, type PlayerUi } from './playerUi';
import { mediaLinksQuery, showSavedPosition, startProgressSync } from './progressSync';
import { usePlaybackSnapshot, usePlayerAdapter } from './usePlayback';
import './PlayerScreen.css';

/**
 * The player (spec §5.3). It plays the video the params point at through this platform's PlayerAdapter,
 * on the "Auto" stream, from `startAt`.
 *
 * Remote: OK / ⏯ play and pause; ◀▶ seek, faster while held; ⏪ ⏩ −10 s / +30 s; ⏹ leave. Any key shows
 * the controls, which hide after 4 s while playing. Back hides the controls, then leaves. Overlay layers
 * (settings panel, next-episode card) mount inside PlayerUiContext and take Back first (see playerUi.ts).
 *
 * Progress goes to kino.watch every 30 s and on pause, exit and the app going to the background; at 90%
 * the video is marked watched (core/sync/progressReporter.ts, wired in ./progressSync.ts). Back from
 * the background, the player is paused with the controls showing.
 */
export function PlayerScreen({ params }: { params: ScreenParams['player'] }) {
  const { itemId, season, episode, startAt } = params;
  const item = useQuery(itemQuery(itemId));
  const video = useMemo(() => (item.data ? findVideo(item.data, season, episode) : null), [item.data, season, episode]);
  const links = useQuery({ ...mediaLinksQuery(video?.id ?? -1), enabled: video !== null });
  const episodes = useEpisodeNeighbours(item.data, season, episode);
  const latestEpisodes = useRef(episodes);
  latestEpisodes.current = episodes;

  const hostRef = useRef<HTMLDivElement>(null);
  const player = usePlayerAdapter(hostRef);
  const playback = usePlaybackSnapshot(player);
  const latest = useRef(playback);
  latest.current = playback;

  const stream = useMemo(() => (links.data && player ? pickStream(links.data.files, player.capabilities) : null), [links.data, player]);
  // Effects below key on the video's numbers, not the object, so a refetch of the details never
  // reloads the stream or restarts progress sync.
  const videoNumber = video?.number;
  const durationHint = video?.duration;
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    if (!player || !stream) return;
    let current = true;
    player.load({ ...stream, duration: durationHint }, { startAt }).then(
      () => current && player.play(),
      () => current && setLoadFailed(true),
    );
    return () => {
      current = false;
    };
  }, [player, stream, durationHint, startAt]);

  const where = useMemo<WatchedVideo | null>(
    () => (videoNumber === undefined ? null : { id: itemId, season, video: videoNumber }),
    [itemId, season, videoNumber],
  );
  const progress = useProgressSync(player, where, startAt);

  const [preview, setPreview] = useState<number | null>(null);
  const scrubber = useMemo(
    () =>
      player &&
      createScrubber({
        position: () => latest.current.position,
        duration: () => latest.current.duration,
        onPreview: setPreview,
        seek: (to) => player.seekTo(to),
      }),
    [player],
  );
  useEffect(() => () => scrubber?.dispose(), [scrubber]);

  const captures = useKeyCaptures();
  const controls = useControlsVisibility({ playing: playback.state === 'playing', hold: captures.captured || preview !== null });

  const failed =
    item.isError ||
    (item.isSuccess && !video) ||
    links.isError ||
    (links.isSuccess && player !== null && !stream) ||
    loadFailed ||
    playback.state === 'error';

  // Keys other than Back. Layers that captured the remote get them instead (usePlayerKeyCapture).
  const { show: showControls } = controls;
  const { isCaptured } = captures;
  useEffect(() => {
    if (!player || !scrubber) return;
    return remoteBus.subscribe((key) => {
      if (isCaptured()) return;
      showControls();
      const { state } = latest.current;
      if (state !== 'playing' && state !== 'paused') return;
      switch (key) {
        case 'ok':
        case 'playPause':
          if (state === 'playing') player.pause();
          else player.play();
          return;
        case 'play':
          return player.play();
        case 'pause':
          return player.pause();
        case 'left':
          return scrubber.step(-1);
        case 'right':
          return scrubber.step(1);
        case 'rewind':
          return scrubber.jump(-10);
        case 'fastForward':
          return scrubber.jump(30);
        case 'stop':
          screenStack.pop();
          return;
        case 'channelUp':
        case 'channelDown': {
          // The next or previous episode (none at the ends: the key just shows the controls).
          const to = key === 'channelUp' ? latestEpisodes.current.next : latestEpisodes.current.previous;
          if (to) playEpisode(itemId, to, progress.current);
          return;
        }
        // ▲ settings panel (ticket 08), ▼ info, CH ▲▼ channels (ticket 16): not yet.
      }
    });
  }, [player, scrubber, showControls, isCaptured, itemId, progress]);

  // Back: layers above take it first; then hide the controls; then leave (the navigator pops).
  useBackHandler(() => {
    if (controls.visible && !failed) {
      controls.hide();
      return true;
    }
    return false;
  });

  // Home or standby: pause and save at once (timers stop in standby); back, show the paused controls.
  useEffect(() => {
    if (!player) return;
    return onVisibilityChange((visible) => {
      if (!visible) {
        player.pause();
        void progress.current?.flush();
        player.suspend?.();
      } else {
        player.restore?.();
        showControls();
      }
    });
  }, [player, progress, showControls]);

  // The end of the video leaves the player, unless there is a next episode: NextEpisodeCard owns it then.
  const hasNext = episodes.next !== null;
  useEffect(() => {
    if (playback.state === 'ended' && !hasNext) screenStack.pop();
  }, [playback.state, hasNext]);

  const ui = useMemo<PlayerUi | null>(
    () =>
      player && {
        player,
        playback,
        controlsVisible: controls.visible,
        showControls,
        hideControls: controls.hide,
        captureKeys: captures.capture,
      },
    [player, playback, controls.visible, showControls, controls.hide, captures.capture],
  );

  const labels = item.data && video ? titleLines(item.data, video, season) : null;
  const waiting = !failed && (playback.state === 'idle' || playback.state === 'loading' || playback.buffering);

  return (
    <div className="player">
      <div ref={hostRef} className="player__video" />
      {waiting && <div className="player__spinner" role="status" aria-label={t('player.loading')} />}
      {failed ? (
        <div className="player__message" role="alert">
          <p className="player__message-title">{t('player.cantPlay')}</p>
          <p>{t('player.backToLeave')}</p>
        </div>
      ) : (
        ui &&
        labels && (
          <PlayerUiContext.Provider value={ui}>
            <PlayerControls
              visible={controls.visible}
              eyebrow={labels.eyebrow}
              title={labels.title}
              position={playback.position}
              duration={playback.duration || video!.duration}
              preview={preview}
              hint={t('player.hint')}
            />
            {/* Overlay layers go here: the settings panel (ticket 08), the next-episode card (ticket 09). */}
            {episodes.next && (
              <NextEpisodeCard
                label={episodes.next.label}
                onPlay={() => playEpisode(itemId, episodes.next!, progress.current)}
                onLeave={() => screenStack.pop()}
              />
            )}
          </PlayerUiContext.Provider>
        )
      )}
    </div>
  );
}

/**
 * Saves progress for as long as the video plays (see ./progressSync.ts). On leaving, the last position
 * is saved and shown on the title page at once. Returns the reporter, for saving on demand.
 */
function useProgressSync(player: PlayerAdapter | null, where: WatchedVideo | null, startAt: number) {
  const reporter = useRef<ProgressReporter | null>(null);
  useEffect(() => {
    if (!player || !where) return;
    const sync = startProgressSync(where, startAt);
    reporter.current = sync;
    let last = { position: startAt, duration: 0 };
    const offs = [
      player.on('time', ({ position, duration }) => {
        last = { position, duration };
        sync.position(position, duration);
      }),
      player.on('state', (state) => sync.playing(state === 'playing')),
    ];
    return () => {
      offs.forEach((off) => off());
      sync.dispose();
      reporter.current = null;
      if (Math.floor(last.position) !== Math.floor(startAt)) showSavedPosition(where, last.position, last.duration);
      void sync.flush();
    };
  }, [player, where, startAt]);
  return reporter;
}

/** The title and the small line above it, as in the mockup: "Тихая гавань · S1 · E3" over "Старые письма". */
function titleLines(item: ItemDetails, video: Video, season: number | undefined): { eyebrow?: string; title: string } {
  const name = splitTitle(item.title).title;
  if (season !== undefined) {
    const where = t('card.episode', { season, episode: video.number });
    return video.title ? { eyebrow: t('player.eyebrow', { title: name, where }), title: video.title } : { eyebrow: where, title: name };
  }
  if ((item.videos?.length ?? 0) > 1) return { eyebrow: t('player.part', { n: video.number }), title: name };
  return { title: name };
}
