import type { VideoFile } from '../api/types';
import type { PlayerCapabilities, StreamType } from './types';

/** The stream picked for a video. */
export interface PickedStream {
  url: string;
  type: StreamType;
  /** The file's quality label, e.g. "1080p". */
  quality: string;
}

const isHevc = (file: VideoFile) => /^(h[.-]?265|hevc|hev1|hvc1)$/i.test(file.codec);
const resolution = (file: VideoFile) => Number.parseInt(file.quality, 10) || file.h || [0, 480, 720, 1080, 2160][file.quality_id] || 0;

/**
 * The "Auto" stream (research 10-kp-api §6.5): the highest-quality file the player can decode, in the
 * first stream kind it prefers that the file has. An hls4 master lists every lower rung too, so the
 * engine can still adapt. Unsupported HEVC/UHD files are never offered as playable candidates.
 */
export function pickStream(files: readonly VideoFile[], capabilities: PlayerCapabilities): PickedStream | null {
  return streamCandidates(files, capabilities)[0] ?? null;
}

/** Ordered and deduplicated; callers bound startup attempts, without guessing stream URL suffixes. */
export function streamCandidates(files: readonly VideoFile[], capabilities: PlayerCapabilities): PickedStream[] {
  const candidates = files.filter((f) => (capabilities.hevc || !isHevc(f)) &&
    (capabilities.uhd !== false || (resolution(f) <= 1080 && f.w <= 1920)) &&
    (!f.codec || /^(h[.-]?264|avc|avc1)$/i.test(f.codec) || isHevc(f)))
    .sort((a, b) => resolution(b) - resolution(a) || b.quality_id - a.quality_id);
  const result: PickedStream[] = [];
  const seen = new Set<string>();
  for (const file of candidates) {
    const urls = { ...file.url, ...file.urls };
    for (const type of capabilities.streams) {
      const url = urls[type];
      if (typeof url === 'string' && /^https?:\/\//i.test(url) && !seen.has(url)) {
        seen.add(url);
        result.push({ url, type, quality: file.quality });
      }
    }
  }
  return result;
}
