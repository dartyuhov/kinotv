import { ApiError, errorFromResponse } from './errors';

/** Query or form values. Arrays repeat the key as given, so pass `'conditions[]'` for `conditions[]=a&conditions[]=b`. */
export type Params = Record<string, string | number | boolean | null | undefined | ReadonlyArray<string | number>>;

export interface HttpRequest {
  method: 'GET' | 'POST';
  /** Path from the API host root, e.g. "/v1/items" or "/oauth2/device". */
  path: string;
  query?: Params;
  /** POST body, sent as application/x-www-form-urlencoded (kino.watch ignores JSON bodies). */
  form?: Params;
  /** `false` for a GET that changes state (kino.watch toggles are GETs), so it is never sent twice. */
  retry?: false;
  /** Cancels the request (e.g. a search superseded by a newer one). It then fails, and is not retried. */
  signal?: AbortSignal;
}

/** Sends one request and returns the parsed JSON body, or throws an ApiError. */
export type Http = <T>(request: HttpRequest) => Promise<T>;

export interface HttpOptions {
  baseUrl: string;
  /** Give up on a request after this long (spec §7.3: 15 s). */
  timeoutMs?: number;
  /** Delays before each retry of a failed GET (spec §7.3: 1 s, then 3 s). */
  retryDelaysMs?: readonly number[];
}

/**
 * The transport under the API client: builds the URL, encodes params, applies the timeout and
 * normalises every failure to an ApiError.
 *
 * GETs are retried on `network`, `timeout` and `server` errors. POSTs never are, nor GETs marked
 * `retry: false`, so a write is never sent twice.
 */
export function createHttp({ baseUrl, timeoutMs = 15_000, retryDelaysMs = [1_000, 3_000] }: HttpOptions): Http {
  async function once<T>(req: HttpRequest): Promise<T> {
    const url = `${baseUrl}${req.path}${queryString(req.query)}`;
    const controller = new AbortController();
    const init: RequestInit = { method: req.method, signal: controller.signal };
    if (req.form) {
      init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      init.body = encode(req.form);
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const cancel = () => controller.abort();
    if (req.signal?.aborted) cancel();
    req.signal?.addEventListener('abort', cancel);
    try {
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch {
        throw timedOut
          ? new ApiError('timeout', null, null, 'Request timed out')
          : new ApiError('network', null, null, 'Network request failed');
      }
      const body = await readBody(response);
      if (timedOut) throw new ApiError('timeout', null, null, 'Request timed out'); // aborted mid-body
      if (!response.ok) throw errorFromResponse(response.status, body);
      return body as T;
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', cancel);
    }
  }

  return async <T>(req: HttpRequest): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once<T>(req);
      } catch (error) {
        const delay = retryDelaysMs[attempt];
        if (req.method !== 'GET' || req.retry === false || delay === undefined || !isRetryable(error) || req.signal?.aborted) throw error;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };
}

function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout' || error.kind === 'server');
}

function queryString(params: Params | undefined): string {
  const encoded = params ? encode(params) : '';
  return encoded ? `?${encoded}` : '';
}

function encode(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const v of value) search.append(key, String(v));
    else search.append(key, String(value));
  }
  return search.toString();
}

// Error bodies may be HTML (unknown routes) or empty; success bodies are JSON.
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
