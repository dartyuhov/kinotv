# Integrated TV acceptance checklist

Use this checklist for the coordinated KinoTV device session. Review-fix checks
and remaining browser flakes are recorded below. Every device item is **pending**;
no TV deployment or native acceptance occurs during this integration session.
Record active progress and results in `kinotv-91o.26.12` and
`kinotv-91o.26.13`.

## Tested source and build

The integration owner merges review tip `aadc9ed` (including product fix
`8736327`) without conflicts as
`c357cf85e511b3af93cb144abf373f977779ae1a` on
`integration/kinotv-135`. Local acceptance on November 13, 2026, uses Node
`v22.23.3` and npm `10.9.9`.

| Integration-owner command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | 243 tests pass across 25 files |
| `npm run build` | Pass; 132.3 KiB gzip JS / 300 KiB budget |
| `E2E_PORT=5220 npm run e2e -- --workers=1` | 222 pass, 1 fail, 3 skipped; 1.9 minutes |
| Watched, History, player, next-episode, and session E2E, port 5220 / one worker | 53 pass; 25.0 seconds |
| Unchanged I Watch quick-revisit case, 10 isolated repetitions | 8 pass, 2 fail |
| Synchronized I Watch quick-revisit case, 10 isolated repetitions | 10 pass |
| Complete I Watch spec after synchronization | 10 pass |
| `git diff --check` | Pass |

The sole full-suite failure is `e2e/iwatch.spec.ts:65`, already tracked in
`kinotv-91o.23`. The failure trace shows TV and I Watch both mount, but only two
subscribed-list requests occur: Home's initial request and the first I Watch
mount's refresh, both with the old fixture list. The immediate return does not
start a third request. A cached visible card does not establish that the initial
refresh has settled; the quick remount can share existing query work. The
following query ignores the query cancellation signal. The review merge changes
neither this query nor the tab, navigation, or failing test.

Test-only commit `a161cdd` waits with the existing `clock.settle()` helper before
simulating a subsequent phone-side change. The original symptom reproduces in
2/10 isolated runs; the synchronized sequence passes 10/10 and the complete
I Watch spec passes 10/10. This establishes a test sequencing repair, not a
guarantee that every rapid revisit with an overlapping real request refreshes
again. Keep that overlap behavior and the remaining artwork/unit timing work
under `.23`. No further full-suite run is performed, so the final tree has a
green affected suite and targeted repair verification, **not a green full-suite
result**. Both formerly failing artwork journeys pass in the integrated full run.
The three skips remain opt-in artwork/performance benchmarks.

Integration review confirms one captured watched owner shared by manual actions
and playback, sequential fresh reads and reconciliation without transport
mutation retries, and session-generation guards around reads and token renewal.
Normal sign-out/expiry and subsequent sign-in replace that owner; token refresh
does not. History cancellation, season-scoped selection, Retry transport intent,
and shared progress invalidation remain wired together. External subtitle
confirmation requires adapter activation for the matching local path;
asynchronous READY remains pending. Samsung API documentation confirms the
activation calls require PLAYING/PAUSED. These checks do not prove TV rendering.

The production hashes below match the integration-owner build exactly. The later
test synchronization and this evidence update change no production source.
Integration `.12` is accepted locally with the disclosed `.23` follow-up; device
acceptance `.13` remains open, and every device checkbox below remains pending.

### Review-branch evidence before integration

The following results are the review implementer's handoff, before the merge.

The latest review-fix source is
`87363278dc542ebc9307bef71e59377fa513a8e9`, on `improve/review-fixes`,
tested on November 13, 2026, with Node `v22.23.3` and npm `10.9.9`.
Merging the current `integration/kinotv-135` tip (`827969a`) into this branch
reports **Already up to date**. This branch has not been merged into integration.

All six review findings are confirmed and addressed: account-scoped serialized
watched actions shared with playback, canceled late History navigation,
season-scoped episode selection, paused/playing Retry intent, confirmed external
subtitle state, and shared progress invalidation. External subtitle **selected**
means the adapter's activation commands succeeded for the matching local path.
Path submission in asynchronously prepared READY remains pending until activation;
neither simulated confirmation nor successful commands prove TV rendering.

| Review-fix command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | 243 tests pass across 25 files |
| `npm run build` | Pass; size report 132.3 KiB gzip JS / 300 KiB budget |
| Affected watched, History, player, and next-episode E2E | 47 pass |
| `E2E_PORT=5224 npm run e2e -- --workers=1`, first full run | 221 pass, 2 fail, 3 skipped |
| Same command, sequential full rerun | 222 pass, 1 fail, 3 skipped |
| Targeted reruns of each failed journey | All 3 pass |
| `git diff --check` | Pass |

The first full run fails artwork reload timing and I Watch tab refresh. Both
pass on targeted rerun. The sequential full rerun passes those cases but fails
the existing stale idle-prefetch validation journey, which passes in isolation.
The full suite is not unconditionally green. Track timing-sensitive browser
follow-up in `kinotv-91o.23`; all review-specific journeys pass. The three skips
remain opt-in artwork/performance benchmarks.

The latest production output is `dist/assets/index-DNfS_Zxg.js` and
`dist/assets/style-B-rhUmgg.css`. SHA-256 identities are:

```text
14a10c91e4e4a28aa9c6aacd216f8a167c13e7ff63a621a82d678ade323af4e8  dist/assets/index-DNfS_Zxg.js
2d0155920a9a2c8579294376640818dcf7cb336a147e682dd1d9b38eb86282e1  dist/assets/style-B-rhUmgg.css
b59a227855cc3360f3059be2d8d498f01a9ccdd3e6e69d6a3d668ee778b85e44  dist/index.html
```

This evidence update follows the tested product commit and changes documentation
only. Browser tests use fake HTTP/FakePlayer; no package is installed or tested
on the TV. Record the eventual installed package identity separately.

### Earlier combined integration baseline

The following results describe the earlier build, before the review fixes.

The combined local checks run on November 13, 2026, from clean source revision
`a298c8009610c67f0ffe80e2afd4d57ee311e9d1`, on branch
`integration/kinotv-135`, with Node `v22.23.3` and npm `10.9.9`.

The final three merges preserve the feature commits and their evidence:

| Lane | Feature tip | Integration merge |
| --- | --- | --- |
| Live TV | `30414d0` | `238e20a` |
| Artwork diagnostics | `94c4ebd` | `d20f20b` |
| Crash diagnostics | `dfcddc8` | `a298c80` |

All three merge without textual conflicts. Earlier playback, watched/history,
player UI, startup, and shared fixture changes remain included. The combined
cache publication repair and both diagnostic suites remain present.

| Command | Combined result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | 238 tests pass across 25 files |
| `npm run build` | Pass; size report 131.8 KiB gzip JS / 300 KiB budget |
| `E2E_PORT=5220 npm run e2e -- --workers=1` | 217 pass, 3 skipped, 0 failures; 1.9 minutes |
| `git diff --check` | Pass |

The three default skips are the artwork stage probe and the two performance
benchmarks. They remain opt-in. No combined failure requires a narrow rerun or
integration repair. Earlier isolated benchmark evidence is recorded in
[artwork diagnostics](artwork-diagnostics.md) and
[crash diagnostics](crash-diagnostics.md); those measurements are feature-lane
evidence, not new measurements of the combined build.

The production output is `dist/assets/index-D9KGCbu-.js` and
`dist/assets/style-B-rhUmgg.css`. SHA-256 identities are:

```text
1a46de7ac4b19cb69ce6901b1e64fc4b4ec061e4fe670e361b43d685a808dffd  dist/assets/index-D9KGCbu-.js
2d0155920a9a2c8579294376640818dcf7cb336a147e682dd1d9b38eb86282e1  dist/assets/style-B-rhUmgg.css
716266e9978e11594526df4ece2e877a852352d65e3170023a4af0af79c6cf9c  dist/index.html
```

Browser E2E uses a separate `dist-e2e` build with fake HTTP and FakePlayer.
The production `dist` build is not packaged, installed, or tested on a TV here.
This document is added after the tested merge revision; it changes no runtime
source. Record the eventual installed package identity separately.

## Record each device result

One integration owner coordinates the shared TV and preserves its signing
identity, session, and preferences. Before testing, record the installed source
revision, package hash, TV model, firmware, browser/runtime, playback adapter,
and test time. For each item below, record **pass**, **fail**, or **blocked**,
with sanitized evidence and viewer observations. An unchecked item is pending.

### Playback and controls

Check native media output and physical remote behavior together. Capture exact
item/media identities without copying signed URLs or account response bodies.

- [ ] Reproduce the original **The Sopranos S4E1** scenario and verify native
  picture, sound, start, resume, and continued playback.
- [ ] Identify the exact reported latest **Spider-Man** film and verify the
  same behavior; leave identification blocked if the title remains unknown.
- [ ] Verify an unaffected film and series episode, next-episode progression,
  and Back focus restoration.
- [ ] Verify refreshed Retry after stale links, recoverable errors, and leaving
  while a fresh-link request or native prepare is pending. Verify paused Retry
  stays paused and playing Retry resumes with fresh links at the same position.
- [ ] Compare full audio names, language, and selected/pending state with the
  actual audible track; verify same-language tracks remain distinguishable.
- [ ] Verify subtitle identity, disable/enable, fixed quality, Auto quality,
  paused position, and native picture/sound after changes. External subtitles in
  asynchronously prepared READY must remain pending until activation; compare
  the confirmed state with actual visible subtitles after Play.
- [ ] Verify unchanged seek steps, held acceleration, preview bounds, seek
  confirmation, pause/play, and Back semantics with the physical remote.
- [ ] Confirm centered settings dialog, long-label wrapping, focus visibility,
  scrolling, and controls readability at normal viewing distance.

### Watched state and history

Confirm service persistence as well as local screen updates. Browser fixtures
do not establish the authorized account's response shape or stored results.

- [ ] Reach episode and season watched actions with the physical remote;
  confirm readability, pending focus, and play behavior.
- [ ] Mark an episode and the selected season; verify already-watched no-op,
  repeated OK protection, partial failure recovery, and other-season isolation.
- [ ] Leave and reopen during a pending watched action, overlap manual marking
  with playback's automatic watched mark, and verify no episode becomes unwatched.
- [ ] Switch between seasons with overlapping episode numbers; verify the action
  targets the current season's selected episode.
- [ ] Confirm watched state persists after restart and refreshes related tabs.
- [ ] Confirm actual history media compatibility, newest ordering, pagination,
  refresh after playback, and exact episode and film-part resume.
- [ ] Verify watched replay starts at zero, unavailable entries and Retry remain
  usable, and Back returns to the original history entry.
- [ ] Leave History by another tab or Back during a delayed open; verify its late
  response never launches the player.

### Live TV and Sport

Validate the actual service inventory and native live behavior independently
from the mocked source coordination checks.

- [ ] Confirm authorized `/v1/tv` inventory shape, channel identity, order,
  logos, empty/error handling, and direct-source compatibility.
- [ ] Confirm native picture/sound, codec/DRM/CORS compatibility, and the actual
  default live edge on entry and refreshed Retry.
- [ ] Verify CH Up/Down nonwrapping bounds, unavailable-channel skipping,
  repeated rapid switches, and Back restoration to the opening grid card.
- [ ] Verify ended, removed-channel, stale-source, and late-request recovery
  without substituting a different broadcast.
- [ ] Verify no seek/timeline or watched/history writes after more than
  30 seconds, pause, end, stop, and Back.
- [ ] Background during source fetch, native prepare, and playback; confirm
  engine release and fresh foreground resolution paused until explicit Play,
  without a cached VOD position.
- [ ] Confirm Sport truthfully explains unavailable classification and
  **Go to TV** works. Reliable sport taxonomy and recorded sport remain deferred.

### Startup and saved state

Use actual process restarts and a power cycle to verify installation storage.

- [ ] Verify startup picker focus, selection, cancel/Back, and readable labels.
- [ ] Select a root tab, visit another tab, fully close/relaunch, and power
  cycle; confirm the selected startup tab persists.
- [ ] Verify Home default/fallback, temporary reauthentication retaining the
  current screen, and unrelated account/image preferences remaining intact.

### Artwork and crash investigation

Follow the detailed diagnostic procedures linked above. Keep physical display
observations separate from JS heap and browser-only resource estimates.

- [ ] Compare cold, same-session warm, and restarted browsing with comparable
  timing; record layout-to-sharp readiness and perceived remote response.
- [ ] Verify sharp images, stable layout, failed-image placeholders, cache
  reuse, and bounded outgoing artwork during repeated scrolling and reversal.
- [ ] Verify cache clearing and storage failure recovery preserve the session
  and unrelated preferences.
- [ ] Repeat browse/play/stop/background/foreground and reauthentication cycles;
  record elapsed actions, cycle counts, and the first failure if any.
- [ ] Distinguish process crash/restart, native stall/error, Sign-in, and
  inspector disconnect using process identity/liveness when available.
- [ ] Record comparable process RSS/native/GPU trends and available termination
  reason; mark unavailable metrics explicitly. JS heap alone does not confirm
  or reject native memory exhaustion.
- [ ] For an evidenced failure, record a concrete follow-up and repeat its
  original sequence after a targeted repair before accepting that item.

## Next steps

Close integration `.12` after recording the local merge, review, and verification
evidence above. Keep browser timing follow-up `.23` and device acceptance `.13`
open. Playback `.1`, artwork `.3` and `.25.2`, audio labels `.7`, player UI `.8`,
and crash `.9` retain their unresolved native acceptance; the crash cause and
memory hypothesis
remain unestablished. Local regression success does not close these reports.
