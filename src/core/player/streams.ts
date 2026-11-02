import type { VideoFile } from '../api/types';
import type { PlayerCapabilities, StreamType } from './types';

/** The stream picked for a video. */
export interface PickedStream {
  url: string;
  type: StreamType;
  /** The file's quality label, e.g. "1080p". */
  quality: string;
}

const isHevc = (file: VideoFile) => /^(h265|hevc)$/i.test(file.codec);

/**
 * The "Auto" stream (research 10-kp-api §6.5): the highest-quality file the player can decode, in the
 * first stream kind it prefers that the file has. An hls4 master lists every lower rung too, so the
 * engine can still adapt. HEVC files are skipped for players without HEVC unless nothing else exists.
 * Fixed qualities and the fallback to other stream kinds come with the quality picker (ticket 08).
 */
export function pickStream(files: readonly VideoFile[], capabilities: PlayerCapabilities): PickedStream | null {
  const decodable = capabilities.hevc ? files : files.filter((f) => !isHevc(f));
  const candidates = [...(decodable.length > 0 ? decodable : files)].sort((a, b) => b.quality_id - a.quality_id);
  for (const file of candidates) {
    const urls = file.urls ?? file.url ?? {};
    for (const type of capabilities.streams) {
      const url = urls[type];
      if (url) return { url, type, quality: file.quality };
    }
  }
  return null;
}
