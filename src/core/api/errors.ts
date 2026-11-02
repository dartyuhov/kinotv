/**
 * What went wrong, as the UI needs to know it (spec §7.3).
 *
 * - `network`: no response (offline, DNS, CORS).
 * - `timeout`: no response within the request timeout.
 * - `auth`: 401, or no session at all.
 * - `subscription`: the account can't use this (reserved; kino.watch has no known error code for it yet).
 * - `server`: 5xx and 429.
 * - `notFound`: 404.
 * - `rejected`: any other 4xx, e.g. the OAuth `authorization_pending` 400. `code` says why.
 */
export type ApiErrorKind = 'network' | 'timeout' | 'auth' | 'subscription' | 'server' | 'notFound' | 'rejected';

export class ApiError extends Error {
  readonly name = 'ApiError';

  constructor(
    readonly kind: ApiErrorKind,
    /** HTTP status, or null when there was no response. */
    readonly status: number | null,
    /** The server's machine-readable `error` field, e.g. "authorization_pending". */
    readonly code: string | null,
    message: string,
  ) {
    super(message);
  }
}

export function isApiError(error: unknown, kind?: ApiErrorKind): error is ApiError {
  return error instanceof ApiError && (kind === undefined || error.kind === kind);
}

/** Maps an HTTP error response to an ApiError. The message never contains the URL (it carries tokens). */
export function errorFromResponse(status: number, body: unknown): ApiError {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const code = typeof fields.error === 'string' ? fields.error : null;
  const message =
    [fields.error_description, fields.message, fields.error].find((v): v is string => typeof v === 'string' && v !== '') ??
    `HTTP ${status}`;
  return new ApiError(kindForStatus(status), status, code, message);
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'auth';
  if (status === 404) return 'notFound';
  if (status === 429 || status >= 500) return 'server';
  return 'rejected';
}
