import { createEmitter } from './emitter';
import type { PlaybackSource, PlaybackState, PlayerAdapter, PlayerCapabilities, PlayerError, PlayerFactory, Tracks } from './types';

// The desktop development player (spec §3): a plain <video> element.
//
// No hls.js. Chrome on the desktop plays HLS natively (canPlayType('application/vnd.apple.mpegurl') is
// "maybe" in current Chrome), so it gets kino.watch's HLS streams. A browser without native HLS gets
// the progressive MP4 (`http`) stream instead. That keeps hls.js (~120 KB gzipped) out of the single
// TV bundle, which can't code-split (see tools/tizen/vitePlugin.ts).
//
// Desktop playback is for development only: audio and subtitle switching (ticket 08) are not wired up
// here because Chrome exposes no audio tracks for <video> without a flag.

const HLS_MIME = 'application/vnd.apple.mpegurl';

function capabilitiesOf(video: HTMLVideoElement): PlayerCapabilities {
  const hls = video.canPlayType(HLS_MIME) !== '';
  const hevc = video.canPlayType('video/mp4; codecs="hvc1.1.6.L120.90"') !== '';
  return { streams: hls ? ['hls4', 'hls2', 'hls', 'http'] : ['http'], hevc };
}

function errorOf(video: HTMLVideoElement): PlayerError {
  const code = video.error?.code;
  if (code === MediaError.MEDIA_ERR_NETWORK) return { kind: 'network', detail: 'MEDIA_ERR_NETWORK' };
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return { kind: 'unsupported', detail: 'MEDIA_ERR_SRC_NOT_SUPPORTED' };
  return { kind: 'media', detail: `MEDIA_ERR ${code ?? 'unknown'}` };
}

class Html5Adapter implements PlayerAdapter {
  readonly capabilities: PlayerCapabilities;
  private readonly video: HTMLVideoElement;
  private readonly events = createEmitter();
  readonly on = this.events.on;
  private state: PlaybackState = 'idle';
  private durationHint = 0;
  private readonly unlisten: Array<() => void> = [];

  constructor(host: HTMLElement) {
    const video = document.createElement('video');
    video.className = 'player-video';
    video.playsInline = true;
    video.preload = 'auto';
    host.appendChild(video);
    this.video = video;
    this.capabilities = capabilitiesOf(video);

    const listen = (type: string, fn: () => void) => {
      video.addEventListener(type, fn);
      this.unlisten.push(() => video.removeEventListener(type, fn));
    };
    listen('timeupdate', () => this.emitTime());
    listen('seeked', () => this.emitTime());
    listen('durationchange', () => this.emitTime());
    listen('waiting', () => this.events.emit('buffering', true));
    listen('playing', () => {
      this.events.emit('buffering', false);
      this.setState('playing');
    });
    listen('canplay', () => this.events.emit('buffering', false));
    listen('pause', () => {
      if (!video.ended) this.setState('paused');
    });
    listen('ended', () => {
      this.setState('ended');
      this.events.emit('ended', undefined);
    });
    listen('error', () => {
      if (this.state === 'loading') return; // load() reports it
      this.setState('error');
      this.events.emit('error', errorOf(video));
    });
  }

  load(source: PlaybackSource, { startAt }: { startAt: number }): Promise<void> {
    const { video } = this;
    this.durationHint = source.duration ?? 0;
    this.setState('loading');
    return new Promise<void>((resolve, reject) => {
      const done = () => {
        video.removeEventListener('loadedmetadata', onMeta);
        video.removeEventListener('error', onError);
      };
      const onMeta = () => {
        done();
        if (startAt > 0) video.currentTime = startAt;
        this.setState('paused');
        this.events.emit('tracks', undefined);
        this.emitTime();
        resolve();
      };
      const onError = () => {
        done();
        this.setState('error');
        reject(errorOf(video));
      };
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('error', onError);
      video.src = source.url;
      video.load();
    });
  }

  play(): void {
    // Autoplay rules can refuse a start without a user gesture; the state simply stays paused.
    void this.video.play().catch(() => this.setState('paused'));
  }

  pause(): void {
    this.video.pause();
  }

  seekTo(seconds: number): void {
    this.video.currentTime = Math.max(0, seconds);
  }

  getTracks(): Tracks {
    return { audio: [], subtitles: [], qualities: [] };
  }

  selectAudio(): void {}

  selectSubtitle(): void {}

  async selectQuality(): Promise<void> {}

  destroy(): void {
    for (const off of this.unlisten.splice(0)) off();
    this.events.clear();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
  }

  private duration(): number {
    const d = this.video.duration;
    return Number.isFinite(d) && d > 0 ? d : this.durationHint;
  }

  private emitTime(): void {
    this.events.emit('time', { position: this.video.currentTime, duration: this.duration() });
  }

  private setState(state: PlaybackState): void {
    if (this.state === state) return;
    this.state = state;
    this.events.emit('state', state);
  }
}

export const html5Factory: PlayerFactory = {
  name: 'html5',
  available: () => typeof document !== 'undefined',
  create: (host) => new Html5Adapter(host),
};
