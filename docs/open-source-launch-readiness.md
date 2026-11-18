# Open-source launch readiness

As of November 17, 2026, launch tooling is prepared and checked locally at
`c104cae19995fd27c72299745b7b118a46a24fa9`. This record does **not** validate a
deployable release candidate. GitHub configuration, publication, and installation
verification are separate outcomes below.

The [launch spec](specs/open-source-launch.md) says, “This spec authorizes
planning.” The user's subsequent explicit implementation and evidence requests
supersede that planning-only scope. This final request authorizes documentation
and local commits/merges, with no remote operations; it doesn't authorize release
publication.

## Prepared locally

The evidence covers the clean `integration/kinotv-u1s` worktree at
`/Users/dartsiukhou/dev/personal/kinotv.launch-integration`. The original primary
`integration/kinotv-135652b04e` dirty runtime is intentionally absent. Final
runtime integration and release-candidate selection remain pending.

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

## Confirmed original-code license

On November 18, 2026, the maintainer confirmed the exact line
`Copyright (c) 2026 Dzmitry Artsiukhou` for the previously selected MIT license.
The root [LICENSE](../LICENSE) contains the full MIT text. `package.json` and
the root package entry in `package-lock.json` declare `MIT`; dependency records
are unchanged. [Third-party notices](../THIRD_PARTY_NOTICES.md) remain separate.
The private reporting contact is also confirmed as
[darst94@gmail.com](mailto:darst94@gmail.com). The host/TV support baseline still
needs confirmation.

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
acceptance of `c104cae` or these fake-config artifacts.

After an approved publication, anonymously retrieve metadata and all four assets,
verify their checksums and identity, and use those exact downloads for local
signing, fresh installation, device-code sign-in, and native playback. Record a
same-author upgrade retaining session/settings. Viewer confirmation of picture,
sound, remote behavior, and readability remains pending, together with exact
host, TV, firmware, source, and installed-package identities.

## Next steps

The following gates remain open before launch completion:

- Confirm the maintained host/TV support baseline. Original-code MIT licensing
  and the private reporting contact are now recorded in the current guides.
- Select and review final runtime integration and an exact candidate, then record
  candidate-specific checks and artifacts with effective release configuration.
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
