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

### Sign-in credentials

Sign-in uses kino.watch's OAuth device flow, which needs an OAuth client. Copy `.env.example` to `.env.local`
(git-ignored) and fill in `VITE_KP_CLIENT_ID` and `VITE_KP_CLIENT_SECRET`. Without them the Sign-in screen
can't get a code. Never commit real credentials. The e2e build overrides both (and the API host) with fake
values from `playwright.config.ts`, so real credentials never reach a test.

The API host defaults to `https://api.service-kp.com`. Set `VITE_API_BASE_URL` in `.env.local` to use another
one (for example the mirror `https://api.srvkp.com`).

## On the TV

The app is a Tizen web app (`.wgt`). A Samsung TV only installs packages signed with a Samsung certificate
made for that TV, so the first run needs a one-time setup. Samsung's TV emulator doesn't run on Apple Silicon,
so test on a real TV.

| Command | What it does |
|---|---|
| `npm run tv:setup` (or `tools/setup.sh`) | Interactive wizard. It checks Rosetta, installs or finds the Tizen CLI and `sdb`, walks you through TV Developer Mode, connects to the TV, shows its DUID and guides you through creating the Samsung certificate. Safe to re-run. |
| `npm run package` | Builds and packages `dist-tizen/KinoTV.wgt`. It is signed when a certificate profile is set up, otherwise unsigned (no Tizen tools needed). |
| `npm run tv` | Builds, signs, installs and launches the app on the TV. |
| `npm run tv:debug` | The same, launched in debug mode. Prints the DevTools address to open in Chrome. |

The wizard saves the TV's address and the certificate profile name in `tizen/.signing/settings.json`, which
is git-ignored. `KINOTV_TV` and `KINOTV_TIZEN_PROFILE` override them. The Tizen tools are found on `PATH` or in
`$TIZEN_HOME` (default `~/tizen-studio`).

The package manifest (`config.xml`) is generated at build time by `tools/tizen/configXml.ts`, with the version
taken from `package.json`. The launcher icon is `tizen/icon.png`, rendered from `tizen/icon.svg` with
`node tools/tizen/renderIcon.ts`. The production build is a single classic script (not an ES module), because
the TV opens the app from local files and Chromium doesn't load module scripts from `file://`.
