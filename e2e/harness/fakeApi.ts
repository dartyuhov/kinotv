import type { Page, Request, Route } from '@playwright/test';

/** The app under test is built with VITE_API_BASE_URL set to this host (see playwright.config.ts). */
export const FAKE_API_BASE_URL = 'http://fake-api.kinotv.test';

/** Fake OAuth client credentials baked into the e2e build. Real ones live only in a git-ignored .env.local. */
export const FAKE_CLIENT = { id: 'e2e-client-id', secret: 'e2e-client-secret' } as const;

export interface RecordedRequest {
  method: string;
  /** Path without the query string, e.g. "/v1/items". */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Parsed JSON or form body; the raw string otherwise; null when there is no body. */
  body: unknown;
}

export interface FakeResponse {
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
  /** Fail the request as if the connection dropped (the app sees a network error, no response). */
  networkError?: boolean;
  /** Never answer. The app's own timeout has to give up on it. */
  hang?: boolean;
}

/** Shorthand responses for transport failures. */
export const NETWORK_ERROR: FakeResponse = { networkError: true };
export const NO_ANSWER: FakeResponse = { hang: true };

export type RouteHandler = FakeResponse | ((req: RecordedRequest) => FakeResponse | Promise<FakeResponse>);

/** The signed-in account, as GET /v1/user returns it by default. Made-up data only. */
export const FAKE_USER = {
  username: 'test-viewer',
  reg_date: 1600000000,
  subscription: { active: true, end_time: 1800000000, days: 120.5 },
  profile: { name: null, avatar: '' },
};

/** What the app calls whenever a session starts (sign-in or launch with a stored session). */
const SESSION_DEFAULTS: Array<[method: string, path: string, response: FakeResponse]> = [
  ['POST', '/v1/device/notify', { json: { status: 200 } }],
  ['GET', '/v1/user', { json: { status: 200, user: FAKE_USER } }],
];

/**
 * A fake kino.watch HTTP API for one test.
 *
 * - `on(method, path, response)` adds a route. Registering the same method+path again replaces it,
 *   so a test can change the server's behaviour half-way through.
 * - `requests` logs every request the app made, in order.
 * - A request with no route gets a 501 and is listed in `unhandled`; the test fixture fails the test
 *   if any are left, so the route table always describes everything the app called.
 * - Routes every signed-in session calls are answered by default (see `SESSION_DEFAULTS`); `on()`
 *   overrides them like any other route.
 */
export class FakeApi {
  readonly baseUrl = FAKE_API_BASE_URL;
  readonly requests: RecordedRequest[] = [];
  readonly unhandled: RecordedRequest[] = [];
  private readonly routes = new Map<string, RouteHandler>();

  constructor() {
    for (const [method, path, response] of SESSION_DEFAULTS) this.on(method, path, response);
  }

  on(method: string, path: string, handler: RouteHandler): this {
    this.routes.set(routeKey(method, path), handler);
    return this;
  }

  requestsTo(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((r) => r.method === method.toUpperCase() && r.path === path);
  }

  /** Resolves once every request so far has been answered (hung requests excepted). */
  async idle(): Promise<void> {
    while (this.answering.size) await Promise.all([...this.answering]);
  }

  private readonly answering = new Set<Promise<void>>();

  async attach(page: Page): Promise<void> {
    await page.route(`${this.baseUrl}/**`, (route) => {
      const answer = this.handle(route).finally(() => this.answering.delete(answer));
      this.answering.add(answer);
      return answer;
    });
  }

  // Responses fulfilled by Playwright are not CORS-checked and trigger no preflight, so no CORS headers.
  private async handle(route: Route): Promise<void> {
    const recorded = record(route.request());
    this.requests.push(recorded);

    const handler = this.routes.get(routeKey(recorded.method, recorded.path));
    if (!handler) {
      this.unhandled.push(recorded);
      await route.fulfill({ status: 501, json: { error: 'no fake route', path: recorded.path } });
      return;
    }
    const res = typeof handler === 'function' ? await handler(recorded) : handler;
    if (res.hang) return; // the route stays pending until the page aborts the request
    // The page may have aborted the request meanwhile (its timeout); then there is nothing to answer.
    if (res.networkError) await route.abort('connectionfailed').catch(() => undefined);
    else await route.fulfill({ status: res.status ?? 200, headers: res.headers, json: res.json ?? {} }).catch(() => undefined);
  }
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function record(request: Request): RecordedRequest {
  const url = new URL(request.url());
  return {
    method: request.method(),
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: request.headers(),
    body: parseBody(request),
  };
}

function parseBody(request: Request): unknown {
  const raw = request.postData();
  if (raw === null) return null;
  const type = request.headers()['content-type'] ?? '';
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
