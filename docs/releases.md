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

The two workflows reconcile repository state on `main` pushes and twice-hourly
schedules. Successful publication-workflow completion also wakes the release PR
writer, which reads current `main` rather than the completed run's old checkout.
Release Please uses its locked Node strategy from the isolated
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
  The writer verifies the App author, managed branch, and head/base repository
  through raw PR metadata before honoring a merged pending label. An unrelated
  contributor PR with copied release notes and labels cannot block it. Tagged
  release history and ordinary commit/PR metadata remain available to the planner.
  The app and `config.xml` derive their version from the package during build.
- Approval requires a merged PR in this repository targeting `main`, the exact
  configured App author, managed branch
  `release-please--branches--main--components--kinotv`, a pending/tagged lifecycle
  label, and parseable generated release title/body matching package, lock,
  manifest, and changelog at its exact merge SHA. Titles/labels alone aren't
  sufficient. The merge must still belong to `main` history.
- Normal `CI` runs on pull requests and pushes to `main`, avoiding duplicate
  feature-branch push checks. The `pull_request` trigger keeps its default events.
  The publication workflow still calls the full CI workflow at the exact approved
  merge SHA before building.
- Approval first checks the latest trusted `pull_request` CI run at the merged
  release PR's exact head SHA. The run must belong to this repository, use
  `.github/workflows/ci.yml`, and link to that PR number with this repository as
  both head and base, targeting `main`. The latest run and its latest attempt must
  finish successfully; a queued, failed, cancelled, or skipped run blocks approval
  even if main CI succeeds. Similar check names and feature-branch push runs
  don't qualify.
  If no matching PR run exists, only a successful latest `push` CI run on `main`
  at the exact approved merge SHA qualifies. Missing PR associations don't prove
  PR identity, so those runs require this fallback too.
  The REST workflow-run `head_sha` identifies the PR head, distinct from the
  synthetic merge `github.sha` checked out during PR CI. PR association head
  metadata can change after branch updates; approval uses the immutable run SHA
  and original PR identity, so reusing the managed release branch doesn't change
  an earlier merged PR's approved source.
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
- One concurrency group serializes publication, including retries. Its default
  pending slot is lossy: even with `cancel-in-progress: false`, a new run replaces
  the previous pending run. It is **not the release queue**. Every automatic run
  enumerates all closed main PR pages and selects the oldest pending merged PR
  with the expected App, branch, and repository, then applies all approval checks.
  A later ordinary push can therefore recover an earlier release merge. An
  unready, invalid, or stale oldest approval fails visibly; it isn't skipped in
  favor of a later release. The pending label survives until publication and
  lifecycle completion. Explicit retries of pending PRs must also respect this
  order; completed retries remain verification-only.
- After publication clears the pending label, a successful workflow-completion
  event reconciles Release Please again. Features merged while publication was
  in flight are picked up without another main push. The writer uses the same
  serialized writer group for every trigger, always reads current main history,
  and uses its App token only for PR mutations. Scheduled reconciliation recovers
  missed/coalesced wake-ups and failed label/writer operations. GitHub schedules
  can be delayed or dropped, so this is eventual recovery, not a time guarantee.
  No completion event in this flow triggers publication of an unmerged PR.
- Older versions/history are rejected. A completed retry checks release approval
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
   original merge, checks ancestry/freshness and pending order, retests, and
   rebuilds that source. Automatic pushes/scheduled runs also reconcile pending
   merged approvals, independent of the triggering push SHA.
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
