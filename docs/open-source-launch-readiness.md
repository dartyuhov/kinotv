# Open-source launch readiness

As of November 18, 2026, the reviewed runtime fixes are integrated and checked
locally at `bced8aa74ebb6bbf7d8ebcbec75fbc15ead6f110`. Typecheck and all 423 unit
tests pass; the single final browser run has 256 passes, one failure, and three
skips. The bookmark focus-restoration failure remains unresolved. This record
does **not** validate a deployable release candidate. Local preparation, GitHub
configuration, publication, and installation verification are separate outcomes.

The [launch spec](specs/open-source-launch.md) says, “This spec authorizes
planning.” The user's subsequent explicit implementation and evidence requests
supersede that planning-only scope. This final request authorizes documentation
and local commits/merges, with no remote operations; it doesn't authorize release
publication.

## Prepared locally

This category records local source integration, checks, and fixture artifacts.
The confirmed macOS and Samsung Q60C / Tizen 9 / Chromium 120 baseline, MIT
license, copyright line, and private reporting contact are already recorded;
they aren't pending decisions. Device acceptance remains separate.

### Reviewed runtime integration

The integration worktree is
`/Users/dartsiukhou/dev/personal/kinotv.launch-integration`, on
`integration/kinotv-u1s`. Both diffs were reviewed before conflict-free local
merges from the initial source `0bc3956e138af1532b246c74bbcbe621051770b4`:

- Artwork fix: `2251254bd7728d6bd2aa93d2ea744f895380dd1d`, merged as
  `23a2814477a0e3b3022b977f06222e3087f41863`.
- Title and watched tests: `6f4e994f5b3634568902124db7b60af76f9e646d`, merged as
  `bced8aa74ebb6bbf7d8ebcbec75fbc15ead6f110`.
- Exact tested source tree: `45f726c6a78202082c232e3242e5330c88945eb9`.

The final merge SHA is the **source HEAD** for every check and artifact below.
The subsequent documentation-only commit records these results; it doesn't
identify a separately tested runtime. No remote or TV operation occurs in this
pass, and no worktree is removed.

The original primary worktree remains at
`652b04e5e4c325214bbcdfaf2449eca72dcde336`, on `integration/kinotv-135`.
Its 41 modified tracked files and eight untracked files are preserved. Before
and after snapshots compare HEAD, branch, full porcelain status, working and
index diffs, and individual dirty-file SHA-256 hashes. The before snapshot also
matches the primary snapshot saved during the earlier runtime integration.
The original dirty runtime is represented by committed runtime snapshots and
the reviewed fixes; it isn't discarded or copied wholesale over integration.

Preservation identities are:

```text
8a9b421d4ae5562e78071280e9fc3c96eb6a62541fa889850a451ced68d2344c  primary porcelain status
3d7aa9a9185a7cb93c6584830c178c5c892cabef01b5c923072cef247520afd1  primary working diff
adfabcbb73ce332b3469bc1d0158376e55463142d9b7691f9962b6baca192e59  sorted dirty-file hash map
```

### First failures, fixes, and final checks

The earlier first-run evidence remains in this temporary directory:

```text
/var/folders/nr/0qk2bwcd7vxbk9wj6rc735wr0000gp/T/opencode/kinotv-runtime-merge-evidence/
```

At `0bc3956e138af1532b246c74bbcbe621051770b4`, the first full unit run
(`npm test -- --maxWorkers=1`) had **422 passes and one failure** in 28 files.
The failure was the 5,000 ms timeout in `src/core/images/cache.test.ts:420`,
“limits shared transport to two downloads and cancels work with no consumers.”
The first full browser run used port 5390, one worker, and zero retries:
**245 passed, 10 failed, and three skipped** out of 258. Failed cases were
`back.spec.ts:3`, `catalog.spec.ts:281`, `collections.spec.ts:39`,
`image-navigation.spec.ts:75`, `image-settings.spec.ts:5` and `:67`,
`title.spec.ts:312` and `:340`, and `watched.spec.ts:7` and `:76`.
`summary.json`, first-run logs, and `e2e-first-results/` retain those failures.

The artwork fix preserves incoming grid demand on repeated focus callbacks and
saved-card restoration during fallback entry. Its tests resolve transport
responses by source rather than asynchronous arrival order, wait for persistent
cache admission, and navigate to Home by observed tab focus. The title fix waits
for ready episode/card focus before subsequent input and uses a response gate
instead of freezing artwork scheduling. Playback, saved-focus, and single-write
assertions remain; delayed-artwork cases add two browser tests.

The fresh final-check evidence is stored separately (abbreviated as `$E` below):

```text
/var/folders/nr/0qk2bwcd7vxbk9wj6rc735wr0000gp/T/opencode/kinotv-reviewed-integration-5395-evidence/
```

| Command at source HEAD `bced8aa` | First result in this pass |
| --- | --- |
| `npm run typecheck` | Pass; `typecheck.log`, 0.650 seconds. |
| `npm test -- --maxWorkers=1` | 423 pass, zero failures, 28 files; `unit-first.log`, 85.462 seconds wall time. One invocation. |
| `E2E_PORT=5395 npm run e2e -- --workers=1 --retries=0` | 256 pass, one failure, three skips, 260 total; `browser-first-only.log`, 310.271 seconds. Exactly one full browser invocation; no reruns. |
| `npm run build` | Pass with explicit fake production configuration; `fake-production-build.log`, 1.401 seconds. |
| `npm run release:assets` | Pass; `release-assets.log`, 0.548 seconds. |
| `shasum -a 256 -c SHA256SUMS` from `dist-release/` | Three payloads `OK`; `checksums.log`. |
| `bash -n tools/install.sh`, `bash -n dist-release/install.sh`, `git diff --check` | Pass. Distributed shell syntax is also captured in `shell-syntax.log`. |

All ten cases that failed in the earlier browser run pass in this run. The
remaining failure is `e2e/bookmarks.spec.ts:54:3`, “shows changes made on another
device when the tab is shown again.” After opening `Остров`, removing that item
externally, and pressing Back, the remaining row correctly contains
`Долгая дорога`, but the assertion at line 78 expects focus there and observes
the `Закладки` tab for 5,000 ms. The cause remains unresolved; no focused rerun,
timeout override, assertion change, or additional runtime fix follows this run.
The preserved failure files under `$E/browser-first-results/` are:

```text
bookmarks-the-Bookmarks-ta-1097a-when-the-tab-is-shown-again-chromium/error-context.md
bookmarks-the-Bookmarks-ta-1097a-when-the-tab-is-shown-again-chromium/trace.zip
```

The three skips remain opt-in performance benchmarks, not passes. Fixture HTTP,
FakePlayer, and browser results don't establish real OAuth or native TV behavior.
The final browser result is **failed**, despite the resolved earlier cases.

### Final fake artifact verification

The production build uses explicit fixture client values, a fixture API host,
and FakePlayer. `build-configuration.json` records fake configuration and client
presence without credential values. This is **not a real OAuth-configured build**
and cannot authenticate real users. The configured primary `.env.local` and
separate release-CI credentials aren't evidence that these bytes use real OAuth.

Independent archive/file inspection confirms all of the following:

- Exactly four release assets, with all three payload hashes matching
  `SHA256SUMS`.
- Unsigned widget version `0.1.0`, matching package and lock metadata,
  application `KinoTV0001.KinoTV`, and package `KinoTV0001`.
- Every widget entry byte-identical to `dist/`, with complete project `LICENSE`,
  adjusted third-party notice links, and all `public/licenses/` files preserved.
- Complete project, fflate, Saxes, and xmlchars license text in the installer;
  complete MIT text in the shell; expected repository stamping and executable
  shell mode. License comparisons normalize whitespace.

The first inspector attempt failed because its shell-license comparison
normalized whitespace only in `LICENSE`, leaving repeated spaces from blank
shell-comment lines in the comparison text. `artifact-verification.log` and
`inspector-correction.json` retain that failure and the exact comparison change.
The corrected inspector passes on the **same built bytes**, recorded in
`artifact-verification-corrected.log` and `assets-inspection.json`. No source
change or rebuild masks the inspector failure. The earlier `0bc3956` evidence
also retains its separate installer-banner indentation comparison failure and
normalized-text correction.

These final fake-artifact identities are traceability only:

```text
fed5d624abebc804ed49929cea267220c07e2fa6da7481cab7853abee49ecb6d  KinoTV.wgt
2b71675f2cf52af04f3bfdbd9e185a3a6aa11d4fdec924c7b2ee650cd67e34b7  install.sh
cb57b34b0dd59dbaa8ab835e433db7c0c0a428be0f7089e43badbf15b58a0960  kinotv-installer.mjs
b7b02182a059b9af0502e79c1b0ff268e3cab5c1993beb11c481ff00d5bff71a  SHA256SUMS
```

`$E/summary.json` records source identities, results, original preservation,
artifact hashes, and the trace hash. `evidence-sha256.json` inventories the
temporary evidence, including copied artifacts, trace, patches, and runner.
These files are local temporary evidence, not tracked or hosted acceptance.

### Historical tooling checks

The following November 17 tooling evidence remains source-specific history.

This older evidence covers the tooling source
`c104cae19995fd27c72299745b7b118a46a24fa9` in the same integration worktree,
before the runtime integration described above. It doesn't replace the final
checks at `bced8aa`; release-candidate selection remains pending.

The local evidence directory is:

```text
/var/folders/nr/0qk2bwcd7vxbk9wj6rc735wr0000gp/T/opencode/kinotv-launch-c104cae-evidence/
```

`summary.json` records the source, report hashes, build inventories, and asset
hashes. `verify.mjs` checks the reports, archive contents, and fake configuration.
These temporary files aren't tracked or a hosted evidence archive. The following
commands are recorded by the logs (the evidence path is abbreviated as `$E`):

| Command | Evidence and result at `c104cae` |
| --- | --- |
| `npm run typecheck` | `typecheck.log`: pass. |
| `npm test -- tools/release/assemble.test.ts tools/tizen/installer.test.ts tools/tizen/cli.test.ts tools/tizen/configXml.test.ts tools/tizen/package.test.ts --reporter=default --reporter=json --outputFile="$E/unit.json"` | `unit.log`, `unit.json`: 125 pass, 0 fail, five files; 43.40 seconds. This is a focused run. |
| `E2E_PORT=5371 npm run e2e -- --workers=1 --retries=0 --reporter=list,json --output="$E/browser-artifacts"` | `browser.log`, `browser.json`: 225 pass, 3 skip, 0 fail, 0 flaky; one worker, no retries, one attempt per test; 109.17 seconds. Port and attempt counts are also recorded in `summary.json`. |
| `npm run build` | `build.log`: pass with fake production configuration; `build-env.log` reports both client values present, without values. |
| `npm run release:assets` | `release-assets.log`: assembles the four version `0.1.0` assets for `dartyuhov/kinotv`. |

Build configuration values and the original shell wrapper aren't reproduced in
the logs; the build command above identifies the logged npm invocation, not a
complete environment reproduction. The browser JSON report is saved separately
as `browser.json`.

The three browser skips are opt-in benchmarks: the stage-separated artwork
preparation probe in `artwork-performance.spec.ts`, and the browsing and playback
benchmarks in `performance.spec.ts`. They aren't passes. Fixture HTTP and
FakePlayer results don't establish live service or native TV behavior.

The reviewed `297676527e7b1351d4e5f31806c45f29c6681950` agent handoff reports a
full `npm test` run with **395 passing unit tests**. That is review-branch
evidence supplied in the handoff, not a fresh full run at `c104cae`; the final
integration evidence above contains only 125 focused unit tests.

The integrated [release workflow](../.github/workflows/release.yml) uses a manual
tag → validated draft → manual publication route. Local
[draft tests](../tools/release/draft.test.ts) exercise creation, interrupted-upload
repair, asset readback, and completed-release refusal through a controlled `gh`
boundary. They don't invoke real `gh` or validate a hosted workflow. The focused
125-test integration run doesn't include those draft tests; their execution is
part of the reviewed full-run handoff.

`checksums.log` records all three payloads as `OK`. The saved verification checks
an unsigned `0.1.0` widget, archive bytes matching `dist/`, third-party notices,
and the bundled parser licenses. **The build and assembled assets contain fake
API/client configuration. They aren't public-release candidates and can't
authenticate real users.** Their SHA-256 identities serve only traceability:

```text
26e3f3e32060f1e54663e071cd8f9ac9175a1f4113ea583f8da1d9f63062aeb5  KinoTV.wgt
1720493f1bee8b7c045580a3463c91decc693ec5d059e16d0868576e428337c0  install.sh
a02d4ce2b2d838ed0977ec83517c6176957afa9641bc42c0f4b6bd3c56576f74  kinotv-installer.mjs
542c998862caf26299a2098a177b1808ee2f197b12a2c85e0adf366985d8553f  SHA256SUMS
```

### Confirmed original-code license

On November 18, 2026, the maintainer confirmed the exact line
`Copyright (c) 2026 Dzmitry Artsiukhou` for the previously selected MIT license.
The root [LICENSE](../LICENSE) contains the full MIT text. `package.json` and
the root package entry in `package-lock.json` declare `MIT`; dependency records
are unchanged. [Third-party notices](../THIRD_PARTY_NOTICES.md) remain separate.
The private reporting contact is also confirmed as
[darst94@gmail.com](mailto:darst94@gmail.com). The maintainer also confirmed
macOS plus Samsung Q60C running Tizen 9 / Chromium 120 as the initial verification
baseline. This selection doesn't establish public-download acceptance or support
for other hosts, models, or firmware. Record exact versions during device checks.

Local verification on `integration/kinotv-u1s`, based on `28cb07e` plus this
license change, produced these results:

- `npm test -- tools/release/assemble.test.ts tools/release/installSh.test.ts
  tools/release/workflows.test.ts`: 54 tests passed across three files. The
  artifact test first failed on each missing project-license output, then passed
  after implementation. An initial broader run found one missing fixture
  `LICENSE`; the fixture was corrected before the final 54-test pass.
- `npm run typecheck`: passed.
- `npm run build` with explicit fake client configuration and a fixture API host,
  followed by `npm run release:assets`: passed. These artifacts cannot
  authenticate real users and aren't release candidates.
- `shasum -a 256 -c SHA256SUMS` from `dist-release/`: all three payloads passed.
  The first invocation from the repository root failed to locate the manifest;
  the corrected invocation checked the assembled files.
- Independent ZIP and file readback confirmed the complete project license in
  `KinoTV.wgt`, the installer banner before the unchanged fflate/Saxes/xmlchars
  texts, and the source and distributed shell comment headers. The artifact test
  also verified preservation through signing staging and the four-asset contract.
- `bash -n tools/install.sh`, `bash -n dist-release/install.sh`, and
  `git diff --check`: passed.

The fake-config artifact hashes for this license pass are separate from the
historical `c104cae` evidence above:

```text
7562aa7ac7b8036c729ddfd927a8c38253e47160603d36a9fcc8b1dd3c14a977  KinoTV.wgt
2b71675f2cf52af04f3bfdbd9e185a3a6aa11d4fdec924c7b2ee650cd67e34b7  install.sh
cb57b34b0dd59dbaa8ab835e433db7c0c0a428be0f7089e43badbf15b58a0960  kinotv-installer.mjs
00f28d21ee0012ff7ae55db0ecd1e3aaa74b6e3a80992b2775944f351f847cd9  SHA256SUMS
```

## GitHub configured

The [spec's recorded observation](specs/open-source-launch.md#further-notes)
confirms that repository secret names `KP_CLIENT_ID` and `KP_CLIENT_SECRET` were
already configured on November 17, 2026. No values are recorded here. Local
workflow wiring maps them to the production Vite variables; presence doesn't
establish credential ownership, upstream permission, or successful hosted use.

The last observed remote `main` is
`f01df7555421b2bc358e4849c257150d41187dca`, also the local `origin/main` reference
at this documentation pass. No remote refresh or mutation occurs in this pass.
Local integration isn't evidence that GitHub has this source. A qualifying hosted
PR/check run, approval for repository settings changes, and effective-settings
readback remain pending. Local YAML and controlled draft tests don't satisfy
those checks.

## Published

Publication remains pending. No hosted draft validation, public launch release,
or anonymous asset retrieval is established by this evidence. Tag/release work
and manual publication require scoped approval. Follow the
[contribution and release guide](../CONTRIBUTING.md#publishing-a-release) after
candidate selection and the remaining launch gates.

## Installation verified

Public-download installation verification remains pending. The
[installation guide](installation.md) describes the route; it isn't a completed
installation result. The [integrated TV checklist](integrated-tv-acceptance.md)
contains historical source-specific evidence and pending device items, not
acceptance of `bced8aa`, historical `c104cae`, or these fake-config artifacts.

After an approved publication, anonymously retrieve metadata and all four assets,
verify their checksums and identity, and use those exact downloads for local
signing, fresh installation, device-code sign-in, and native playback. Record a
same-author upgrade retaining session/settings. Viewer confirmation of picture,
sound, remote behavior, and readability remains pending, together with exact
host, TV, firmware, source, and installed-package identities.

## Next steps

The following gates remain open before launch completion:

- Resolve the remaining bookmark focus-restoration failure at `bced8aa`, then
  select and review an exact candidate and record candidate-specific checks and
  artifacts with effective real OAuth release configuration. The reviewed
  runtime merges above are complete; candidate acceptance remains pending.
- Run a maintained, redacting exposure scan over intended public history/current
  content, and review accessible hosted logs/artifacts and final deliverables.
  Record findings, exclusions, inaccessible surfaces, and dispositions.
- Disposition the dependency advisories. Saved `npm-audit.json` reports six
  high-severity dependency entries; no reachability, exploitability, remediation,
  or acceptance conclusion is established here.
- Obtain scoped hosted PR/settings and release-publication approvals, complete
  hosted validation/readback, and record anonymous-download/device evidence.

Reconcile the [existing issue context](specs/open-source-launch.md#further-notes):
`kinotv-91o.19` owns release/installer history, `.20` the superseded own-client
assumption, `.23` timing reliability, and `.26.13` coordinated TV acceptance.
The [integrated checklist's follow-ups](integrated-tv-acceptance.md#next-steps)
retain unresolved playback, artwork, audio, player UI, and crash acceptance.
This documentation doesn't close those issues or establish a crash cause.
