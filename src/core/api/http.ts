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
}

/** Sends one request and returns the parsed JSON body, or throws an ApiError. */
export type Http = <T>(request: HttpRequest) => Promise<T>;

export interface HttpOptions {
  baseUrl: string;
}

export function createHttp({ baseUrl }: HttpOptions): Http {
  return async <T>(req: HttpRequest): Promise<T> => {
    const url = `${baseUrl}${req.path}${queryString(req.query)}`;
    const init: RequestInit = { method: req.method };
    if (req.form) {
      init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      init.body = encode(req.form);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new ApiError('network', null, null, 'Network request failed');
    }
    const body = await readBody(response);
    if (!response.ok) throw errorFromResponse(response.status, body);
    return body as T;
  };
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
