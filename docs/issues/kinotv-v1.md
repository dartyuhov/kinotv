# KinoTV v1 — unofficial kino.watch app for Samsung Tizen TVs

> Design reference: the KinoTV Tizen app design spec dated 2026-11-02 in this repo's docs.

## Problem Statement

I pay for kino.watch (formerly kino.pub) and want to watch it on my Samsung 4K TV (2023 Q60C, Tizen 7.0). There's no good way to do that from the sofa. Watching through the TV's browser is clumsy with a remote. It can't switch dubbing tracks or play 4K HDR properly, and it doesn't feel like a real TV app. I want an app that looks and feels as polished as Apple TV and works entirely with the slim remote that came with the TV. It should keep my watch progress in sync with my other devices. Other kino.watch subscribers should be able to install it on their own Samsung TVs.

## Solution

KinoTV is an installed Tizen TV app (a packaged web app with its own icon in Apps) and an open-source, unofficial client for kino.watch. You sign in once by approving a code on your phone. After that you can browse films, series, collections, live TV and sport, search with an on-screen Russian or US keyboard, and play anything. Video plays through the TV's native player in up to 2160p with HDR, and you can choose the dubbing track, subtitles and quality while watching. Continue watching, I Watch, Bookmarks and History all sync with your kino.watch account. The interface follows the Apple TV design language: full-screen artwork, a floating tab bar and cards that lift when focused. It is available in Russian and English. Everything works with the arrows, OK and Back. Users install it from GitHub releases with a guided script that signs the app for their own TV.

## User Stories

### Sign-in and session

1. As a new viewer, I want the TV to show a short sign-in code, a web address and a QR code, so that I can sign in from my phone without typing a password with the remote.
2. As a new viewer, I want the TV to move on to Home by itself once I approve the code on my phone, so that I don't have to press anything else.
3. As a new viewer, I want a fresh code to appear automatically when the old one expires, so that a slow sign-in never leaves me stuck.
4. As a viewer, I want to stay signed in across app restarts and TV power cycles, so that I only sign in once.
5. As a viewer, I want the app to renew my session quietly in the background, so that I'm never thrown out mid-browse or mid-film.
6. As a viewer whose session has really expired, I want to be sent to sign-in and then returned to the screen I was on, so that I don't lose my place.
7. As a viewer, I want my TV to appear in my kino.watch device list as "KinoTV" with the TV model, so that I can recognise and manage it from my account.
8. As a viewer, I want to sign out from Settings, so that I can hand the TV to someone else or switch accounts.

### Home and browsing

9. As a viewer, I want a Home screen with large rotating artwork of featured titles, so that I discover something to watch at a glance.
10. As a viewer, I want the backdrop to change to whichever card I focus, so that I get a sense of a title before opening it.
11. As a viewer, I want a Continue watching row first on Home, so that I can resume what I was watching with one press.
12. As a viewer, I want a New episodes row on Home, so that I see new episodes of series I follow straight away.
13. As a viewer, I want New releases, Popular and Collections rows on Home, so that I can explore beyond my own lists.
14. As a viewer, I want a Movies tab with a poster grid, so that I can browse all films.
15. As a viewer, I want a Series tab with a poster grid, so that I can browse all series.
16. As a viewer, I want to filter the catalog by type (film, documentary, concert, TV show and so on), genre, year and country, so that I can narrow down what I'm looking for.
17. As a viewer, I want to sort the catalog by newest, popular or rating, so that I can find titles the way I prefer.
18. As a viewer, I want grids to keep loading as I scroll down, so that I can browse the whole catalog without pagination screens.
19. As a viewer, I want CH ▲▼ to page through long grids, so that I can move quickly through hundreds of titles.
20. As a viewer, I want to open a curated collection and see its titles, so that I can follow kino.watch's editorial picks.

### Title pages

21. As a viewer, I want a title page with full-screen artwork, the title, year, genres, ratings, age rating, description and available audio languages, so that I can decide whether to watch.
22. As a viewer, I want focus to start on Play or Resume on a title page, so that watching is always one OK press away.
23. As a viewer, I want Resume to show where I stopped (for example "Resume S1 · E3"), so that I know what will play.
24. As a viewer of a series, I want season tabs and a row of episode cards with titles and progress, so that I can pick any episode.
25. As a viewer of a series, I want watched episodes to be visibly marked, so that I can see how far I've got.
26. As a viewer, I want to add or remove a title from a bookmark folder from its title page, so that I can save it for later.
27. As a viewer, I want to follow or unfollow a series from its title page, so that I control what appears in I Watch.

### I Watch, Bookmarks, History

28. As a viewer, I want an I Watch tab listing the series I follow, with ones that have new episodes first and a count badge, so that I know what to catch up on.
29. As a viewer, I want a Bookmarks tab showing my kino.watch bookmark folders and their titles, so that I can get to my saved titles on the TV.
30. As a viewer, I want a History tab with recently watched titles and my progress, so that I can go back to something I started earlier.
31. As a viewer, I want OK on a History item to resume where I left off, so that going back is instant.
32. As a viewer, I want bookmark and follow changes to show immediately, and be reverted with a message if the server rejects them, so that the app feels instant but stays truthful.
33. As a viewer, I want my lists to refresh when I return to their tab, so that changes made on my phone or another device show up.

### Search

34. As a viewer, I want an on-screen Russian (ЙЦУКЕН) keyboard, so that I can search for Russian titles.
35. As a viewer, I want an on-screen US English (QWERTY) keyboard, so that I can search for original titles.
36. As a viewer, I want one key to switch between Russian and English, with the app remembering my last layout, so that switching languages is quick.
37. As a viewer, I want a digits row, space, delete and clear always on the keyboard, so that I can type years and series numbers.
38. As a viewer, I want results to appear as I type, so that I often find the title after a few letters.
39. As a viewer, I want ▼ from the keyboard's bottom row to jump to the results, so that I can go from typing to choosing in one move.
40. As a viewer, I want arrows to wrap from one edge of the keyboard to the other, so that reaching far keys takes fewer presses.
41. As a viewer, I want ⏪ to delete and ⏩ to insert a space, so that I can type faster with the remote's media keys.
42. As a viewer, I want a helpful message and popular suggestions when nothing matches, so that a search is never a dead end.

### Playback

43. As a viewer, I want films and episodes to play in the best quality my TV supports, up to 2160p with HDR, so that I get the most out of my 4K screen.
44. As a viewer, I want OK to play and pause, so that the main control is the obvious button.
45. As a viewer, I want ◀▶ to seek, getting faster the longer I hold, so that I can make both small and large jumps.
46. As a viewer, I want ⏯, ⏪ and ⏩ on the remote to play/pause, jump back 10 s and jump forward 30 s, so that the media keys behave as expected.
47. As a viewer, I want a progress bar with elapsed and remaining time and a preview image while seeking (when available), so that I know where I'm jumping to.
48. As a viewer, I want the controls to hide after a few seconds without input, so that they don't cover the picture.
49. As a viewer, I want ▲ to open a panel where I pick the dubbing track, subtitles and quality, so that I can watch the version I prefer.
50. As a viewer, I want my audio and subtitle choices remembered for the whole series, so that I don't reselect them every episode.
51. As a viewer, I want my preferred quality remembered across titles, so that I set it once.
52. As a viewer, I want a "Next episode in 10 s" card near the end of an episode, so that I can keep watching without going back to the menu.
53. As a viewer, I want CH ▲▼ in the player to go to the next or previous episode, so that I can skip episodes quickly.
54. As a viewer, I want Back in the player to close the panel first, then hide the controls, then leave the player, so that I never exit by accident.

### Progress sync

55. As a viewer, I want my position saved to kino.watch regularly while watching, so that progress survives a crash or power cut.
56. As a viewer, I want my position saved straight away when I pause, leave, switch episodes, press Home or the TV goes to standby, so that I resume at the exact spot.
57. As a viewer, I want titles to count as watched at about 90%, so that the credits don't leave them stuck in Continue watching.
58. As a viewer, I want Resume to use the position from whichever device I last watched on, so that the TV, phone and computer agree.

### Live TV and Sport

59. As a viewer, I want a TV tab with live channels in a grid, so that I can watch kino.watch's live channels.
60. As a viewer, I want a Sport tab, so that sports channels and content are one press away.
61. As a viewer watching live TV, I want CH ▲▼ to switch channels, so that channel surfing works like normal TV.
62. As a viewer watching live TV, I want the channel name, and the current programme when available, instead of a seek bar, so that the controls fit live content.

### Remote, focus and navigation

63. As a viewer, I want to do everything with only the arrows, OK and Back, so that the slim remote that came with my TV is enough.
64. As a viewer, I want Back to return me to exactly where I was, with the same card focused and the same scroll position, so that going back never loses my place.
65. As a viewer, I want each row to remember which card I had focused, so that moving up and down between rows feels natural.
66. As a viewer, I want Back on Home to ask "Exit app?" instead of closing immediately, so that I don't quit by accident.
67. As a viewer, I want the focused card to lift, scale up and catch a light reflection, so that I always know where I am on screen.
68. As a viewer, I want focus moves and scrolling to stay smooth on my TV, so that the app feels premium rather than laggy.
69. As a viewer, I want the app to pause and save my position when I press Home, and show the paused player when I come back, so that switching apps is safe.

### Language and settings

70. As a Russian-speaking viewer, I want the interface in Russian by default, so that it matches kino.watch.
71. As an English-speaking viewer, I want the interface in English when my TV is set to English, so that the app speaks my language automatically.
72. As a viewer, I want to change the interface language in Settings, so that I'm not bound to the TV's setting.
73. As a viewer using English, I want original titles shown alongside Russian ones where available, so that I recognise international titles.
74. As a viewer, I want to set my default quality and preferred dubbing language in Settings, so that playback starts the way I like.
75. As a viewer, I want to switch 4K, HEVC and HDR on or off in Settings, so that I can work around network or display problems.
76. As a viewer, I want to choose the kino.watch server region in Settings, so that I can pick the fastest server for my location.

### Errors and resilience

77. As a viewer, I want a clear "No connection" screen that disappears by itself when the network returns, so that I know what's wrong and don't have to restart the app.
78. As a viewer, I want failed loads retried automatically before I see an error, so that brief network hiccups go unnoticed.
79. As a viewer, I want an error in one part of a screen (such as a single Home row) to leave the rest working, so that one failure doesn't block the app.
80. As a viewer, I want every error to have a focused Retry action, so that I can always recover with the remote.
81. As a viewer with an expired subscription, I want a message with the expiry date and where to renew, while browsing still works, so that I understand why playback is blocked.
82. As a viewer, I want the player to try another stream version or a lower quality before giving up, so that more titles play first time.
83. As a viewer whose Wi-Fi drops mid-video, I want a "Connection lost" message and Retry that continues from the same second, so that I don't lose my place.
84. As a viewer, I want friendly empty states with suggestions (no bookmarks, no history, no results), so that empty screens still lead somewhere.
85. As a viewer, I want a broken screen to show "Something went wrong" with Retry and Back instead of a frozen app, so that one bug doesn't trap me.

### Installation and updates

86. As a kino.watch subscriber who isn't a developer, I want a step-by-step guide and a single install script, so that I can get KinoTV onto my Samsung TV.
87. As an installer, I want the script to walk me through turning on Developer Mode and connecting to my TV over Wi-Fi, so that I don't need to know Tizen tooling.
88. As an installer, I want clear guidance for creating the Samsung certificate for my TV, so that I can get through the one step that has to be done in Samsung's GUI.
89. As an installer, I want the script to sign the release with my certificate and install it, so that the app works on my TV.
90. As a viewer, I want Settings to tell me when a newer version is available, so that I know to re-run the installer.
91. As a viewer reporting a bug, I want a Diagnostics page showing the app's recent events with no secrets in it, so that I can attach useful information to a GitHub issue.

### Development and maintenance

92. As a developer, I want to run the app in Chrome on my Mac with the keyboard acting as the remote, so that I can build features without deploying to the TV.
93. As a developer, I want one command to build, sign, install and launch the app on my TV over Wi-Fi, so that testing on the device is quick.
94. As a developer, I want to debug the app on the TV from Chrome DevTools on my Mac, so that I can investigate device-only problems.
95. As a developer, I want an interactive setup script for the Tizen tools, TV connection and certificate, so that my Mac (and a contributor's) is ready quickly.
96. As a developer, I want automated tests that drive the whole app with remote key presses against a fake kino.watch API, so that focus and navigation bugs are caught before they reach a TV.
97. As a maintainer, I want CI to run the tests on every push and attach an unsigned package and installer to each GitHub release, so that releases are repeatable.
98. As a maintainer, I want releases blocked unless the project's own API credentials are configured, so that borrowed development credentials never ship.
99. As a maintainer, I want API credentials kept out of the repository, so that secrets are never committed.
100. As a maintainer, I want the API hosts configurable, so that a kino.watch domain or API move doesn't need a code rewrite.

## Implementation Decisions

**Platform and app type**
- A Tizen web app packaged as a `.wgt`. Samsung TVs don't accept C/C++ apps from outside developers, and the Tizen C#/.NET option was rejected because the Apple TV-style design would be much harder and it can't be tested on a Mac.
- Tested target: Tizen 7.0 on the 2023 Q60C. JavaScript is compiled for about Chrome 85, so 2022 (Tizen 6.5) models should work but aren't tested.
- Playback on the TV uses Samsung's native AVPlay (HLS, HEVC, 2160p, HDR10/HDR10+, multiple audio tracks, external subtitles). The desktop development build uses an HTML video element with hls.js instead.
- Media keys (play/pause, rewind, fast-forward, stop) and channel keys are registered with the TV's input-device API. Arrows, OK and Back need no registration.

**Stack**
- React 18, TypeScript and Vite.
- Norigin Spatial Navigation for remote-driven focus.
- TanStack Query for server data; a small Zustand store for preferences and the session.
- Inter font (SIL OFL) and Lucide icons (ISC licence), both bundled.

**Modules**
- **UI:** screens, components and a screen-stack navigator. Pushing a screen records the focus key and scroll position, and popping restores them. Each screen declares its initial focus. Back on the root screen opens the exit dialog.
- **API client:** a typed kino.watch API client. Errors are normalised into one error type with kinds: network, timeout, auth, subscription, server, notFound. 15 s timeout. Two retries with backoff (1 s, 3 s) for network, timeout and 5xx errors, on reads only. Base URL and mirror are configurable (`api.service-kp.com` primary, `api.srvkp.com` mirror).
- **Auth:** OAuth 2 device flow. Request a code, show the user code, address and QR code, and poll at the server's interval. Handle authorization-pending, and request a new code on expiry. Tokens are stored in the app's private storage and refreshed 5 minutes before expiry. All concurrent requests wait on one shared refresh. A 401 triggers one refresh and retry, then sign-out with the pending screen restored after sign-in. After sign-in, the TV registers itself with kino.watch as "KinoTV · <TV model>" with the Tizen and app versions.
- **Player:** the `PlayerAdapter` interface is the contract between the player screen and the playback engine. It has two real implementations (AVPlay for the TV, HTML video for desktop) and one fake for tests. It covers:
  - Loading a media source at a start position (asynchronous).
  - Play, pause and seek-to-seconds.
  - Listing the available audio tracks, subtitle tracks and qualities.
  - Selecting an audio track, a subtitle track (or none) and a quality (asynchronous, because it may reload the stream).
  - Subscribing to time, buffering, ended, error and state-change events, with an unsubscribe handle.
  - Destroying the player.
- **Sync:** the progress reporter saves the position every 30 s, and immediately on pause, exit, episode change and the app going to the background. At ≥ 90% (or reaching the end-credits marker) the item is marked watched. Resume reads the saved position from kino.watch.
- **Platform:** the only module that touches Tizen or Samsung APIs. It handles key registration and mapping, app lifecycle (visibility, exit), storage, network status and TV info (model, language). Each part has a browser fallback, so the same build runs in Chrome.
- **i18n:** flat Russian and English dictionaries, with Russian plurals handled by the standard plural rules. The initial language comes from the TV's language and can be changed in Settings.
- **Diagnostics log:** a ring buffer of the last 200 events (requests with status and duration, player events, errors), with tokens and secrets scrubbed. It is shown in Settings → Diagnostics.

**Caching**
- Catalog, collections, genres and item details are cached for 10 minutes.
- Continue watching, I Watch, Bookmarks and History are re-fetched when their screen gains focus.
- Bookmark and follow toggles update the screen immediately and roll back on failure.

**Device capabilities**
- kino.watch's device settings are set to support 4K, HEVC and HDR, and the HLS streaming type, by default. Settings can turn them off.
- Quality "Auto" prefers 2160p when available.

**Navigation map**
- Tab bar: Search, Home, Movies, Series, I Watch, TV, Sport, Bookmarks, History, Settings.
- Sport supports both a channel grid and an item grid until the API's shape is confirmed.

**Remote key map**

| Key | Everywhere | In player |
|---|---|---|
| Arrows | Move focus | ◀▶ seek (accelerating 10 → 30 → 60 s) · ▲ settings panel · ▼ info |
| OK | Select | Play/pause |
| Back | Pop the screen, or the exit dialog on Home | Close panel → hide controls → exit |
| ⏯ ⏪ ⏩ | — | Play/pause · −10 s · +30 s |
| CH ▲▼ | Page grids | Previous/next episode or channel |

The desktop build maps Arrow keys to the D-pad, Enter to OK, Backspace/Escape to Back, Space to Play/Pause, `[` / `]` to rewind/fast-forward and PageUp/PageDown to CH ▲▼.

**On-screen keyboard**
- Russian ЙЦУКЕН (including ё and ъ) and US QWERTY (plus `' . :`), with a digits row and the keys language, space, delete and clear.
- Arrows wrap at the edges. ▼ from the bottom row moves to the results.
- Search is debounced to 300 ms, starts from 2 characters, and cancels the previous request when a new one starts.

**Visual design**
- Inspired by Apple TV / tvOS, using only original assets (no San Francisco font, SF Symbols, Apple logos or "Apple TV" naming).
- Full-bleed artwork with gradient scrims.
- A floating translucent pill tab bar; the active tab is a white pill.
- 16:9 cards for Continue watching and episodes; 2:3 posters in grids; 12 px radius.
- Focus = scale 1.1, lift, deeper shadow and a light sheen, in 200–250 ms with ease-out. Tilt is added only if it holds 60 fps on the device.
- Design tokens are CSS custom properties.

**Performance rules**
- No backdrop-filter. Frosted surfaces use a tiny upscaled image plus a translucent fill.
- Animate only transform and opacity.
- Virtualise rows and grids.
- Lazy-load images with async decoding.
- **Budgets:** ≤ 300 KB gzipped JS excluding the font; ≤ 3 s cold start to an interactive Home on the Q60C; 60 fps focus moves.

**4K**
- Video plays at up to 2160p with HDR.
- The UI is laid out at 1920×1080 logical pixels, with the largest available artwork for backdrops.
- If the week-one device check shows the UI layer can render at 2160p, the viewport switches to 3840×2160 with 2× scaling.

**Credentials**
- The client ID and secret are injected at build time from a git-ignored local environment file.
- Development uses an existing open-source client's credentials.
- CI refuses to publish a release without the project's own credentials from repository secrets.

**Packaging**
- The app manifest declares the app ID and the name "KinoTV", landscape 1920×1080, the internet, TV input-device, application and system-info privileges, network access limited to the kino.watch API and CDN domains once confirmed, and the icon and splash screen.
- The version is synced from the package version at build time.

**Distribution**
- GitHub Releases hold an unsigned `.wgt` plus the installer script.
- Each user signs the app with their own Samsung certificate tied to their TV's ID.
- The app checks the latest release at most once a day and shows "Update available" in Settings.

**Week-one verification spikes** (before most of the UI is built):
1. The live device-flow sign-in and the kino.watch sign-in address.
2. AVPlay on the Q60C: 2160p HDR, audio-track switch and external subtitles.
3. UI graphics-plane resolution.
4. What "Sport" is in the API.
5. Scroll performance of a 30-card virtualised row on the Q60C.

## Testing Decisions

**What makes a good test here**
- It checks external behaviour only: what a viewer sees and can do with the remote, and what the app sends to kino.watch.
- It never asserts on component internals, store contents, hook calls or the module structure.
- A test should survive refactoring any module behind a seam.

**Seams (agreed)**
1. **Primary seam: the whole app, driven by remote key presses, against a fake kino.watch HTTP API.**
   - Playwright runs the real app in Chromium at 1920×1080 and uses only remote keys (arrows, OK, Back, media and channel keys, through the desktop key mapping).
   - The fake API intercepts the app's HTTP requests, so the real API client, auth, token refresh, caching and sync logic all run for real.
   - Assertions cover visible UI, which element has focus, and recorded requests to the fake API (for example, a progress save with time ≈ 30 s).
   - A controllable clock covers timing behaviour: device-flow polling and code expiry, token refresh timing, 30 s progress saves, controls auto-hide, the next-episode countdown and the search debounce.
   - Tizen lifecycle behaviour is covered through the browser fallbacks: visibility changes stand in for Home and standby, and network on/off events stand in for Wi-Fi drops.
2. **Player seam: `PlayerAdapter`, with a fake player.**
   - The fake player reports scripted tracks, time, buffering, end-of-media and errors.
   - It is used to test track pickers and track memory, quality switching, the fallback to another stream version or lower quality, "Connection lost" and retry-from-position, the 90% watched threshold, next episode and channel zapping.
- **Small direct tests:** allowed only for pure logic that is awkward to reach through the UI. Examples are keyboard layout wrapping and layout switching, and Russian plural selection.
- **Not separately seamed:** the API client, auth and sync modules are tested through the primary seam, not unit-tested one by one.

**Key journeys at the primary seam**
- Sign-in (including code expiry and token refresh racing concurrent requests) → Home → title page → play → Back restores focus.
- Search in Russian and English.
- Bookmark add and remove (including rollback on server rejection).
- I Watch ordering by new episodes.
- History resume.
- The exit dialog.
- The offline screen and automatic recovery.
- An expired subscription.
- The per-row error on Home.
- Empty states.
- Settings changes (language switch re-renders the UI; 4K/HDR switches update the device settings sent to the API).

**Device checks (manual, on the Q60C, per release)**
- AVPlay 2160p HDR start.
- Audio-track and external-subtitle switching.
- Quality switching.
- Media and channel keys.
- Home/standby resume.
- 60 fps scrolling.
- Cold start ≤ 3 s.

**Prior art:** none. This is a new repository, and these tests set the pattern for the project.

**CI:** both automated test layers run on every push. Releases need a green run.

## Out of Scope

- Samsung app store (Seller Office) submission.
- Voice search, Smart Hub preview tiles and casting from a phone.
- Downloads or offline playback.
- Multiple profiles or account switching within the app.
- Officially supporting TVs older than Tizen 6.5 (2022 models), or testing on anything other than Tizen 7.0.
- In-app self-updating. Samsung doesn't allow sideloaded apps to update themselves; updates are done by re-running the installer.
- Samsung's TV emulator, which doesn't run on Apple Silicon.
- A Tizen C#/.NET version or any native C/C++ code.

## Further Notes

- kino.watch is the new name of kino.pub. The legacy API hosts still responded on 2026-11-02, but sign-in addresses and domains must be confirmed in week one.
- KinoTV is unofficial. It must not use kino.watch's or Apple's branding as its own.
- Public release depends on getting the project's own API credentials from kino.watch support. Drafting that request is a pre-release task.
- The approved visual mockups (Apple TV-inspired home, title page, player, settings panel and RU/US keyboards) are kept locally in the brainstorming workspace and can be exported as images for the README.
- Sideloaded installs require each user's own Samsung certificate. The installer documentation is a first-class deliverable, not an afterthought.
