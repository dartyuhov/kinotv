# Contributing to KinoTV

You can develop and run fixture-backed checks without a TV, a paid service
account, OAuth credentials, or Samsung signing material. KinoTV is maintained
on a best-effort basis; review and support have no response-time commitment.

## Start from a fresh clone

Install Git and [Node.js](https://nodejs.org/) **22.18 or newer**, with npm.
The project uses npm and the committed `package-lock.json`; use `npm ci` for a
reproducible dependency install. The documented host baseline is macOS; other
hosts need separate validation, particularly for Samsung SDK tooling.

```sh
git clone https://github.com/dartyuhov/kinotv.git
cd kinotv
npm ci
```

You don't need `.env.local` for these checks:

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run e2e
```

`npm run build` without app credentials checks compilation and assembly, not
live sign-in. Playwright builds a separate `dist-e2e/` with fake client values,
fixture HTTP responses, and FakePlayer. It doesn't use your service account or
establish native playback. Chromium installation downloads a browser; on hosts
that lack browser system dependencies, follow Playwright's installation output.

For a focused browser check, pass a spec path and optionally one worker:

```sh
npm run e2e -- e2e/signin.spec.ts --workers=1
```

The default server port is derived from the checkout path. To resolve a local
port collision, set an unused port, for example
`E2E_PORT=5299 npm run e2e -- e2e/signin.spec.ts --workers=1`. Reports go to
`test-results/`; traces may contain account data when collected outside fixtures.
Some timing-sensitive suites have known follow-up work. Report the first full
result and any focused rerun separately rather than presenting a rerun as an
unconditionally green suite.

## Run the interface locally

The application uses React, TypeScript, Vite, TanStack Query, Zustand, and
Norigin Spatial Navigation. Start Vite from the repository root:

```sh
npm run dev
```

Open the address printed by Vite. Arrows and Enter replace the remote's arrows
and OK; Backspace/Escape is Back, Space is play/pause, `[` / `]` seek, and
Page Up / Page Down replace the channel keys. Browser playback uses HTML5 video,
not Samsung AVPlay.

For a fake player during interactive development, run:

```sh
VITE_PLAYER=fake npm run dev
```

This changes only playback. It doesn't supply fixture API responses, a catalog,
or a sign-in session. Use the Playwright journeys for credential-free UI checks.

## Configure real device-code sign-in

A source build needs app OAuth client configuration to request a real device
code. Copy the sanitized example only if you don't already have `.env.local`:

```sh
cp .env.example .env.local
```

Set `VITE_KP_CLIENT_ID` and `VITE_KP_CLIENT_SECRET` in that ignored local file.
Never put an account password, access token, refresh token, or Samsung
certificate in those variables. An optional `VITE_API_BASE_URL` changes the
default API host, `https://api.service-kp.com`.

App credentials identify the OAuth application; account tokens belong to each
user's approved device session. `VITE_*` values are embedded in the bundle and
visible to recipients. They are not a place for private per-user secrets.

The maintainer selected borrowed app credentials from the public
`https://kpapp.link/js/app.min.js` client for configured local and release builds.
This is not a newly issued KinoTV client, an ownership claim, or evidence of
upstream permission. No real values are included in this repository's example.
A fresh clone needs its own explicit local configuration for real sign-in;
you don't need those values to contribute with fixtures. Release CI uses its
separate `KP_CLIENT_ID` / `KP_CLIENT_SECRET` configuration. Your `.env.local`
doesn't configure GitHub builds.

## Build and install on a TV

Use the [installation guide](docs/installation.md) to prepare Samsung tools,
Developer Mode, a DUID-bound distributor certificate, and an author certificate.
Before a real TV rebuild, verify that both effective production Vite client
values are present, without printing their contents:

```sh
node --input-type=module -e 'import { loadEnv } from "vite"; const e = loadEnv("production", process.cwd()); let ok = true; for (const k of ["VITE_KP_CLIENT_ID", "VITE_KP_CLIENT_SECRET"]) { const present = Boolean(e[k]?.trim()); console.log(`${k}: ${present ? "present" : "missing"}`); ok &&= present; } if (!ok) process.exitCode = 1;'
npm run tv:setup
npm run tv
```

Stop if either value is missing. Run the commands individually so that a failed
presence check doesn't lead to a TV rebuild. `npm run tv` builds, signs, installs,
and launches; `npm run tv:debug` also prints a DevTools address. Coordinate TV
use with its owner so another session doesn't replace their installed package.

`npm run package` builds `dist/` and produces `dist-tizen/KinoTV.wgt`. It signs
only when a usable saved profile and Tizen CLI are available; otherwise it makes
an unsigned widget, which a TV cannot install directly. A successful package
command does not establish sign-in or playback acceptance.

The tools look in `PATH` and `$TIZEN_HOME` (default `~/tizen-studio`).
`KINOTV_TV` and `KINOTV_TIZEN_PROFILE` override saved TV/profile choices.
Local choices live in ignored `tizen/.signing/settings.json`; keep certificates,
their passwords, and that file out of contributions.

The downloaded installer stores these choices relative to its working directory;
the bootstrap uses `~/KinoTV` or `KINOTV_DIR`. Reuse that directory for updates,
or select the existing Samsung profile when starting in a new directory. A
profile name alone doesn't preserve author identity: retain the original
`author.p12` and password. Don't uninstall first when testing same-author updates.

The release installer removes stale signed output, requires a new signed WGT,
and checks its application/package identity and version against the input before
installation. `--release vX.Y.Z` on the Node installer also requires that input
version to match the tag. The shell bootstrap supports `--release` and `--wgt`;
with `--wgt`, it checks only the downloaded installer against release checksums
and doesn't bind the local widget to the tag. Follow the
[download and signing guide](docs/installation.md#select-and-check-downloaded-files)
for the complete checksum procedure, including checking `install.sh` itself.

## Submit an issue or pull request

Use [GitHub Issues](https://github.com/dartyuhov/kinotv/issues) for ordinary bugs
and feature proposals. English and Russian are both welcome. Search existing
issues first, then include reproduction steps, expected/actual behavior,
version or source commit, host, TV model, and firmware where applicable.
For media problems, identify a title/episode and selected quality without
sharing authenticated stream URLs or account responses.

For a pull request, follow these steps:

1. Create a focused branch in your fork and link the public issue if one exists.
2. Keep changes consistent with nearby code. Explain user-visible behavior and
   update documentation where needed.
3. Add meaningful behavior tests for runtime changes at the affected seam.
   Documentation-only changes need link and command checks, not artificial tests.
4. Run relevant checks and record exact commands/results, skipped checks, and
   device observations separately. A browser fixture pass is not TV acceptance.
5. Review your diff for local config, tokens, signed URLs, and signing files.
6. Open a PR using the template. Conventional titles such as `fix(player): …`
   or `docs: …` help maintainers prepare squash commits.

Fork checks must work with fixtures and no publishing credentials. Contributors
don't need Beads or release access. Maintainers link accepted GitHub reports to
internal Beads tickets and reflect the public outcome back on GitHub. Agent
contributors can read the tracked [tracker instructions](docs/agents/issue-tracker.md),
[triage labels](docs/agents/triage-labels.md), and
[domain-document conventions](docs/agents/domain.md). A fresh clone doesn't
include the maintainer's ignored `.beads/` database; don't initialize a duplicate
tracker just to submit a contribution.

## Sensitive reports

Don't post sensitive findings, exploit details, account data, certificates, or
private logs in public issues or PRs. A private reporting destination has not
yet been confirmed. The launch coordinator must confirm and publish that route
before reporting guidance is complete. There is no confirmed private contact
or response-time promise to list here.

## Documentation and release scope

The [Russian README](README.md), [English entry point](README.en.md), and
[installation guide](docs/installation.md) are the current onboarding path.
Older specs and research under `docs/superpowers/` explain design history and
may describe superseded behavior. Acceptance reports name their tested
revision; they don't automatically validate newer source.

Release publication, signing credentials, legal notices, and repository settings
are maintainer-coordinated work. Public source availability alone doesn't mean
that an installable release has been published or tested on your TV.

## Publishing a release

The launch release process is manual tag → validated draft → manual publication
→ anonymous download verification. The draft implementation was reviewed
read-only at `3683bad`; it is separate integration work and isn't present in
this guide's `0c70c46` base, whose older workflow publishes directly on a tag
push. Confirm that the selected candidate includes the draft workflow before
creating a release tag. Public release assets and public-download TV acceptance
are still pending.

Use this sequence when the launch coordinator authorizes remote release work:

1. Select the reviewed candidate and confirm matching stable numeric versions in
   source, package/lock metadata, and the built widget, the intended repository,
   and effective release client configuration (presence only). Finish relevant
   candidate checks, notices, exposure review, and agreed pre-publication device
   checks. Exact copyright-holder name/year, the private reporting contact, and
   the host/TV support baseline still require maintainer confirmation.
2. Create and push a matching `vX.Y.Z` tag manually only with scoped approval.
   The tag-driven workflow runs the release gate and CI, builds the unsigned WGT,
   assembles the four assets, and stages or repairs a **draft**. It doesn't
   publish automatically. Its configuration-presence gate doesn't prove client
   ownership or upstream permission.
3. Wait for the complete workflow to finish. Review the validated draft's tag
   and source SHA, notes, and all four assets: `KinoTV.wgt`, `install.sh`,
   `kinotv-installer.mjs`, and `SHA256SUMS`. Draft validation downloads the hosted
   assets and compares their bytes with the local assembly and checksums; it
   doesn't establish legal or TV acceptance. A failed run can leave an incomplete
   draft. Inspect the failure and rerun the same tag workflow to repair it.
   Published/completed releases are refused; don't move tags or replace public
   assets as routine recovery.
4. Review the legal and launch evidence with the coordinator, then publish the
   validated draft manually under separate publication approval. Don't publish
   while its workflow is running. Draft validation alone isn't approval to
   announce the launch.
5. Retrieve public release metadata and all four assets **without authentication**
   into a clean folder. Confirm the selected tag and complete asset set, check
   `SHA256SUMS`, and inspect the unsigned widget's identity/version and notices.
   Use those exact downloads for local signing, fresh installation, device-code
   sign-in, native playback, and a same-author upgrade retaining session/settings
   on the agreed baseline. Record the exact source/package, device/firmware,
   date, and pass/fail/blocked results in the
   [integrated TV checklist](docs/integrated-tv-acceptance.md).

Keep local preparation, observed GitHub configuration, publication, and verified
installation as separate results. Announcement and launch completion require
the public-download checks and coordinated TV evidence; a tag or green draft
workflow alone doesn't establish them.
