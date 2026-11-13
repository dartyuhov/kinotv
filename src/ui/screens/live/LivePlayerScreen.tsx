import { useEffect, useRef, useState } from 'react';
import { t } from '../../../core/i18n';
import { api } from '../../../core/services';
import { remoteBus } from '../../../core/input/remoteBus';
import { onVisibilityChange } from '../../../core/platform/lifecycle';
import { createPlayer } from '../../../core/player/createPlayer';
import type { PlayerAdapter, PlaybackState } from '../../../core/player/types';
import { screenStack, type ScreenParams } from '../../nav/stack';
import { useBackHandler } from '../../nav/useBackHandler';
import { useControlsVisibility } from '../player/playerUi';
import '../player/PlayerScreen.css';
import './live.css';

/** Live owns one disposable adapter lifetime; it never enters VOD progress or restore paths. */
export function LivePlayerScreen({ params }: { params: ScreenParams['livePlayer'] }) {
  const host = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(t('live.channel', { id: params.channelId }));
  const [state, setState] = useState<PlaybackState>('loading');
  const [buffering, setBuffering] = useState(false);
  const [failure, setFailure] = useState<'unavailable' | 'ended' | 'failed' | null>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const commands = useRef<{ start(): void; switch(direction: number): void; player(): PlayerAdapter | undefined }>({ start() {}, switch() {}, player: () => undefined });
  const currentState = useRef(state);
  currentState.current = state;
  const controls = useControlsVisibility({ playing: state === 'playing', hold: !!failure });

  useEffect(() => {
    let active = true;
    let visible = document.visibilityState !== 'hidden';
    let generation = 0;
    let switchGeneration = 0;
    let player: PlayerAdapter | undefined;
    let off: Array<() => void> = [];
    const release = () => {
      off.forEach((unsubscribe) => unsubscribe());
      off = [];
      player?.destroy();
      player = undefined;
    };
    const start = async (autoplay: boolean) => {
      if (!active || !visible) return;
      const request = ++generation;
      ++switchGeneration;
      release();
      setState('loading'); setFailure(null); setBuffering(false);
      const current = () => active && visible && request === generation;
      try {
        const channels = await api.tvChannels();
        if (!current()) return;
        const channel = channels.find((c) => c.id === params.channelId);
        if (channel) setTitle(channel.title);
        if (!channel || channel.playback.kind !== 'hls') { setFailure('unavailable'); setState('error'); return; }
        const created = createPlayer(host.current!);
        player = created;
        off = [created.on('state', (next) => { if (current()) setState(next); }),
          created.on('buffering', (next) => { if (current()) setBuffering(next); }),
          created.on('error', () => { if (current()) { ++generation; setFailure('failed'); setState('error'); } }),
          created.on('ended', () => { if (current()) { ++generation; setFailure('ended'); setState('ended'); } })];
        await created.load({ url: channel.playback.url, type: 'hls' }, { startAt: 0 });
        if (!current()) return;
        if (autoplay) created.play();
      } catch { if (current()) { setFailure('failed'); setState('error'); } }
    };
    const switchChannel = async (direction: number) => {
      const index = params.lineupIds.indexOf(params.channelId);
      if (!active || !visible || index < 0 || !params.lineupIds[index + direction]) return;
      const request = ++switchGeneration;
      // Invalidate pending autoplay immediately, including while a fresh switch list is in flight.
      ++generation;
      release();
      setState('loading'); setFailure(null); setBuffering(false);
      try {
        const channels = await api.tvChannels();
        if (!active || !visible || request !== switchGeneration) return;
        for (let i = index + direction; i >= 0 && i < params.lineupIds.length; i += direction) {
          const target = channels.find((c) => c.id === params.lineupIds[i] && c.playback.kind === 'hls');
          if (target) { screenStack.replace('livePlayer', { ...params, channelId: target.id }); return; }
        }
        // All neighbors vanished: remain on this channel, paused at a fresh default live start.
        void start(false);
      } catch { if (active && visible && request === switchGeneration) { setFailure('failed'); setState('error'); } }
    };
    commands.current = { start: () => void start(true), switch: (direction) => void switchChannel(direction), player: () => player };
    if (visible) void start(true);
    const unsubscribe = onVisibilityChange((next) => {
      if (next === visible) return;
      visible = next;
      ++generation; ++switchGeneration;
      release();
      controls.show();
      if (visible) void start(false);
    });
    return () => { active = false; ++generation; ++switchGeneration; unsubscribe(); release(); };
  }, [params, controls.show]);

  useEffect(() => { if (failure) retry.current?.focus(); }, [failure]);
  useEffect(() => remoteBus.subscribe((key) => {
    controls.show();
    if (key === 'stop') { screenStack.pop(); return; }
    if (key === 'channelUp' || key === 'channelDown') { commands.current.switch(key === 'channelUp' ? 1 : -1); return; }
    if (failure) { if (key === 'ok' || key === 'play') commands.current.start(); return; }
    const player = commands.current.player();
    if (!player || !['playing', 'paused'].includes(currentState.current)) return;
    if (key === 'ok' || key === 'playPause') {
      if (currentState.current === 'playing') player.pause(); else player.play();
    } else if (key === 'play') player.play();
    else if (key === 'pause') player.pause();
    // Deliberately no scrubber, time subscriptions, saved position, or seek keys.
  }), [failure, controls.show]);
  useBackHandler(() => {
    if (controls.visible && !failure) { controls.hide(); return true; }
    return false;
  });

  return <div className="player">
    <div ref={host} className="player__video" />
    {!failure && (state === 'loading' || buffering) && <div className="player__spinner" role="status" aria-label={t('player.loading')} />}
    {failure ? <div className="player__message" role="alert">
      <p className="player__message-title">{t(failure === 'ended' ? 'live.ended' : failure === 'unavailable' ? 'live.unavailable' : 'player.cantPlay')}</p>
      <p>{t('player.backToLeave')}</p>
      <button ref={retry} className="player-retry" onClick={() => commands.current.start()}>{t('player.retry')}</button>
    </div> : <div className="live-controls" hidden={!controls.visible}>
      <span className="live-controls__label">{t('live.label')}</span>
      <h1>{title}</h1><p>{t('live.hint')}</p>
    </div>}
  </div>;
}
