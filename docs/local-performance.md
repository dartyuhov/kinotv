# Local performance investigation

## Reverted Home layout experiment

The viewer requested a simpler Home after the vertical-scroll investigation,
then reported no speed improvement and requested its reversal. The original
hero, backdrop, Continue watching, New episodes, New releases, Popular, and
Collections layout is restored, and the initial artwork-loading gate is removed.
The following measurements describe the reverted experiment, not current Home.

The experimental Home contained only **New episodes**. It did not mount the
hero, Continue watching, New releases, Popular, Collections, or a full-screen
backdrop.

Before revealing the row, the experiment acquired and decoded every poster in its initial
visible viewport, including the remembered viewport on return from a title.
Offscreen posters load as you browse. Failed images fall back to their titles;
a 15-second deadline prevents unavailable artwork from blocking startup forever.
An empty followed-series list displays an explanatory message.

The cache retains at most 8 MiB and 128 entries of validated compressed artwork
for session revisits. It releases display URLs when their leases end. Startup
reconciliation yields between records, so demanded persistent images can display
before the entire inventory scan finishes. Persistent writes still wait for
reconciliation and retain the existing 50 MiB accounting rules.

Direct inspection of the experimental TV build reported one
row, no hero, no backdrop layers, and all eight visible posters loaded. Their
decoded-image lower bound is 2.86 MiB. The updated local realistic-artwork
benchmark records 635 ms cold startup, 380 ms warm startup, and 2.86 MiB of
Home artwork; browsing samples reach 6.44 MiB. These estimates exclude native
and GPU memory. The experiment's preparation and empty-state tests were removed
when the original layout was restored. The restored Home journeys cover the
hero, row navigation, focus restoration, and virtualization.

To inspect the revised Home without exposing title or account data, run:

```sh
node tools/tizen/profile-ui.mjs <inspector-port> home
```

Local profiling on November 5, 2026 identifies oversized decoded artwork as a
significant memory-pressure source. The fixes reduce the measured resident
artwork lower bound by 75%. These measurements do not establish that the
reported Samsung TV crash is an out-of-memory termination.

## Method

The opt-in Playwright benchmarks run against the production Chrome 85-targeted
build in current local Chromium with 4× CPU throttling. Browsing uses 100 titles,
3840×2160 backdrops, 500×750 large posters, and 250×375 medium posters. Each run
performs 60 remote moves and three title-page round trips. Playback uses the
existing fake player, including 250 ms time events and repeated open/stop cycles.

The harness records post-GC JS heap, DOM nodes, event listeners, cumulative CDP
script/layout/task time, image dimensions, navigation latency, and fixture
transfer bytes. The decoded artwork estimate counts unique displayed image URLs
at four bytes per pixel. It excludes GPU copies, decoder scratch allocations,
browser caches, and native video buffers; it is not process RSS.

The original browser tests use 16×9 artwork, which cannot expose realistic
decoded-image pressure. The new image-memory tests cover real 4K images,
persistent resized reuse, the fallback without ImageBitmap, and oversized raster
headers rejected before decode.

## Results

The initial baseline and three final browsing runs give these results. Timing
figures are descriptive local observations, not TV performance guarantees.

| Metric | Initial baseline | After optimization |
| --- | ---: | ---: |
| Home decoded artwork lower bound | 43.09 MiB | 10.77 MiB |
| Browsing decoded artwork lower bound | 44.52 MiB | 11.13 MiB |
| Title-page decoded artwork lower bound | 31.64 MiB | 7.91 MiB |
| Largest decoded image | 8,294,400 pixels | 2,073,600 pixels |
| Browsing listeners, before reload | 364 | 274 |
| Navigation p95 | 38 ms | 34–36 ms |
| Fixture artwork transfer | 311,067 bytes | 197,836 bytes |
| Cold startup to loaded backdrop | 627 ms | 822–830 ms |
| Warm startup to loaded backdrop | Not measured | 533–561 ms |
| Playback DOM mutations per 10 seconds | 122 | 62 |
| Production JS gzip, size-report tool | 126.0 KiB | 127.1 KiB |

Resizing adds first-use decode/encode work: cold startup is slower in this
synthetic scenario. The smaller representation is persisted, so later launches
and revisits avoid resizing the original. The solid-color fixture transfer
numbers are reproducible but do not predict real JPEG traffic. Final browsing
runs include a warm reload; cumulative CDP times across that reload are not
directly comparable with the initial baseline. No overall CPU-time or FPS
improvement is claimed.

A 50-cycle playback stress run completes without a crash. Player DOM/listeners
return to 128 nodes and 161 listeners after teardown. Post-GC heap grows during
warmup, then grows by about 0.15 MiB between cycles 25 and 50; the harness itself
retains fake-player call history. This does not indicate a large retained player
DOM leak, and it does not prove that native AVPlay releases video buffers.

## Changes

The optimization keeps ownership in the existing image cache and screen hooks:

- Select medium posters for 200×300 cards, reducing decoded poster memory to
  one quarter when medium and big sizes match the documented API dimensions.
- Bound prepared artwork to 1920×1080 without upscaling. Persist the resized
  representation while retaining the original source identity and HTTP
  validators. Existing oversized records are migrated on demand.
- Inspect PNG, JPEG, GIF, and WebP headers before decode and reject dimensions
  exceeding 16,777,216 pixels. Formats with unrecognized headers still undergo
  normal validation and post-decode sizing; this is not a universal pre-decode
  allocation bound.
- Serialize image preparation, including persistent hits. Skip cancelled work
  before storage reads and before entering the decode lane.
- Release image, bitmap, and canvas resources after preparation. Avoid copying
  ordinary fetch-stream chunks before constructing a Blob.
- Share one IntersectionObserver and one online/offline listener pair across
  cards. Remove permanent per-card compositor promotion hints.
- Keep row card styles stable and bound row/grid style maps to rendered windows.
- Update the player snapshot only when its displayed second or other state
  changes. Precise progress synchronization retains its independent time events.
- Close both MessageChannel ports in the test clock's settling helper, so the
  profiler does not count retained harness ports as app resources.

Two player journey assertions were updated to match existing source fallback
and the Up-to-open-settings behavior. The grid image-window test now starts on
the first grid row and waits for asynchronous image work before checking the
request window.

## Verification

The production build and 219 unit tests pass. The full browser suite passes
166 journeys; its two opt-in benchmarks are skipped during the normal suite.
The two benchmarks also pass across three repeated runs with memory budgets
enabled. A separate 50-cycle playback stress run exercises longer teardown
behavior.

Run the local checks from the repository root:

```sh
npm run build
npm test
E2E_PORT=5931 npx playwright test --workers=4
E2E_PORT=5931 KINOTV_BENCH=1 KINOTV_PERF_BUDGETS=1 npx playwright test e2e/performance.spec.ts --workers=1 --repeat-each=3
E2E_PORT=5931 KINOTV_BENCH=1 KINOTV_PERF_BUDGETS=1 KINOTV_STRESS_CYCLES=50 npx playwright test e2e/performance.spec.ts --grep "playback UI" --workers=1
```

Each benchmark attaches full JSON measurements to its Playwright test result.
Memory budgets check resident artwork, maximum decoded image dimensions,
playback mutations, teardown listeners, and late-stage heap growth in long runs.
Do not run timing benchmarks alongside other tests. Choose a free `E2E_PORT` if
another local process occupies the example port.

## Remaining measurement boundary

The initial optimization pass runs locally. CPU throttling does not
emulate Tizen's memory limits, GPU, browser version, decoder, or native AVPlay.
The reported TV crash remains unconfirmed. Native video-buffer pressure,
device-specific decode behavior, actual process RSS, and crash termination
reason require device-side evidence. The follow-up below adds device rendering
measurements, but does not establish a crash termination reason.

## TV rendering follow-up

After the viewer reported continued lag, direct inspection of the Samsung
TQ65Q60CAUXXC running Tizen 9.0 / Chromium 120 reproduced severe frame stalls.
Idle Home had gaps up to 367 ms. Repeated horizontal card navigation produced
170–433 ms long tasks despite submillisecond synchronous key dispatch. JavaScript
execution and layout did not account for most of the main-thread task time.

Runtime CSS probes isolated expensive backdrop/shadow rendering. Hiding the
backdrop and removing shadows/transitions reduced a diagnostic run's maximum
frame gap to 33 ms. The permanent fix preserves artwork fades, isolates the
backdrop with paint/layout containment, promotes at most two sharp image layers,
separates the scrim, and hides the redundant frosted surface once sharp art is
loaded. Cards use a light focus outline instead of blurred shadows. Horizontal
rows also resolve focus by item index instead of measuring all sibling cards.

On the installed revised build, 20 alternating left/right moves at 700 ms
intervals measured p95 frame gaps of 16.8–33.3 ms and 2–4 gaps above 50 ms.
Restoring the previous paint effects through a temporary stylesheet on the same
content measured p95 383.3 ms and 78 gaps above 50 ms. Removing the override
restored p95 33.3 ms and three gaps above 50 ms. That last run included a 350 ms
outlier, so occasional stalls remain; this is not a claim of perfect 60 FPS.
These are short device runs, and inspector overhead can affect measurements.
The saved profiler's subsequent run measured p95 33.3 ms, a 66.7 ms maximum,
and seven gaps above 50 ms. The full browser suite passes with two workers;
one resume-position journey flaked in the four-worker run, then passed three
isolated repetitions and the complete two-worker run.

The revised build is installed on the TV. To repeat the measurement, launch it
in debug mode, focus a card in a horizontal row with at least two items, and run
the following command with the inspector port printed by the launcher:

```sh
node tools/tizen/profile-ui.mjs 43317
```

The profiler drives 20 remote moves and prints frame/long-task statistics without
printing title names or account data. It requires the Node version specified in
`package.json`. The port changes between launches. Temporary CSS overrides and
diagnostic API wrappers are not part of the installed app.

## Thumbnail scrolling follow-up

The next report identified slow thumbnails and disappearing images while
scrolling. Browser regression tests reproduced immediate URL removal when a
loaded card left the viewport, and showed that prefetched neighbors did not
retain a decoded display image. Inspection also found that new artwork waited
for persistent admission before being published to the UI.

The revised lifecycle retains recently loaded offscreen cards for 1.5 seconds,
bounded globally by eight cards and 8 MiB of estimated decoded pixels. Unmount
releases resources immediately. Two directional neighbors can hold display
leases after a 150 ms idle delay, and promotion to visible demand updates
priority without releasing the URL. Downloads publish validated bytes before
the disk write completes; `ready` and `settled` still wait for admission. Leaving
the screen during admission can cancel that write, so an immediate revisit can
occasionally download the same source again.

The realistic-artwork benchmark passes its existing 16 MiB resident-image
budget: browsing samples increase from 11.13 MiB to 13.99 MiB while retaining
recent cards, still well below the original 44.52 MiB. Network fixture transfer
stays at 197,836 bytes. Tests verify reversal without URL replacement, decoded
neighbor preloading, retention expiry/count/byte limits, in-place priority
promotion, and display publication ahead of a deliberately blocked write.
All 221 unit tests and 169 browser journeys pass; both opt-in benchmarks pass.

The build is installed on the TV. A device probe moves a loaded 250-pixel poster
fully offscreen with five right moves, then returns with five left moves. It
reports the same URL throughout, zero `src` removals, and loaded artwork on
return. A subsequent frame run measures p95 33.3 ms and a 100 ms maximum over
20 alternating moves; occasional frame stalls remain.
