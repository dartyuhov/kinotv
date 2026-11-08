import { nativeAvPlay, nativeVideoCapabilities, type AvPlay, type NativeTrack } from '../platform/avplay';
import { createEmitter } from './emitter';
import { normalizeLanguage, matchManifestGroup, semanticRenditionName } from './manifestTracks';
import type { PlaybackSource, PlaybackState, PlayerAdapter, PlayerError, PlayerFactory, Tracks } from './types';

// AVPlay is a singleton, including across screen unmount/remount. Hold this lane until the native
// callback, NOT just until a UI timeout. Samsung forbids even getState/close during a pending seek.
let lane = Promise.resolve();
let owner: AvPlayAdapter | undefined;
function serialize<T>(work: () => T | Promise<T>): Promise<T> {
  const result = lane.then(work);
  lane = result.then(() => undefined, () => undefined);
  return result;
}

const emptyTracks = (): Tracks => ({ audio: [], subtitles: [], qualities: [] });
const seconds = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const cancelled: PlayerError = { kind: 'media', detail: 'AVPlay: operation superseded' };

// Never pass a vendor message through: it can contain a signed URL, headers or server response.
function playerError(error: unknown): PlayerError {
  const code = typeof error === 'string' ? error :
    error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  const known = /^(?:PLAYER_ERROR_[A-Z_]+|NotSupportedError|InvalidValuesError|InvalidAccessError|InvalidStateError|UnknownError|TimeoutError)$/;
  const safe = known.test(code) ? code : 'UnknownError';
  return {
    kind: /CONNECTION|NETWORK|TIMED_OUT|InvalidAccess|Timeout/.test(safe) ? 'network' :
      /NOT_SUPPORTED|NotSupported|INVALID_URI|InvalidValues/.test(safe) ? 'unsupported' : 'media',
    detail: `AVPlay: ${safe}`,
  };
}

/** Async prepare/restore/seek all keep the native lane until one of Samsung's callbacks fires. */
function nativeAsync(start: (ok: () => void, fail: (error: unknown) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => start(resolve, reject));
}

class AvPlayAdapter implements PlayerAdapter {
  readonly capabilities = { streams: ['hls4', 'hls2', 'hls', 'http'] as const, ...nativeVideoCapabilities(), adaptiveBitrate: true };
  private readonly events = createEmitter();
  readonly on = this.events.on;
  private readonly surface: HTMLObjectElement;
  private generation = 0;
  private destroyed = false;
  private hidden = false;
  private suspended = false;
  private reopenOnRestore = false;
  private state: PlaybackState = 'idle';
  private source?: PlaybackSource;
  private position = 0;
  private duration = 0;
  private tracks = emptyTracks();
  private audioIndexes = new Map<string, number>();
  private subtitleIndexes = new Map<string, number>();
  private pendingAudio?: string;
  private pendingSubtitle: string | null = null;
  private externalSubtitleShift = 0;
  private selectedAudio?: string;
  private selectedSubtitle: string | null = null;
  private subtitlePending = false;
  private releaseSubtitle?: () => Promise<void>;
  private lastTrackRefresh = 0;
  private trackReadQueued = false;
  private trackNotificationQueued = false;
  private pauseRevision = 0;
  private cancelLoad?: (error?: PlayerError) => void;

  constructor(host: HTMLElement, private readonly api: AvPlay) {
    const surface = document.createElement('object');
    surface.type = 'application/avplayer';
    surface.className = 'player-native-video';
    host.appendChild(surface);
    this.surface = surface;
    document.documentElement.classList.add('native-playback');
  }

  load(source: PlaybackSource, { startAt }: { startAt: number }): Promise<void> {
    if (this.destroyed) return Promise.reject(cancelled);
    this.cancelLoad?.();
    const generation = ++this.generation;
    this.source = source;
    this.position = seconds(startAt);
    this.duration = seconds(source.duration ?? 0);
    this.tracks = emptyTracks();
    this.audioIndexes.clear();
    this.subtitleIndexes.clear();
    this.pendingAudio = undefined;
    this.pendingSubtitle = null;
    this.externalSubtitleShift = 0;
    this.selectedAudio = undefined;
    this.selectedSubtitle = null;
    this.subtitlePending = false;
    this.lastTrackRefresh = 0;
    this.setState('loading');
    this.notifyTracks();
    this.events.emit('buffering', true);

    // Bound the caller's wait without violating Samsung's callback gate. A missing native callback
    // leaves the lane blocked; a timeout must never cause a competing seek/close/open.
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: PlayerError) => {
        clearTimeout(timer);
        if (this.cancelLoad === cancel) this.cancelLoad = undefined;
        if (error) reject(error); else resolve();
      };
      const cancel = (error = cancelled) => finish(error);
      this.cancelLoad = cancel;
      const timer = setTimeout(() => {
        if (!this.current(generation, false)) return;
        ++this.generation;
        const error = playerError('TimeoutError');
        this.fail(error);
        finish(error);
        // Runs only AFTER a late native callback releases the lane.
        const expiredGeneration = this.generation;
        void serialize(() => { if (this.generation === expiredGeneration) this.closeOwned(); });
      }, 30_000);

      void serialize(async () => {
        if (!this.current(generation, false)) throw cancelled;
        // A previous screen may still own the singleton, but all its native operations finished.
        this.api.close();
        await this.releaseSubtitle?.();
        this.releaseSubtitle = undefined;
        if (!this.current(generation, false)) throw cancelled;
        owner = this;
        this.suspended = false;
        this.reopenOnRestore = false;
        this.api.open(source.url);
        this.installListener(generation);
        this.api.setDisplayRect(0, 0, 1920, 1080); // Samsung coordinates, independent of UI/panel size
        this.api.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        this.api.setTimeoutForBuffering(15);
        this.api.setSilentSubtitle(true);
        if (source.type !== 'http') {
          // Samsung documents exact BITRATES plus start/seek bandwidth, in IDLE. Resolution metadata
          // is not a quality lock; preserve the original master and its alternate audio groups.
          const bandwidth = source.fixedBandwidth;
          const adaptive = bandwidth !== undefined && Number.isSafeInteger(bandwidth) && bandwidth > 0
            ? `BITRATES=${bandwidth}|STARTBITRATE=${bandwidth}|SKIPBITRATE=${bandwidth}`
            : 'STARTBITRATE=HIGHEST';
          const missingResolution = !source.manifest?.variants.length && this.capabilities.uhd;
          this.api.setStreamingProperty('ADAPTIVE_INFO', `${adaptive}${missingResolution ? '|FIXED_MAX_RESOLUTION=3840X2160' : ''}`);
        }
        await nativeAsync((ok, fail) => this.api.prepareAsync(ok, fail));
        if (!this.current(generation)) throw cancelled;
        const duration = seconds(this.api.getDuration() / 1000);
        if (duration > 0) this.duration = duration;
        if (startAt > 0) {
          const target = this.clamp(startAt);
          await nativeAsync((ok, fail) => this.api.seekTo(Math.round(target * 1000), ok, fail));
          if (!this.current(generation)) throw cancelled;
          this.position = target;
        }
        // READY is contractually paused, but NOT a valid getTotalTrackInfo state after prepareAsync.
        this.setState('paused');
        this.events.emit('buffering', false);
        this.emitTime();
      }).then(() => finish(), (error: unknown) => {
        if (this.current(generation, false)) {
          const safe = playerError(error);
          this.fail(safe);
          finish(safe);
          void serialize(() => { if (this.generation === generation) this.closeOwned(); });
        } else finish(cancelled);
      });
    });
  }

  play(): void {
    const revision = this.pauseRevision;
    this.command(() => {
      if (revision !== this.pauseRevision || this.hidden || this.suspended || this.state === 'error') return;
      const state = this.api.getState();
      if (state !== 'READY' && state !== 'PAUSED' && state !== 'PLAYING') return;
      if (state !== 'PLAYING') this.api.play();
      this.setState('playing');
      this.refreshTime();
      this.refreshTracks();
      this.applyAudio();
      this.applySubtitle();
    });
  }

  pause(): void {
    ++this.pauseRevision;
    this.command(() => {
      if (this.suspended || this.state === 'error') return;
      if (this.api.getState() === 'PLAYING') this.api.pause();
      if (this.api.getState() === 'PAUSED' || this.api.getState() === 'READY') {
        this.refreshTime();
        this.setState('paused');
      }
    });
  }

  seekTo(value: number): void {
    this.command(async () => {
      if (this.suspended || this.hidden || this.state === 'error') return;
      if (!['READY', 'PLAYING', 'PAUSED'].includes(this.api.getState())) return;
      const generation = this.generation;
      const target = this.clamp(value);
      await nativeAsync((ok, fail) => this.api.seekTo(Math.round(target * 1000), ok, fail));
      if (!this.current(generation)) return;
      this.position = target;
      this.refreshTime();
      this.emitTime();
    });
  }

  getTracks(): Tracks {
    // No native reads here: the picker can ask during an outstanding seek.
    return {
      audio: this.tracks.audio.map((t) => ({ ...t, selected: t.id === this.selectedAudio, pending: t.id === this.pendingAudio })),
      subtitles: this.tracks.subtitles.map((t) => ({ ...t, selected: t.id === this.selectedSubtitle, pending: this.subtitlePending && t.id === this.pendingSubtitle })),
      subtitlesOff: this.selectedSubtitle === null, qualities: [],
    };
  }

  selectAudio(id: string): void {
    if (!this.audioIndexes.has(id)) return;
    if (this.pendingAudio === id || (this.selectedAudio === id && this.pendingAudio === undefined)) return;
    this.pendingAudio = id;
    this.notifyTracks();
    this.command(() => this.applyAudio());
  }

  selectSubtitle(id: string | null): void {
    if (id !== null && !this.subtitleIndexes.has(id)) return;
    if ((this.subtitlePending && this.pendingSubtitle === id) || (!this.subtitlePending && this.selectedSubtitle === id)) return;
    this.pendingSubtitle = id;
    this.subtitlePending = true;
    this.notifyTracks();
    this.command(() => this.applySubtitle());
  }

  setExternalSubtitle(localPath: string, shift = 0, release?: () => Promise<void>, signal?: AbortSignal): Promise<void> {
    if (!/^\/(?!\/)/.test(localPath) || !Number.isFinite(shift)) {
      return Promise.reject({ kind: 'unsupported', detail: 'AVPlay: subtitle requires an absolute local path' } satisfies PlayerError);
    }
    const generation = this.generation;
    return serialize(async () => {
      if (!this.current(generation) || this.suspended || this.state === 'error' || signal?.aborted) throw cancelled;
      if (!['READY', 'PLAYING', 'PAUSED'].includes(this.api.getState())) throw cancelled;
      try {
        this.api.setExternalSubtitlePath(localPath);
        await this.releaseSubtitle?.();
        this.releaseSubtitle = release;
        if (!this.current(generation) || signal?.aborted) throw cancelled;
        this.externalSubtitleShift = Math.round(shift * 1000);
        // setSilentSubtitle is NOT valid in asynchronously prepared READY; apply on play instead.
        this.pendingSubtitle = 'external';
        this.subtitlePending = true;
        this.applySubtitle();
      } catch (error) { throw playerError(error); }
    }).catch(async (error: unknown) => { if (this.releaseSubtitle !== release) await release?.(); throw error; });
  }

  async selectQuality(): Promise<void> {
    // Fixed quality is a source reload owned by ticket 08, not AVPlay's VIDEO track index.
    throw { kind: 'unsupported', detail: 'AVPlay: quality requires source selection' } satisfies PlayerError;
  }

  suspend(): void {
    ++this.pauseRevision;
    this.hidden = true;
    this.command(() => {
      if (this.suspended) return;
      const state = this.api.getState();
      if (state === 'PLAYING') this.api.pause();
      if (state === 'PLAYING' || state === 'PAUSED') {
        this.refreshTime();
        this.api.suspend();
        this.suspended = true;
        this.setState('paused');
      } else if (state === 'READY') {
        // suspend() is not legal in READY. A backgrounded preparation has not played yet;
        // release it and asynchronously reopen paused at the cached position on return.
        this.closeOwned();
        this.reopenOnRestore = true;
      }
    });
  }

  restore(): void {
    this.hidden = false;
    // Keep this on the singleton lane so a preceding queued suspend can set reopenOnRestore.
    void serialize(() => {
      if (this.destroyed || !this.reopenOnRestore || !this.source) return;
      this.reopenOnRestore = false;
      void this.load(this.source, { startAt: this.position }).catch(() => undefined);
    });
    this.command(async () => {
      if (!this.suspended) return;
      const generation = this.generation;
      // We suspended PAUSED, so automatic restoration returns PAUSED, never autoplay.
      await nativeAsync((ok, fail) => this.api.restoreAsync(null, Math.round(this.position * 1000), false, ok, fail));
      if (!this.current(generation)) return;
      this.suspended = false;
      if (this.api.getState() === 'PLAYING') this.api.pause();
      this.refreshTime();
      this.refreshTracks();
      this.subtitlePending = this.pendingSubtitle !== null;
      this.applySubtitle();
      this.setState('paused');
      this.events.emit('buffering', false);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    ++this.generation;
    this.cancelLoad?.();
    this.events.clear();
    this.surface.remove();
    if (!document.querySelector('.player-native-video')) document.documentElement.classList.remove('native-playback');
    void serialize(() => this.closeOwned());
  }

  private closeOwned(): void {
    if (owner !== this) return;
    try { this.api.setListener({}); } catch { /* close still releases the native pipeline */ }
    try { this.api.close(); } catch { /* no vendor message is logged */ }
    void this.releaseSubtitle?.();
    this.releaseSubtitle = undefined;
    owner = undefined;
  }

  private current(generation: number, owned = true): boolean {
    return !this.destroyed && generation === this.generation && (!owned || owner === this);
  }

  private command(work: () => void | Promise<void>): void {
    const generation = this.generation;
    void serialize(async () => {
      if (!this.current(generation) || this.state === 'error') return;
      const timer = setTimeout(() => {
        if (!this.current(generation)) return;
        ++this.generation;
        this.fail(playerError('TimeoutError'));
        const expiredGeneration = this.generation;
        void serialize(() => { if (this.generation === expiredGeneration) this.closeOwned(); });
      }, 30_000);
      try { await work(); } finally { clearTimeout(timer); }
    }).catch((error: unknown) => {
      if (!this.current(generation)) return;
      ++this.generation;
      this.fail(playerError(error));
      const failedGeneration = this.generation;
      void serialize(() => { if (this.generation === failedGeneration) this.closeOwned(); });
    });
  }

  private installListener(generation: number): void {
    const active = () => this.current(generation) && this.state !== 'error';
    const failure = (error: unknown) => {
      if (!active()) return;
      const safe = playerError(error);
      ++this.generation; // invalidate an in-flight prepare/seek completion, too
      this.cancelLoad?.(safe);
      this.fail(safe);
      const failedGeneration = this.generation;
      void serialize(() => { if (this.generation === failedGeneration) this.closeOwned(); });
    };
    this.api.setListener({
      onbufferingstart: () => { if (active()) this.events.emit('buffering', true); },
      onbufferingcomplete: () => {
        if (!active()) return;
        this.events.emit('buffering', false);
        this.queueTrackRead();
      },
      oncurrentplaytime: (milliseconds) => {
        if (!active() || this.suspended || this.state === 'loading') return;
        this.position = seconds(milliseconds / 1000);
        this.emitTime(); // callback only updates cached values; no API call during a seek
        if (Date.now() - this.lastTrackRefresh > 5_000) {
          this.lastTrackRefresh = Date.now();
          // Width may become known after play(), or change under Auto. Queue all reads behind seeks.
          this.queueTrackRead();
        }
      },
      onstreamcompleted: () => {
        if (!active()) return;
        this.events.emit('buffering', false);
        this.setState('ended');
        this.events.emit('ended', undefined);
      },
      onerror: failure,
      onerrormsg: (error) => failure(error), // intentionally ignore vendor message
    });
  }

  private refreshTime(): void {
    const duration = seconds(this.api.getDuration() / 1000);
    if (duration > 0) this.duration = duration;
    this.position = seconds(this.api.getCurrentTime() / 1000);
    this.emitTime();
  }

  private clamp(value: number): number {
    return Math.min(seconds(value), this.duration > 0 ? Math.max(0, this.duration - 0.1) : Infinity);
  }

  private refreshTracks(): void {
    if (!['PLAYING', 'PAUSED'].includes(this.api.getState())) return;
    let native: NativeTrack[];
    try { native = this.api.getTotalTrackInfo(); } catch { return; }
    let videoWidth = 0;
    const extra = (track: NativeTrack): Record<string, unknown> => {
      try { return JSON.parse(track.extra_info) as Record<string, unknown>; } catch { return {}; }
    };
    try {
      const current = this.api.getCurrentStreamInfo();
      const video = current.find((track) => track.type === 'VIDEO');
      if (video) videoWidth = Number(extra(video).Width) || 0;
      const audio = current.find((track) => track.type === 'AUDIO' && track.index >= 0);
      if (audio) {
        const selected = `${this.generation}:AUDIO:${audio.index}`;
        if (selected !== this.selectedAudio) {
          this.selectedAudio = selected;
            this.notifyTracks();
        }
      }
    } catch { /* selection remains known from successful commands */ }
    const tracks = emptyTracks();
    this.audioIndexes.clear();
    this.subtitleIndexes.clear();
    const mapped = new Map<number, import('./manifestTracks').ManifestTrack>();
    for (const type of ['AUDIO', 'TEXT'] as const) {
      const ordered = native.filter((track) => track.type === type).sort((a, b) => a.index - b.index);
      const semantic = ordered.map((track) => {
        const info = extra(track);
        const channels = Number(info.channels);
        return { lang: normalizeLanguage(String(info.language ?? info.track_lang ?? '')), ...(channels > 0 ? { channels } : {}) };
      });
      const group = this.source?.manifest ? matchManifestGroup(this.source.manifest, type, videoWidth, semantic) : [];
      group.forEach((rendition, index) => { if (rendition) mapped.set(ordered[index]!.index, rendition); });
    }
    for (const track of native) {
      if (track.type !== 'AUDIO' && track.type !== 'TEXT') continue;
      if (!Number.isInteger(track.index) || track.index < 0) continue;
      let info: Record<string, unknown> = {};
      try { const parsed: unknown = JSON.parse(track.extra_info); if (parsed && typeof parsed === 'object') info = parsed as Record<string, unknown>; } catch { /* optional metadata */ }
      const rawLang = info.language ?? info.track_lang;
      const lang = typeof rawLang === 'string' ? normalizeLanguage(rawLang) : 'unk';
      const rendition = mapped.get(track.index);
      const semanticName = rendition ? semanticRenditionName(rendition.name) : '';
      const semanticUnique = semanticName && [...mapped.values()].filter((other) => other.type === track.type &&
        other.lang === lang && semanticRenditionName(other.name) === semanticName).length === 1;
      const id = `${this.generation}:${track.type}:${track.index}`;
      if (track.type === 'AUDIO') {
        // Indexes in API details are source/container indexes, NOT AVPlay indexes. Only enrich when
        // language uniquely identifies a service track; do not guess dubbing from array position.
        const matches = this.source?.audios?.filter((a) => a.lang === lang) ?? [];
        const unique = lang !== 'unk' && native.filter((t) => {
          if (t.type !== 'AUDIO') return false;
          try { return normalizeLanguage(JSON.parse(t.extra_info).language ?? '') === lang; } catch { return false; }
        }).length === 1;
        const meta = unique && matches.length === 1 ? matches[0] : undefined;
        const label = [lang, rendition?.name, meta?.type?.title, meta?.author?.title].filter(Boolean).join(' · ');
        tracks.audio.push({ id, lang, label: `${label} · ${tracks.audio.length + 1}`, preferenceKey: semanticUnique ? `hls:${lang}:${semanticName}:${rendition?.channels ?? ''}` : unique ? (meta ? `${lang}:${meta.type?.id ?? ''}:${meta.author?.id ?? ''}` : `language:${lang}`) : undefined });
        this.audioIndexes.set(id, track.index);
      } else {
        const matches = this.source?.subtitles?.filter((s) => s.embed && s.lang === lang) ?? [];
        const meta = matches.length === 1 ? matches[0] : undefined;
        tracks.subtitles.push({ id, lang, label: `${lang}${rendition ? ` · ${rendition.name}` : ''} · ${tracks.subtitles.length + 1}`,
          preferenceKey: semanticUnique ? `hls:${lang}:${semanticName}` : meta && lang !== 'unk' && native.filter((t) => {
            if (t.type !== 'TEXT') return false;
            try { return normalizeLanguage(JSON.parse(t.extra_info).track_lang ?? '') === lang; } catch { return false; }
          }).length === 1 ? `${lang}:${meta.forced ? 'forced' : 'full'}` : undefined });
        this.subtitleIndexes.set(id, track.index);
      }
    }
    if (JSON.stringify(this.tracks) !== JSON.stringify(tracks)) {
      this.tracks = tracks;
      this.notifyTracks();
    }
  }

  private applyAudio(): void {
    if (this.suspended || this.api.getState() !== 'PLAYING') return; // AUDIO cannot switch in PAUSED
    const index = this.pendingAudio === undefined ? undefined : this.audioIndexes.get(this.pendingAudio);
    if (index === undefined) return;
    this.api.setSelectTrack('AUDIO', index);
    this.selectedAudio = this.pendingAudio;
    this.pendingAudio = undefined;
    this.notifyTracks();
  }

  private applySubtitle(): void {
    if (!this.subtitlePending) return;
    if (this.suspended || !['PLAYING', 'PAUSED'].includes(this.api.getState())) return;
    if (this.pendingSubtitle === null) this.api.setSilentSubtitle(true);
    else if (this.pendingSubtitle === 'external') {
      this.api.setSubtitlePosition(this.externalSubtitleShift);
      this.api.setSilentSubtitle(false);
    }
    else {
      const index = this.subtitleIndexes.get(this.pendingSubtitle);
      if (index === undefined) return;
      this.api.setSelectTrack('TEXT', index);
      this.api.setSilentSubtitle(false);
    }
    this.selectedSubtitle = this.pendingSubtitle;
    this.subtitlePending = false;
    this.notifyTracks();
  }

  private notifyTracks(): void {
    if (this.trackNotificationQueued || this.destroyed) return;
    this.trackNotificationQueued = true;
    const generation = this.generation;
    queueMicrotask(() => {
      this.trackNotificationQueued = false;
      if (this.current(generation)) this.events.emit('tracks', undefined);
    });
  }

  private queueTrackRead(): void {
    if (this.trackReadQueued || this.destroyed) return;
    this.trackReadQueued = true;
    const generation = this.generation;
    // At most one read waits behind an outstanding seek/restore, even if callbacks keep arriving.
    void serialize(() => {
      try {
        if (this.current(generation) && !this.suspended && this.state !== 'loading' && this.state !== 'error') this.refreshTracks();
      } finally { this.trackReadQueued = false; }
    }).catch(() => undefined);
  }

  private emitTime(): void { this.events.emit('time', { position: this.position, duration: this.duration }); }

  private setState(state: PlaybackState): void {
    if (this.state === state) return;
    this.state = state;
    this.events.emit('state', state);
  }

  private fail(error: PlayerError): void {
    this.setState('error');
    this.events.emit('buffering', false);
    this.events.emit('error', error);
  }
}

export const avplayFactory: PlayerFactory = {
  name: 'avplay',
  available: () => nativeAvPlay() !== undefined,
  create(host) {
    const api = nativeAvPlay();
    if (!api) throw new Error('AVPlay unavailable');
    return new AvPlayAdapter(host, api);
  },
};
