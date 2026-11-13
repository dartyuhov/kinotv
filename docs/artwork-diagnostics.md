# Artwork presentation diagnostics

Local checks on November 13, 2026 reproduce and fix a persistent-image
presentation delay. A prepared legacy cache record waits for replacement-file
admission before publishing its display URL. The repair publishes validated
bytes first and keeps admission in the `ready` and `settled` contracts.

## Measurement method

You can reproduce the stage probe from `improve/artwork-diagnostics`, based on
integration commit `3d3b59b`:

```sh
npm ci
E2E_PORT=5222 KINOTV_BENCH=1 npx playwright test e2e/artwork-performance.spec.ts --workers=1
```

The probe runs the production build in local Chromium with synthetic service
responses, a 3840×2160 backdrop, a 250×375 poster, and 80 ms fake-CDN delays.
It records layout, request headers/body completion, file/metadata reads,
preparation, encoding, image load, display-ready class publication, and write
completion. Each run attaches `artwork-stages.json` to its Playwright result.
Instrumentation lives only in the opt-in test.

The four phases use the same title: cold launch, Home-to-Movies-to-Home session
revisit, persistent reload, and reload after restoring a historical unprepared
4K record through IndexedDB. Movies has an empty fixture to avoid unrelated
artwork traffic. The legacy phase delays completion notifications for large
write transactions by 600 ms. Both temporary-file and commit transactions incur
that delay; actual IndexedDB transactions complete normally. This is a
controlled storage-pressure probe, not a model of measured TV disk latency.

The benchmark runs alone in this lane on port 5222 with one worker. Other
agents can run ordinary tests on the same host, so scheduling-dependent timings
are descriptive. The deterministic signal is publication before admission,
also covered by a public-cache test with an explicitly blocked write.

## Before and after

The baseline uses unchanged product code from `3d3b59b` with the probe added.
The repaired run uses the same probe and fixtures. Times below measure layout
to the sharp image's loaded-class onset, not completion of the 400 ms CSS fade
or physical display output.

| Phase | Before | After | New requests, before/after | Body bytes, before/after |
| --- | ---: | ---: | ---: | ---: |
| Cold launch | 400 ms | 396 ms | 3 / 3 | 30,524 / 30,524 |
| Session revisit | 203 ms | 204 ms | 0 / 0 | 0 / 0 |
| Persistent restart | 206 ms | 206 ms | 0 / 0 | 0 / 0 |
| Legacy preparation restart | 1,517 ms | 316 ms | 0 / 0 | 0 / 0 |

The legacy baseline spends 51 ms preparing the bitmap and 57 ms encoding it.
The repaired run also spends 51 ms and 57 ms. In the baseline, encoding finishes
at 360 ms, write notifications arrive at 961 ms and 1,564 ms, and sharp readiness
arrives at 1,565 ms. After repair, encoding finishes at 353 ms and readiness at
355 ms; write notifications follow at 956 ms and 1,559 ms. These timestamps are
relative to each phase's document probe, whereas the table subtracts layout.

The removed gap is the controlled two-transaction admission wait. Cold launch,
ordinary session reuse, and prepared persistent reuse show no demonstrated
speed improvement. Their roughly 200 ms warm backdrop gap is consistent with
the existing focus-settle timer. Warm display emits no file-read or preparation
events; restart reads and validates the stored representation without another
body download. The ordinary cache path already works as designed locally.

## Repair and regression coverage

The change stays inside `src/core/images/cache.ts`. After preparation, fresh
persistent bytes publish before the replacement write. Permitted stale bytes
can also publish first; `no-cache` and `must-revalidate` retain their display
restrictions. A consumer leaving during admission releases its display URL,
cancels replacement publication, and leaves the original record usable.

The existing 50 MiB logical-file limit, temporary/metadata accounting,
45/40 MiB cleanup, LRU, 2,000-entry limit, 5 MiB response limit, two download
slots, serialized preparation, bounded compressed session cache, prefetch,
retention, and generation-safe clearing remain in force. Current resizing and
WebP encoding policy is preserved. Earlier no-transcoding wording conflicts
with the shipped code; this repair does not resolve that broader policy choice.
The 200 ms settle, 400 ms fade, and progressive layout remain in place.

Verification records:

- The new public-cache test fails before the repair: zero display publications
  while the prepared replacement write is blocked. It passes after the repair.
- The browser probe fails before the repair because sharp readiness follows
  the delayed write notification. It passes after the repair.
- All 235 unit tests pass, including cancellation during replacement admission.
- All 41 image journeys pass with one worker on port 5222. They cover resource
  release, sharp dimensions, failed-image placeholders, remote navigation,
  cache freshness, bounded retention/prefetch, eviction, and cache clearing.
- Typecheck and production build pass; production JavaScript is 130.0 KiB gzip
  under the size-report tool's 300 KiB budget.
- The existing realistic-artwork benchmark passes in a separate isolated run
  with 4× CPU throttling and its memory assertions enabled. Its maximum sampled
  displayed-image lower bound is 14,669,976 bytes (13.99 MiB), below 16 MiB;
  its largest image is 2,073,600 pixels. It transfers 197,836 synthetic bytes.
  This estimate excludes native/GPU allocations and is not process memory.

Run the resource benchmark independently of other checks:

```sh
E2E_PORT=5222 KINOTV_BENCH=1 KINOTV_PERF_BUDGETS=1 npx playwright test e2e/performance.spec.ts --grep "realistic artwork" --workers=1
```

## Remaining acceptance

These observations establish an avoidable local presentation dependency. They
do not establish that legacy migration causes the viewer's reported Samsung TV
lag, quantify native storage/decoder/GPU cost, or prove a TV improvement.
Startup inventory and serialized storage can still delay demanded reads;
existing tests show demanded images can display before the inventory completes,
but no new TV bottleneck attribution follows from that test.

Keep `kinotv-91o.25.2` and the reported TV problem unaccepted pending the
coordinated `kinotv-91o.26.13` session. Compare cold, warm, and restarted browsing
on the integrated build, confirm sharpness and perceived remote responsiveness,
and record native timing and resource evidence. This lane performs no device
deployment or real-account access.
