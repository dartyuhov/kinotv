# KinoTV

Unofficial kino.watch client for Samsung Tizen TVs, built as a Tizen web app. Design spec:
[`docs/superpowers/specs/2026-11-02-kinotv-tizen-app-design.md`](docs/superpowers/specs/2026-11-02-kinotv-tizen-app-design.md).

## Development

Needs Node 22.

```sh
npm install
npx playwright install chromium   # once, for the e2e tests
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. The 1920×1080 TV frame is scaled to fit the browser window. |
| `npm test` | Vitest: small tests for pure logic (e.g. key mapping), next to the code as `*.test.ts`. |
| `npm run e2e` | Playwright: builds the app against a fake API and drives it with remote keys in Chromium at 1920×1080. |
| `npm run typecheck` | TypeScript, app and tests. |
| `npm run build` | Production build into `dist/` (Chrome 85 target) and prints the gzipped JS size against the 300 KB budget. |

The keyboard stands in for the remote:

| Remote | Keyboard |
|---|---|
| D-pad, OK | Arrow keys, Enter |
| Back | Backspace or Escape |
| Play/Pause | Space |
| Rewind / Fast-forward | `[` / `]` |
| CH ▲ / CH ▼ | Page Up / Page Down |

The API host defaults to `https://api.service-kp.com`. Set `VITE_API_BASE_URL` in `.env.local` to use another
one (for example the mirror `https://api.srvkp.com`).
