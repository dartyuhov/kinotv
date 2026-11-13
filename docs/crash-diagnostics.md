# Local crash investigation

Local checks on November 13, 2026, do not reproduce the reported intermittent
TV crash. They demonstrate cleanup under the tested browser conditions, but
neither confirm nor reject memory exhaustion on the TV. No runtime repair is
justified by these results.

## Reproduction conditions

The investigation starts from integration commit `3d3b59b` in the isolated
`improve/crash-diagnostics` worktree. Dependencies come from `npm ci` in that
worktree. Playwright serves the production-targeted build on port 5223 with one
worker, fake HTTP responses, and FakePlayer. No real service or TV is involved.

The existing benchmarks use local Chromium with 4× CPU throttling. Browsing
uses 100 titles, 4K backdrop inputs, 60 remote moves, and three title-page round
trips. Playback opens, advances for ten simulated seconds, and stops 20 times.
Measurements follow explicit garbage collection.

## Observations

The existing 46 image-memory, image-navigation, player, and session journeys
pass. Both isolated benchmarks pass with their existing resource budgets.

| Observation | Result |
| --- | ---: |
| Maximum sampled displayed-artwork lower bound | 15,044,976 bytes |
| Maximum sampled image size | 2,073,600 pixels |
| Player teardown nodes, first and twentieth cycles | 129 / 129 |
| Player teardown listeners, first and twentieth cycles | 161 / 161 |
| Post-GC heap, first teardown | 3,878,680 bytes |
| Post-GC heap, twentieth teardown | 4,644,324 bytes |
| Post-GC heap growth, eleventh to twentieth teardown | 94,876 bytes |

Heap growth over the latter half stays below the existing 512 KiB budget.
Warmup, query caching, and retained fake-player call history prevent attributing
the total heap difference to a leak. The displayed-artwork estimate excludes
GPU copies, native decoder buffers, browser caches, and decode scratch space.
It is not process RSS.

The dedicated `e2e/crash-lifecycle.spec.ts` journeys add these checks:

- Ten playback/background/foreground/stop cycles each invoke exactly one
  pause, suspend, and restore callback per visibility round trip. Playback
  remains paused after foregrounding.
- After each exit, visibility events invoke no old player callbacks, and
  advancing 31 seconds produces no additional progress writes.
- A progress-save 401 followed by a rejected refresh shows Sign-in and destroys
  the old player. Approval returns to the player with one active lifecycle.
  Exiting again stops progress writes and destroys that player.
- Uncaught page errors and browser page crashes fail either journey.

Both journeys pass individually and across three additional repetitions. The
first draft pressed OK before asynchronous title focus was ready; waiting for
the focused Play button corrects the test setup. This was not an application
crash. Session-expiry Sign-in is also distinct from process termination.

## Repeat the local checks

Run the timing benchmarks in isolation. The other checks verify application
behavior and build compatibility.

```sh
npm ci
E2E_PORT=5223 npm run e2e -- --workers=1 e2e/image-memory.spec.ts e2e/image-navigation.spec.ts e2e/player.spec.ts e2e/session.spec.ts
KINOTV_BENCH=1 KINOTV_PERF_BUDGETS=1 KINOTV_STRESS_CYCLES=20 E2E_PORT=5223 npm run e2e -- --workers=1 e2e/performance.spec.ts
E2E_PORT=5223 npm run e2e -- --workers=1 e2e/crash-lifecycle.spec.ts --repeat-each=3
npm test
npm run typecheck
npm run build
```

The baseline passes 233 unit tests, typecheck, and production build. Benchmark
JSON is attached to each Playwright result. These local generated artifacts
are not committed.

## Next steps: coordinated TV evidence

The integration owner's final acceptance session must establish the actual
failure sequence before selecting a repair. Use the existing installation and
preserve the session and preferences.

1. Record the exact integrated commit/build, TV model, firmware, browser
   version, and whether playback uses AVPlay. The historical report alone
   does not establish a current reproduction sequence.
2. Record elapsed time and remote actions through browsing, title entry,
   playback, stop/Back, Home/standby, foregrounding, and reauthentication.
   Repeat the same sequence and record the cycle at which any failure occurs.
3. Distinguish process termination or restart from a playback error, a stalled
   native operation, a Sign-in transition, and an inspector disconnect. Record
   process identity/liveness separately from inspector connectivity when the
   existing device tools expose it.
4. Capture available process RSS/native/GPU measurements at comparable settled
   points before playback and after teardown across cycles. Record unavailable
   metrics explicitly. A browser JS heap snapshot alone cannot settle the
   native-memory hypothesis.
5. Capture the available termination reason or bounded error identifiers and
   timestamps. Omit signed media/artwork URLs, credentials, account bodies,
   and unfiltered vendor messages from shared evidence.
6. Route an evidenced artwork or live/player defect to its owner. After a
   targeted repair, repeat the original failure sequence under the recorded
   conditions and verify preferences and session preservation.

Memory exhaustion remains an unconfirmed hypothesis. A missing native AVPlay
callback can leave its serialized lane waiting, which is a playback-stall
hypothesis rather than crash evidence. Resetting that lane while native work
is outstanding is not justified by this investigation.
