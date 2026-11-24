/**
 * Shims for older TV web engines. Imported first by main.tsx, before any other module runs.
 *
 * The build targets Chromium 76 (Tizen 6.0, 2021 TVs), which lowers syntax but adds no runtime APIs.
 * Everything here is feature-detected, so newer engines are left untouched.
 */

import { sha256 } from './sha256';

/** Keep in sync with NO_FLEX_GAP_CLASS in tools/postcss/flexGapFallback.ts. */
const NO_FLEX_GAP_CLASS = 'no-flex-gap';

// crypto.subtle exists only in secure contexts. The TV loads the app from file://, which Chromium
// normally counts as secure; if an engine doesn't, the artwork cache (keyed by SHA-256) would turn
// itself off. Shim just the one call it makes: digest('SHA-256', bytes).
if (typeof crypto !== 'undefined' && !crypto.subtle) {
  Object.defineProperty(crypto, 'subtle', {
    configurable: true,
    value: {
      digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
        const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
        if (name.toUpperCase() !== 'SHA-256') return Promise.reject(new DOMException(`${name} is not supported`, 'NotSupportedError'));
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        return Promise.resolve(sha256(bytes));
      },
    },
  });
}

// crypto.randomUUID: Chromium 92.
if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function' && typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: function randomUUID() {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  });
}

// AbortSignal.prototype.throwIfAborted: Chromium 100.
if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.prototype.throwIfAborted !== 'function') {
  Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
    configurable: true,
    writable: true,
    value: function throwIfAborted(this: AbortSignal) {
      if (!this.aborted) return;
      const reason: unknown = (this as { reason?: unknown }).reason;
      throw reason !== undefined ? reason : new DOMException('signal is aborted without reason', 'AbortError');
    },
  });
}

// Flexbox gap: Chromium 84. Older engines get the class that switches on the margin fallback the
// build generates for every flex rule with a gap (tools/postcss/flexGapFallback.ts).
if (typeof document !== 'undefined' && !supportsFlexGap()) {
  document.documentElement.classList.add(NO_FLEX_GAP_CLASS);
}

function supportsFlexGap(): boolean {
  const flex = document.createElement('div');
  flex.style.display = 'flex';
  flex.style.flexDirection = 'column';
  flex.style.rowGap = '1px';
  flex.appendChild(document.createElement('div'));
  flex.appendChild(document.createElement('div'));
  document.documentElement.appendChild(flex);
  const supported = flex.scrollHeight === 1;
  document.documentElement.removeChild(flex);
  return supported;
}
