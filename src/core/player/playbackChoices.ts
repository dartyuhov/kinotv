import type { VideoFile } from '../api/types';
import { streamCandidates, type PickedStream } from './streams';
import type { PlayerCapabilities } from './types';
import type { ManifestInfo } from './manifestTracks';

export interface SourceChoice extends PickedStream { fixed: boolean; fixedBandwidth?: number; manifest?: ManifestInfo; inspectBeforeLoad?: boolean }
export interface HlsManifestSource extends PickedStream { manifest: ManifestInfo }
export const qualityHeight = (quality: string) => Number.parseInt(quality, 10) || 0;

/** Native fixed choices come from the actual master ladder, never its service file-row label. */
export function fixedQualities(files: readonly VideoFile[], capabilities: PlayerCapabilities, manifests: readonly HlsManifestSource[] = []): string[] {
  if (capabilities.adaptiveBitrate && streamCandidates(files, capabilities).some((source) => source.type !== 'http')) {
    return [...new Set(hlsFixedChoices(manifests, capabilities).map((s) => s.quality))]
      .sort((a, b) => qualityHeight(b) - qualityHeight(a));
  }
  return [...new Set(streamCandidates(files, capabilities).filter((s) => s.type === 'http').map((s) => s.quality))]
    .filter((quality) => qualityHeight(quality) > 0).sort((a, b) => qualityHeight(b) - qualityHeight(a));
}

/** Bound each resolution to two adaptive alternatives plus its encoded file, then descend. */
export function fallbackChoices(files: readonly VideoFile[], capabilities: PlayerCapabilities, preference: string, manifests: readonly HlsManifestSource[] = []): SourceChoice[] {
  const inspected = new Set(manifests.map((source) => source.url));
  // Remaining supplied masters are inspected lazily. Fixed requests MUST resolve an exact rung
  // before load; a file-row label alone never establishes the master ceiling.
  const tail: SourceChoice[] = streamCandidates(files, capabilities).filter((source) => source.type !== 'http' && !inspected.has(source.url))
    .slice(0, 8).map((source) => ({ ...source, fixed: preference !== 'auto', inspectBeforeLoad: true }));
  if (capabilities.adaptiveBitrate && manifests.some((source) => source.manifest.variants.length)) {
    const pinned = hlsFixedChoices(manifests, capabilities).filter((source) => preference === 'auto' || qualityHeight(source.quality) <= qualityHeight(preference));
    if (preference !== 'auto') return [...pinned.slice(0, 12), ...tail];
    const adaptive = manifests.filter((source) => source.manifest.variants.length).slice(0, 2)
      .map((source) => ({ ...source, fixed: false }));
    return [...[...adaptive, ...pinned].slice(0, 14), ...tail];
  }
  if (capabilities.adaptiveBitrate && streamCandidates(files, capabilities).some((source) => source.type !== 'http')) {
    // A blocked metadata fetch cannot turn an unverified master into a fixed quality or force the
    // reproducibly stalled progressive path. Auto can still let AVPlay fetch the HLS stream itself.
    return tail;
  }
  const all = streamCandidates(files, capabilities);
  const ceiling = preference === 'auto' ? Infinity : qualityHeight(preference);
  const levels = [...new Set(all.map((s) => s.quality))].filter((q) => qualityHeight(q) <= ceiling)
    .sort((a, b) => qualityHeight(b) - qualityHeight(a));
  return levels.flatMap((quality) => {
    const level = all.filter((s) => s.quality === quality);
    const fixed = level.filter((s) => s.type === 'http').slice(0, 1).map((s) => ({ ...s, fixed: true }));
    if (preference !== 'auto') return fixed;
    return [...level.filter((s) => s.type !== 'http').slice(0, 2).map((s) => ({ ...s, fixed: false })), ...fixed];
  }).slice(0, 12);
}

/** Widescreen encodes use the standard width rung (1920×800 is 1080p, not 800p). */
export function variantQuality(width: number, height: number): string {
  const rung = width > 1920 || height > 1080 ? 2160 : width > 1280 || height > 720 ? 1080 : width > 854 || height > 480 ? 720 : 480;
  return `${rung}p`;
}

function hlsFixedChoices(manifests: readonly HlsManifestSource[], capabilities: PlayerCapabilities): SourceChoice[] {
  const choices: SourceChoice[] = [];
  for (const source of manifests) {
    for (const variant of source.manifest.variants) {
      if (capabilities.uhd === false && (variant.width > 1920 || variant.height > 1080)) continue;
      // BITRATES identifies bandwidth, not resolution: reject a bandwidth shared by different sizes.
      if (source.manifest.variants.some((other) => other.bandwidth === variant.bandwidth &&
        (other.width !== variant.width || other.height !== variant.height))) continue;
      if (choices.some((choice) => choice.url === source.url && choice.fixedBandwidth === variant.bandwidth)) continue;
      choices.push({ ...source, quality: variantQuality(variant.width, variant.height), fixed: true, fixedBandwidth: variant.bandwidth });
    }
  }
  return choices.sort((a, b) => qualityHeight(b.quality) - qualityHeight(a.quality));
}

export function uniquePreference<T extends { preferenceKey?: string }>(tracks: readonly T[], key: string | undefined): T | undefined {
  if (!key) return undefined;
  const matches = tracks.filter((track) => track.preferenceKey === key);
  return matches.length === 1 ? matches[0] : undefined;
}
