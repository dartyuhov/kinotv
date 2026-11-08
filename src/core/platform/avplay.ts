import { webapis } from './tizenGlobals';

// Samsung Product API, AVPlay reference (accessed 2026-11-05):
// https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html
export interface NativeTrack {
  type: 'VIDEO' | 'AUDIO' | 'TEXT';
  index: number;
  extra_info: string;
}

export interface AvPlayListener {
  onbufferingstart?(): void;
  onbufferingcomplete?(): void;
  oncurrentplaytime?(milliseconds: number): void;
  onstreamcompleted?(): void;
  onerror?(error: string): void;
  onerrormsg?(error: string, message: string): void;
}

export interface AvPlay {
  open(url: string): void;
  close(): void;
  prepareAsync(success: () => void, error: (error: unknown) => void): void;
  setListener(listener: AvPlayListener): void;
  setDisplayRect(x: number, y: number, width: number, height: number): void;
  setDisplayMethod(method: 'PLAYER_DISPLAY_MODE_LETTER_BOX'): void;
  setStreamingProperty(property: 'ADAPTIVE_INFO', value: string): void;
  setTimeoutForBuffering(seconds: number): void;
  getState(): 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED';
  getDuration(): number;
  getCurrentTime(): number;
  play(): void;
  pause(): void;
  seekTo(milliseconds: number, success: () => void, error: (error: unknown) => void): void;
  getTotalTrackInfo(): NativeTrack[];
  getCurrentStreamInfo(): NativeTrack[];
  setSelectTrack(type: 'AUDIO' | 'TEXT', index: number): void;
  setSilentSubtitle(silent: boolean): void;
  setExternalSubtitlePath(path: string): void;
  setSubtitlePosition(milliseconds: number): void;
  suspend(): void;
  restoreAsync(url: string | null, milliseconds: number, prepare: boolean, success: () => void, error: (error: unknown) => void): void;
}

export function nativeAvPlay(): AvPlay | undefined {
  return webapis()?.avplay;
}

/** Fail closed when firmware cannot report a capability; panel UHD does not imply HEVC. */
export function nativeVideoCapabilities(): { hevc: boolean; uhd: boolean; hdr: boolean } {
  const api = webapis();
  const supported = (read: () => unknown) => {
    try { return read() === true; } catch { return false; }
  };
  return {
    hevc: supported(() => api?.systeminfo?.isSupportedVideoCodec('HEVC')),
    uhd: supported(() => api?.productinfo?.isUdPanelSupported?.()),
    hdr: supported(() => api?.avinfo?.isHdrTvSupport()),
  };
}
