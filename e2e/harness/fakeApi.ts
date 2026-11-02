import type { Page, Request, Route } from '@playwright/test';

/** The app under test is built with VITE_API_BASE_URL set to this host (see playwright.config.ts). */
export const FAKE_API_BASE_URL = 'http://fake-api.kinotv.test';

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
}

export type RouteHandler = FakeResponse | ((req: RecordedRequest) => FakeResponse | Promise<FakeResponse>);

/**
 * A fake kino.watch HTTP API for one test.
 *
 * - `on(method, path, response)` adds a route. Registering the same method+path again replaces it,
 *   so a test can change the server's behaviour half-way through.
 * - `requests` logs every request the app made (CORS preflights excluded), in order.
 * - A request with no route gets a 501 and is listed in `unhandled`; the test fixture fails the test
 *   if any are left, so the route table always describes everything the app called.
 */
export class FakeApi {
  readonly baseUrl = FAKE_API_BASE_URL;
  readonly requests: RecordedRequest[] = [];
  readonly unhandled: RecordedRequest[] = [];
  private readonly routes = new Map<string, RouteHandler>();

  on(method: string, path: string, handler: RouteHandler): this {
    this.routes.set(routeKey(method, path), handler);
    return this;
  }

  requestsTo(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((r) => r.method === method.toUpperCase() && r.path === path);
  }

  async attach(page: Page): Promise<void> {
    await page.route(`${this.baseUrl}/**`, (route) => this.handle(route));
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const cors = corsHeaders(request);
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const recorded = record(request);
    this.requests.push(recorded);

    const handler = this.routes.get(routeKey(recorded.method, recorded.path));
    if (!handler) {
      this.unhandled.push(recorded);
      await route.fulfill({ status: 501, headers: cors, json: { error: 'no fake route', path: recorded.path } });
      return;
    }
    const res = typeof handler === 'function' ? await handler(recorded) : handler;
    await route.fulfill({
      status: res.status ?? 200,
      headers: { ...cors, ...res.headers },
      json: res.json ?? {},
    });
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

// The app runs on localhost and calls another origin, so every response needs CORS headers.
function corsHeaders(request: Request): Record<string, string> {
  const h = request.headers();
  return {
    'access-control-allow-origin': h['origin'] ?? '*',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': h['access-control-request-headers'] ?? 'authorization, content-type',
  };
}
