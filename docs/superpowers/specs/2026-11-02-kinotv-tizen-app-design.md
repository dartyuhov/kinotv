# KinoTV — unofficial kino.watch client for Samsung Tizen TVs

**Status:** Draft for review · **Date:** 2026-11-02

## 1. Purpose

KinoTV is a fast, polished, remote-first app for watching kino.watch (formerly kino.pub) on Samsung Tizen TVs. Its design is inspired by Apple TV (tvOS). It is open source, so anyone with a kino.watch subscription can install it on their own TV.

**Reference device:** Samsung TQ65Q60CAUXXC (2023 Q60C, Tizen 7.0, 65" 4K QLED, HDR10/HDR10+/HLG, 60 Hz). It ships with a minimal remote: D-pad, OK, Back, Home, media keys and channel keys, but no colour or number keys.

### Success criteria (v1)

1. A user can sign in, browse, search and play films, series episodes and live TV using only the D-pad, OK and Back.
2. 4K titles play in 2160p with HDR, and the audio track (dubbing), subtitles and quality can all be changed during playback.
3. Watch progress syncs with kino.watch. Resume works across devices.
4. The UI scrolls and moves focus at 60 fps on the Q60C, with no visible stutter on Home or in grids.
5. Another person can install the app on their own TV by following the README and `install.sh`. This is allowed only after the project has its own API credentials (see §11).

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Audience | Shared publicly as an open-source project |
| Distribution | GitHub releases; each user self-signs and installs to their own TV |
| App type | **Tizen web app (`.wgt`)**: installed, runs locally, plays video through the native AVPlay player. C/C++ apps are not open to third parties on Samsung TVs. The Tizen C#/.NET option was considered and rejected |
| Stack | React 18 + TypeScript + Vite, Norigin Spatial Navigation |
| Visual style | Inspired by Apple TV / tvOS. Original design with no Apple assets |
| UI languages | Russian (default) and English, matching kino.watch's web languages |
| v1 features | Sign-in, Home, browse, search, playback, Continue watching, I Watch, Bookmarks, History, Collections, live TV, Sport, audio/subtitle/quality pickers |
| Display | 4K target: 2160p video with HDR; 4K-ready artwork; UI at 1080p logical resolution (see §6.4) |
| API credentials | Development reuses an existing open-source client's credentials from a local, git-ignored file. **Public release is blocked until the project has its own credentials** |
| Testing | Chrome on the Mac (keyboard as remote), Vitest, Playwright remote-only end-to-end tests, then the real TV over Wi-Fi. Samsung's emulator is not used because it doesn't run on Apple Silicon |

### Non-goals (v1)

- Samsung Seller Office / store submission.
- Voice search, the Samsung Smart Hub preview tiles, and casting from a phone.
- Downloading or offline playback.
- Support for TVs older than Tizen 6.5 (2022 models). Tizen 7.0 is the tested target.
- Multiple profiles or account switching.

## 2. Platform constraints

- **Runtime:** the Tizen 7.0 web runtime is Chromium-based (about Chrome 94). The build targets **Chrome 85** (`build.target: 'chrome85'`), so 2022 models (Tizen 6.5) should work, but they are not tested.
- **Video:** `webapis.avplay` plays on a native video layer behind the HTML. It supports HLS, HEVC, 2160p and HDR10/HDR10+, has multiple audio tracks (`getTotalTrackInfo` / `setSelectTrack`) and loads external subtitles (`setExternalSubtitlePath`). An HTML `<video>` element can't reliably switch audio tracks or play 4K HDR on the TV, so it is used only in the desktop development build.
- **Remote keys:** arrows, Enter (OK) and Back (`10009`) arrive without any setup. Media and channel keys must be registered with `tizen.tvinputdevice.registerKey` (MediaPlayPause, MediaPlay, MediaPause, MediaRewind, MediaFastForward, MediaStop, ChannelUp, ChannelDown).
- **App lifecycle:** the Home button and standby fire `visibilitychange`. Back on the root screen must offer to exit (`tizen.application.getCurrentApplication().exit()`).
- **Performance:** the Q60C uses a mid-range chip. `backdrop-filter` and large repaints are expensive, so the design avoids them (see §6.3).
- **Signing:** sideloaded apps on 2023 TVs need a Samsung certificate tied to the TV's DUID. That certificate can only be created through Tizen Studio's Certificate Manager GUI, which needs a Samsung account.

## 3. Architecture

```
┌──────────────────────── Tizen web app (.wgt) ────────────────────────┐
│  ui/        React screens + components, Norigin focus                │
│             ScreenStack navigator (push/pop, focus restore)          │
├──────────────────────────────────────────────────────────────────────┤
│  state/     TanStack Query (server state) · Zustand (prefs, session) │
├──────────────────────────────────────────────────────────────────────┤
│  core/ (framework-free, unit-tested)                                 │
│   api/       typed kino.watch client, token refresh, retry           │
│   auth/      device-code sign-in flow, token store                   │
│   player/    PlayerAdapter interface                                 │
│                ├─ AvPlayAdapter  (TV)                                │
│                └─ Html5Adapter   (desktop dev: <video> + hls.js)     │
│   sync/      progress reporter (marktime, watched threshold)         │
│   platform/  keys, lifecycle, storage, network status, TV info       │
│   i18n/      ru.json, en.json, t() helper                            │
│   log/       ring-buffer diagnostics log (token-scrubbed)            │
└──────────────────────────────────────────────────────────────────────┘
tools/   setup.sh · install.sh · package/sign/install/launch scripts
tizen/   config.xml template, icons, splash
```

**Rules**
- `core/` never imports React. Each module exposes a small interface, and its unit tests run in Node.
- `platform/` is the only code that touches `tizen.*` or `webapis.*`. Each function has a browser fallback, so the same build runs in Chrome on the Mac.
- The player adapter is chosen at startup: `AvPlayAdapter` if `webapis.avplay` exists, otherwise `Html5Adapter`. `hls.js` is loaded only in the desktop build.

### Key interfaces (shape, not final code)

```ts
interface PlayerAdapter {
  load(src: MediaSource, opts: { startAt: number }): Promise<void>;
  play(): void; pause(): void; seekTo(sec: number): void;
  getTracks(): { audio: AudioTrack[]; subtitles: SubtitleTrack[]; qualities: Quality[] };
  selectAudio(id: string): void; selectSubtitle(id: string | null): void; selectQuality(id: string): Promise<void>;
  on(event: 'time' | 'buffering' | 'ended' | 'error' | 'state', cb: (e: unknown) => void): () => void;
  destroy(): void;
}

interface ApiClient {           // all methods typed; errors normalised to ApiError
  items(q: CatalogQuery): Promise<Page<ItemSummary>>;
  item(id: number): Promise<ItemDetails>;
  search(q: string, page?: number): Promise<Page<ItemSummary>>;
  // collections, watching, bookmarks, history, tv, genres, countries, types, device settings…
}
```

## 4. Screens and navigation

**Launch:** if a stored session exists, go to Home. Otherwise go to Sign-in.

**Tab bar:** a floating pill at the top. `⌕ Search · Home · Movies · Series · I Watch · TV · Sport · Bookmarks · History · ⚙︎ Settings`.

| Screen | Content |
|---|---|
| Sign-in | User code, verification address and a QR code. Polls the API and moves on automatically. Shows a new code when the old one expires |
| Home | Hero carousel of featured titles (the backdrop follows the focused card). Rows: Continue watching · New episodes · New releases · Popular · Collections |
| Movies / Series | Poster grid. Filters for type, genre, year and country. Sort by newest, popular or rating. Loads more pages as you scroll |
| I Watch | Followed series. Ones with new episodes come first, with a count badge |
| TV / Sport | Grid of live channels. OK plays the channel; CH ▲▼ switches channels in the player |
| Bookmarks | Row of folders, with the selected folder's titles in a grid below |
| History | Recently watched with progress. OK resumes |
| Search | Built-in RU/US keyboard with live results (see §5.2) |
| Title page | Film: Play/Resume, bookmark (folder picker), audio preference, metadata. Series: the same, plus season tabs and an episode row with progress |
| Player | See §5.3 |
| Settings | UI language · default quality · preferred audio language · 4K/HEVC/HDR switches · kino.watch server region · Diagnostics · About/Update · Sign out |

**ScreenStack navigator:** each screen pushes onto a stack. Popping a screen restores the focus key and scroll position it had. Back on Home shows an "Exit app?" dialog. Each screen declares its initial focus (Play/Resume on title pages, the first card on grids).

**API questions to settle in the first week of the build:**
1. The exact device-sign-in address on kino.watch.
2. Whether "Sport" is its own content type/section or a group of TV channels. The Sport screen supports both: a channel grid and an item grid.

## 5. Interaction design

### 5.1 Remote key map

| Key | Everywhere | In player |
|---|---|---|
| ▲▼◀▶ | Move focus. Each row remembers its focused position | ◀▶ seek (holding speeds up: 10 s → 30 s → 60 s steps) · ▲ settings panel · ▼ info |
| OK | Open / select | Play / pause |
| Back | Pop the screen. On Home: exit dialog | Close panel → hide controls → exit player (saves progress) |
| ⏯ ⏪ ⏩ | — | Play/pause · −10 s · +30 s |
| CH ▲▼ | Page through long grids | Previous/next episode or channel |
| Home | Handled by the system. The app saves progress and pauses on `visibilitychange` | |

The desktop build maps Arrow keys to the D-pad, Enter to OK, Backspace/Escape to Back, Space to Play/Pause, `[`/`]` to Rewind/Fast-forward and PageUp/PageDown to CH ▲▼.

### 5.2 On-screen keyboard

- Two layouts: **Russian ЙЦУКЕН** (including ё and ъ) and **US QWERTY** (plus `' . :`). Both have a digits row and the keys 🌐 language, space, ⌫ delete and ✕ clear.
- It opens in the UI language's layout and then remembers the last layout used.
- Arrows wrap from one edge to the other. ▼ from the bottom row moves focus to the results. ⏪ deletes a character and ⏩ inserts a space.
- Results are fetched 300 ms after typing stops, from 2 characters onwards. The previous request is cancelled when a new one starts.

### 5.3 Player

- **Controls overlay:** title and episode, a progress bar with buffered range, a thumbnail preview while seeking (when kino.watch provides storyboard thumbnails; otherwise only the time is shown), elapsed and remaining time, and quick buttons for audio, subtitles and quality. It hides after 4 s without input.
- **Settings panel (▲):** tabs Info · Audio & subtitles · Quality. Columns for audio track, subtitles (off or language) and quality (Auto, 2160p, 1080p, 720p…).
- **Track memory:** audio and subtitle choices are remembered per series and per language preference. Quality is a global preference.
- **Next episode:** in the last 20 s (or at the end credits, if the API marks them), a "Next episode in 10 s" card appears. OK plays it now; Back cancels.
- **Live TV:** no seek bar. Shows the channel name and current programme if the API provides it. CH ▲▼ zaps channels.

## 6. Visual design

### 6.1 Style

Inspired by Apple TV / tvOS. The approved mockups live in `.superpowers/brainstorm/` (`tvos-style.html`, `player-remote.html`, `keyboard-v2.html`).

- **Background:** black, with full-bleed key art of the focused or featured title, faded by left-to-right and bottom-to-top gradients.
- **Tab bar:** a floating pill made of translucent grey. The active tab is a white pill with black text.
- **Cards:** landscape 16:9 cards for Continue watching and episodes; 2:3 posters in grids. 12 px corner radius.
- **Focus:** the focused card scales to 1.1 and lifts, with a deeper shadow and a diagonal light sheen. A slight tilt is added only if it stays at 60 fps on the device. Transitions take 200–250 ms with ease-out.
- **Buttons:** the primary button is a white pill with black text; secondary buttons are translucent grey. The focused button scales to 1.06.
- **Type:** **Inter** (SIL OFL, bundled), with Cyrillic and Latin subsets. Sizes are tuned for viewing from about 3 m (minimum body text 24 px at 1080p).
- **Icons:** Lucide (ISC licence).
- **No Apple assets:** no San Francisco font, SF Symbols, Apple logos or "Apple TV" naming.

### 6.2 Design tokens

Colours, radii, spacing, shadows and motion timings live in `ui/theme/tokens.css` as CSS custom properties. Components use only tokens.

### 6.3 Performance rules

- No `backdrop-filter`. Frosted and blurred surfaces use a tiny (≈32 px) version of the image scaled up, which blurs naturally, plus a translucent fill.
- Only `transform` and `opacity` are animated.
- Rows and grids render only visible items plus a buffer of one screen.
- Images are lazy-loaded, use a size appropriate to the card, and are decoded off the main thread (`decoding="async"`).
- **Budgets:** JS bundle ≤ 300 KB gzipped (excluding the Inter font). Cold start to an interactive Home ≤ 3 s on the Q60C on a warm network. 60 fps on focus moves.

### 6.4 4K

- **Video:** the device settings sent to kino.watch enable 4K, HEVC and HDR by default (they can be switched off in Settings). Quality "Auto" prefers 2160p when available. AVPlay is configured for UHD streams.
- **UI:** laid out at **1920×1080 logical pixels** (Samsung web apps usually draw the UI layer at 1080p and upscale it; video uses its own 4K layer). Artwork is requested at the largest size the API offers (`big`/`wide`) for hero backdrops, so it stays sharp on 4K panels.
- **Week-one check:** on the Q60C, read `screen.width`, `devicePixelRatio` and the effective graphics-plane resolution. If the UI layer can render at 2160p, switch the viewport to 3840×2160 with a 2× scale factor and add the `high-res-ui` flag to the spec.

## 7. Sign-in, data and sync

### 7.1 Sign-in (OAuth 2 device flow)

1. `POST /oauth2/device` (`grant_type=device_code`, client ID and secret) returns `code`, `user_code`, `verification_uri`, `interval` and `expires_in`.
2. Show `user_code`, the address and a QR code of the address. Poll with `grant_type=device_token` at the server's `interval`. On `authorization_pending`, keep polling. On expiry, request a new code.
3. On success, store `access_token`, `refresh_token` and `expires_at`. Then call `/v1/device/notify` with the title "KinoTV · <TV model>", the hardware (TV model) and the software (Tizen version and app version).

### 7.2 Tokens

- Stored in the app's private `localStorage` through `platform/storage`.
- The access token is refreshed proactively 5 minutes before expiry.
- On a 401 from the API, refresh once and retry the request. If that fails, clear the session, show Sign-in, and after sign-in return to the screen that was on top of the stack.
- Concurrent requests share a single in-flight refresh.

### 7.3 API client

- **Base URL:** `https://api.service-kp.com` (with `https://api.srvkp.com` as a configurable mirror; both were reachable on 2026-11-02).
- **Endpoints used:** items (catalog, fresh, hot, popular), item details, search, collections, watching (get, marktime, toggle, serials, movies), bookmarks (folders, items, add/remove), history, tv, genres, countries, types, device settings and server locations.
- **Errors:** responses are mapped to `ApiError { kind: 'network' | 'timeout' | 'auth' | 'subscription' | 'server' | 'notFound' }`. Request timeout is 15 s.
- **Retries:** two retries with exponential backoff (1 s, 3 s) for `network`, `timeout` and 5xx errors on GET requests only.

### 7.4 Caching (TanStack Query)

- Catalog, collections, genres and item details: `staleTime` 10 minutes.
- Continue watching, I Watch, Bookmarks and History: re-fetched when their screen gains focus.
- Toggles (bookmark, watched) update the screen immediately and roll back if the server rejects them.

### 7.5 Progress sync

- During playback, `marktime` is sent every 30 s. It is also sent on pause, exit, episode change and `visibilitychange` (Home or standby).
- At ≥ 90% watched (or reaching the end-credits marker), the video is marked watched.
- Opening a title asks `watching` for the saved position, and Resume seeks to it.

### 7.6 Credentials

- `KP_CLIENT_ID` and `KP_CLIENT_SECRET` are injected at build time from `.env.local`, which is git-ignored. For development, they are an existing open-source client's credentials. These are **never committed**.
- **Release gate:** CI refuses to publish a release unless it has the project's own credentials, from repository secrets. A draft request to kino.watch support is a pre-release task.

## 8. Errors and edge cases

| Situation | Behaviour | Remote |
|---|---|---|
| Offline at launch or mid-session | Full-screen "No connection". Clears automatically on reconnect and re-fetches the current screen | OK retry · Back exit |
| API error after retries | Inline error in the content area; the tab bar stays usable | OK retry |
| A Home row fails | Only that row shows "Couldn't load · Retry" | Focusable retry |
| Subscription expired | Message with the expiry date and the renewal address. Browsing still works; playback is blocked | OK dismiss |
| Stream fails to start | Try the next HLS variant, then a lower quality. Then show "Can't play this title" | OK retry · Back leave |
| Network drops mid-playback | Buffering spinner. After 20 s, "Connection lost". Position is saved; Retry resumes from the same second | OK retry |
| Home or standby during playback | Save progress and pause. On return, show paused controls | OK resume |
| Empty states | A friendly message plus a "Popular right now" suggestion row | Focus on the suggestion |
| Uncaught render error | A per-screen error boundary shows "Something went wrong" with Retry and Back | |

**Diagnostics:** a ring buffer of the last 200 events (requests with status and duration, player events, errors). Tokens and secrets are scrubbed before storage. It can be viewed in Settings → Diagnostics.

## 9. Internationalisation

- Flat JSON dictionaries, `i18n/ru.json` and `i18n/en.json`, accessed through `t(key, params)`, with Russian plural rules via `Intl.PluralRules`.
- The language is chosen at first launch from the TV's language (`tizen.systeminfo` LOCALE, falling back to `navigator.language`). It can be changed in Settings.
- Content metadata (titles, descriptions) is shown as kino.watch provides it. Where the API has both Russian and original titles, the original title is shown as a subtitle when the UI is in English.

## 10. Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | API client (with `msw`), token refresh and races, device-flow polling, progress-sync timing, keyboard layout logic, i18n plurals |
| Component | Vitest + Testing Library | Focus behaviour of rows, grids, keyboard and dialogs |
| End-to-end | Playwright (Chromium, 1920×1080) | Remote-only journeys with key presses only and a mocked API: sign-in → Home → title → play → back · search RU and EN · bookmark add/remove · Back-stack focus restore · exit dialog · offline screen |
| Device | Manual checklist on the Q60C | AVPlay 4K/HDR start, audio-track switch, external subtitles, quality switch, media and channel keys, Home/standby resume, 60 fps scrolling, cold-start time |

Tests are written first for `core/` modules (TDD). CI runs unit and e2e tests on every push.

## 11. Tooling, packaging and distribution

**Commands**

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with a 1920×1080 frame and keyboard as the remote. An optional dev proxy for the API and streams if CORS blocks the browser |
| `npm test` / `npm run e2e` | Unit and component tests / Playwright |
| `npm run tv` | Build → `tizen package -t wgt -s <profile>` → `tizen install` → launch on the TV connected via `sdb` |
| `npm run tv:debug` | Same, launched in debug mode, printing the DevTools address |

**`tools/setup.sh`** (an interactive wizard for this Mac and contributors):
1. Check for Rosetta, then install or verify the Tizen Studio CLI (`tizen`, `sdb`).
2. Walk through TV Developer Mode (Apps → `12345` → On → host IP → restart).
3. `sdb connect <tv-ip>`, then read the DUID.
4. Guide the user through creating a Samsung certificate in Certificate Manager (GUI, Samsung account) and record the profile name.

**`tools/install.sh`** (for end users): the same TV and certificate steps, then sign the unsigned release `.wgt` with the user's profile and install it.

**`tizen/config.xml`:**
- App ID and name "KinoTV".
- `<tizen:setting screen-orientation="landscape">` and 1920×1080.
- Privileges: `internet`, `tv.inputdevice`, `application.launch`, `system` (for systeminfo).
- `<access origin="*" subdomains="true"/>`, limited to the kino.watch API and CDN domains once confirmed.
- Icon and splash screen.
- The version is synced from `package.json` at build time.

**Releases:** GitHub Actions runs tests, builds and attaches an unsigned `.wgt` plus `install.sh` to a GitHub Release. Publishing is gated on the project's own credentials (§7.6). The app checks the latest release tag on launch (at most once a day) and shows "Update available" in Settings.

**Repo hygiene:** `.superpowers/`, `.env.local`, `*.wgt`, certificate profiles and `node_modules/` are git-ignored.

## 12. Risks

| Risk | Mitigation |
|---|---|
| kino.watch rebrand changes API hosts or the device-flow address | Hosts are configurable. Settled in week one (§4) |
| Browser CORS blocks the desktop dev build | Vite dev proxy. On the TV, the widget access policy applies instead |
| AVPlay quirks with HLS4 multi-audio or external subtitles | An early device spike in week one, before building UI on top of the player |
| Performance on the Q60C chip | Budgets (§6.3), virtualised lists, an early on-device scroll test |
| Borrowed credentials revoked | Development only. The release gate requires the project's own credentials |
| Samsung certificate steps confuse end users | A step-by-step README with screenshots, plus the `install.sh` wizard |

## 13. Week-one verification spikes

These come before most of the UI is built:

1. The device-flow sign-in against the live API (kino.watch address, response shape).
2. AVPlay on the Q60C: a 2160p HDR title, audio-track switch, external subtitles.
3. UI graphics-plane resolution (§6.4).
4. What "Sport" is in the API (§4).
5. Scroll performance of a 30-card virtualised row with focus animation on the Q60C.
