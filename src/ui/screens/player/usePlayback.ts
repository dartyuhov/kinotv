import { useEffect, useState, type RefObject } from 'react';
import { createPlayer } from '../../../core/player/createPlayer';
import type { PlaybackState, PlayerAdapter, PlayerError } from '../../../core/player/types';

/** What the screen renders from: the player's latest events. Times are seconds. */
export interface PlaybackSnapshot {
  state: PlaybackState;
  position: number;
  duration: number;
  buffering: boolean;
  error: PlayerError | null;
}

const INITIAL: PlaybackSnapshot = { state: 'idle', position: 0, duration: 0, buffering: false, error: null };

/** Creates this platform's player in `host` for as long as the component is mounted. */
export function usePlayerAdapter(host: RefObject<HTMLElement | null>): PlayerAdapter | null {
  const [player, setPlayer] = useState<PlayerAdapter | null>(null);
  useEffect(() => {
    const created = createPlayer(host.current!);
    setPlayer(created);
    return () => created.destroy();
  }, [host]);
  return player;
}

/** The player's state, position, buffering and error, kept up to date from its events. */
export function usePlaybackSnapshot(player: PlayerAdapter | null): PlaybackSnapshot {
  const [snapshot, setSnapshot] = useState(INITIAL);
  useEffect(() => {
    if (!player) return;
    const update = (patch: Partial<PlaybackSnapshot>) => setSnapshot((s) =>
      (Object.keys(patch) as Array<keyof PlaybackSnapshot>).every((key) => s[key] === patch[key]) ? s : { ...s, ...patch });
    const offs = [
      // AVPlay can report subsecond time frequently. Labels/countdowns use whole
      // seconds; progress sync and source coordination keep their own precise
      // subscriptions. Don't render the entire player tree on every native tick.
      player.on('time', ({ position, duration }) => setSnapshot((s) =>
        Math.floor(s.position) === Math.floor(position) && s.duration === duration ? s : { ...s, position, duration })),
      player.on('state', (state) => update(state === 'error' ? { state } : { state, error: null })),
      player.on('buffering', (buffering) => update({ buffering })),
      player.on('error', (error) => update({ state: 'error', error })),
    ];
    return () => offs.forEach((off) => off());
  }, [player]);
  return snapshot;
}
