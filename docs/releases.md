# Automatic releases

KinoTV follows the same release-PR approval model as Vishot: merge fixes/features
to `main`, review the generated release PR, and merge that PR to approve automatic
publication. There is no manual tag or final publish button. This replaces the
historical manual-tag/manual-publication plan.

## Setup status and GitHub App

Read-only inspection on November 18, 2026 found no tags and none of
`RELEASE_APP_CLIENT_ID`, `RELEASE_APP_PRIVATE_KEY`, or `RELEASE_APP_BOT_LOGIN`
configured for KinoTV. The existing `KP_CLIENT_ID` and `KP_CLIENT_SECRET` secret
names are present. No credentials were read or changed. These workflows must be
merged and App setup completed before automation can operate.

An administrator must complete this setup separately:

1. Create a GitHub App for KinoTV releases, or explicitly authorize an existing
   release App for this repository. Grant repository **Contents: read and
   write**, **Pull requests: read and write**, **Issues: read and write**, and
   **Actions: read-only**. Metadata read access is implicit. No webhook or
   organization permission is required for these workflows.
2. Install the App on `dartyuhov/kinotv`, selecting only the intended repository.
   If you changed an existing App's permissions, approve its installation update.
3. In repository **Settings → Secrets and variables → Actions**, add the App's
   client ID as variable `RELEASE_APP_CLIENT_ID`, its private PEM key as secret
   `RELEASE_APP_PRIVATE_KEY`, and its exact bot login, including `[bot]`, as
   variable `RELEASE_APP_BOT_LOGIN`. Use KinoTV-authorized configuration; don't
   copy Vishot's private key or other private credentials.
4. Confirm the separate build secrets `KP_CLIENT_ID` and `KP_CLIENT_SECRET` are
   present. They identify the selected borrowed OAuth application and are
   intentionally embedded in release builds. They aren't user session tokens or
   proof of client ownership/upstream permission. `.env.local` doesn't configure
   GitHub builds.
5. Review branch protection/rulesets with the repository owner. Require the
   `CI` workflow's `Typecheck, tests, e2e and build` job for merges to `main`,
   including App-authored release PRs. Keep normal code review requirements.
   If rules restrict tag creation, explicitly allow this App to create `v*`
   tags; the publisher never moves tags. Don't add a separate deployment approval
   to this flow: the release PR merge is the publication approval.

The configuration check prints only setting names and `present`/`missing`.
Missing settings fail with this guide's path before an App token is minted.
App tokens are repository-scoped and exist only in the release-PR writer and
publisher jobs. The App authors release PR events so GitHub runs normal CI;
`GITHUB_TOKEN`-authored PR events would suppress that automation. Fork CI uses
fixtures and read-only permissions, with no release secrets.

## Version and publication contract

The two workflows run independently on `main` pushes. Publication ignores
ordinary merges. Release Please uses its locked Node strategy from the isolated
`tools/release/automation/` package, without adding dependencies to the app.

- `fix:` requests a patch, `feat:` a minor, and `!` / `BREAKING CHANGE:` a major,
  including before 1.0. Markdown-only and `docs/`-only changes don't independently
  release, even if titled as features. Mixed app/documentation changes can.
- The bootstrap boundary is `8335876fe1d7e2a653303f4a56a529977dc34af2`.
  Manifest `0.0.0` means no published release yet; it intentionally differs from
  package version `0.1.0` until the first generated release PR. The tested first
  plan is `0.1.0`, even with breaking prelaunch changes. Don't hand-bump versions.
- Release PRs manage package, lock, manifest, and committed changelog together.
  A pending merged release blocks a new release PR until publication finishes.
  The app and `config.xml` derive their version from the package during build.
- Approval requires a merged PR in this repository targeting `main`, the exact
  configured App author, managed branch
  `release-please--branches--main--components--kinotv`, a pending/tagged lifecycle
  label, and parseable generated release title/body matching package, lock,
  manifest, and changelog at its exact merge SHA. Titles/labels alone aren't
  sufficient. The merge must still belong to `main` history.
- The latest trusted `CI` workflow push run at the exact release PR head must
  succeed, or, if absent, the exact main merge run must succeed. A similar check
  name from another workflow doesn't qualify. The publication workflow then
  runs the full CI workflow again at the exact approved merge SHA before building.
- Packaging checks OAuth presence and source versions, builds that merge, and
  assembles exactly `KinoTV.wgt` (unsigned), `install.sh`,
  `kinotv-installer.mjs`, and `SHA256SUMS`. An internal source record binds the
  same-run artifact to the approval; it isn't a fifth published asset.
- The publisher executes tooling from the trusted main workflow checkout.
  Candidate files are data; candidate scripts never execute with its App token.
  It revalidates approval, version freshness, existing public release history,
  widget identity/version, and checksums before creating a tag at the exact
  merge SHA. Existing tags must already resolve to that SHA.
- The existing strict draft validator repairs only draft assets, downloads all
  four hosted files, and checks their bytes, sizes, digests, and checksums against
  the local assembly. It returns the validated release ID. Approval and source
  guards run again before that exact draft becomes public automatically.
- One non-cancelling concurrency group serializes publication, including retries.
  Older versions/history are rejected. A completed retry checks release approval
  identity, tag, and every hosted asset; it never replaces public assets.

## Recovery

Failures leave a diagnostic run, and possibly an exact tag or incomplete draft.
Inspect the failed gate first; don't move tags or publish while a run is active.

1. Correct missing App/build configuration separately, or wait for the exact
   trusted CI run to succeed. A failed exact check must be corrected or rerun;
   another similarly named check doesn't substitute for it.
2. Rerun the failed workflow, or run **Publish release** on branch `main` with
   `release_pr` set to the already merged release PR number. This input cannot
   select an arbitrary ref/version or approve an ordinary PR. It resolves the
   original merge, checks ancestry/freshness, retests, and rebuilds that source.
3. A matching draft can retain correct assets and repair interrupted/bad uploads.
   Network errors aren't treated as missing releases. A completed public release
   can only pass verification; mismatched public bytes or identity stop the run
   without replacement. Publish a new reviewed release for changed payloads.
4. If publication succeeded but lifecycle labels failed, rerun the same merged
   PR. After public-asset verification, the workflow finishes the labels without
   republishing. This unblocks subsequent Release Please PRs.

`node tools/release/draft.ts` remains a strict stage-only diagnostic helper for
an existing matching tag. It refuses public/completed releases and never creates
tags or publishes. Normal automation uses its approval-aware interface.

## Verification and physical acceptance

Run the local contract checks without remote writes:

```sh
npm ci
npm ci --prefix tools/release/automation --ignore-scripts
npm test --prefix tools/release/automation
npm test
npm run typecheck
VITE_KP_CLIENT_ID=fixture-release-client-id VITE_KP_CLIENT_SECRET=fixture-release-client-secret npm run build
npm run release:assets
```

Tests exercise the real Release Please plan with fake SCM and the full publisher
through an in-memory `gh` boundary. Fixture build output isn't a real sign-in
candidate. Hosted operation isn't established by local tests. After publication,
verify anonymous downloads and the [TV acceptance checklist](integrated-tv-acceptance.md)
using the [installation guide](installation.md); publication alone doesn't
establish native playback, device compatibility, or launch completion.
