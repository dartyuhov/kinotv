# KinoTV open-source launch

## Problem Statement

KinoTV is publicly visible, but another subscriber cannot yet rely on a complete,
licensed, documented release that they can download and install on their Samsung
Tizen TV. Contributor setup depends on local knowledge, release configuration
still contains a repository placeholder, and existing build or browser-test
success does not establish public-download installation or native playback.

The maintainer wants an MIT-licensed, best-effort community project with usable
downloads at launch. Completion must distinguish local preparation, observed
GitHub configuration, publication, and installation verification.

## Solution

Finish the existing source, documentation, CI, packaging, and installer route so
a subscriber can discover the prerequisites, download one coherent release,
verify it, sign it locally with their Samsung certificate, install it, and approve
a device code for their own account. Contributors can build and run fixture-backed
checks without production credentials and submit useful issues and pull requests.

Publish only after the release candidate passes relevant automated checks and
the public assets pass an actual macOS-to-TV installation and upgrade check.
Describe tested hardware and known limitations without implying certification
across untested hosts or firmware. Preserve the existing application and release
tooling where it works.

## User Stories

1. As a subscriber, I want to understand that KinoTV is unofficial, so that I can
   distinguish it from the service and Samsung.
2. As a user, I want an explicit MIT license for the original project code, so
   that I know my rights to use, modify, and redistribute it.
3. As a redistributor, I want applicable third-party notices with the source and
   downloads, so that attribution survives distribution.
4. As a prospective user, I want honest host, TV, firmware, account, and SDK
   requirements, so that I can assess installation before starting.
5. As a subscriber, I want ready-made release assets, so that I do not need a
   source checkout or dependency installation to install the application.
6. As an installer user, I want all downloaded components to come from one
   selected release, so that a changing latest release cannot mix versions.
7. As an installer user, I want payload checksums verified, so that corrupted or
   mismatched downloads fail before use.
8. As an installer user, I want to choose a release explicitly, so that historical
   downloads remain usable and diagnosable.
9. As a TV owner, I want clear Developer Mode, DUID, SDK, and certificate
   instructions, so that local signing and installation are reproducible.
10. As a TV owner, I want signing to produce the requested application version,
    so that stale output cannot silently install a previous build.
11. As a subscriber, I want to approve a device code on the service website, so
    that I can sign in without configuring API credentials myself.
12. As a subscriber, I want each installation to receive its own account tokens,
    so that distributing the widget does not distribute the maintainer's session.
13. As a user, I want upgrades with my existing author certificate to retain
    session and settings, so that updating does not require unnecessary setup.
14. As a user, I want reliable core navigation and native playback, so that a
    successful installation leads to a usable TV application.
15. As a user, I want accurate feature descriptions for History, watched actions,
    Live TV, startup preferences, and playback settings, so that documentation
    matches the release rather than an older design.
16. As a user, I want known playback, artwork, and lifecycle limitations disclosed,
    so that unresolved native acceptance is not mistaken for verified support.
17. As a contributor, I want fresh-clone instructions and environment examples,
    so that my setup does not depend on the maintainer's ignored files.
18. As a contributor, I want credential-free automated checks, so that I can work
    without receiving release credentials or accessing a paid account.
19. As an English-speaking contributor, I want an English entry point alongside
    the useful Russian guide, so that I can understand setup and contribution.
20. As a contributor, I want public issue and PR guidance, so that I can contribute
    without learning the maintainer's internal Beads workflow.
21. As an agent-assisted contributor, I want referenced onboarding documents in
    the clone, so that local global-ignore rules do not hide required guidance.
22. As a reporter, I want appropriate public and private reporting destinations,
    so that ordinary bugs and sensitive findings reach the right place.
23. As a maintainer, I want read-only fork PR checks and protected mainline merges,
    so that contributions are checked without publication credentials.
24. As a maintainer, I want trustworthy, version-consistent release assets and
    recoverable draft publication, so that a failed attempt is safe to retry.
25. As a maintainer, I want scans of intended public history and artifacts with
    redacted findings, so that concrete exposure is addressed before announcement.
26. As a maintainer, I want best-effort expectations documented, so that publishing
    the project does not imply response deadlines or broad device guarantees.
27. As a prospective user, I want installation evidence from public downloads,
    so that launch readiness means more than a successful workflow or tag.

## Implementation Decisions

- Target the existing public GitHub repository dartyuhov/kinotv. Reconfirm its
  remote identity, default branch, working tree, and source revision before work.
- Preserve unrelated dirty application changes. Establish an exact release
  candidate after maintainer-approved integration; never discard work or silently
  include unreviewed changes in a release.
- Use MIT for personally owned original code, as selected by the maintainer.
  Obtain the exact copyright-holder name and applicable year before adding the
  legal text. Preserve third-party license boundaries and notices.
- Inventory redistributed dependencies and resources, including Inter fonts,
  Lucide/Feather notices, navigation-library attribution, and bundled installer
  dependencies. Include the applicable notices in distributed deliverables.
- Keep direct device-code OAuth as the default. Distinguish shared application
  credentials from per-user access and refresh tokens. User passwords and account
  sessions are never inputs to distributable builds.
- The maintainer selected reuse of the borrowed public client's credentials for
  local and GitHub release builds. Document their provenance accurately without
  copying credential values into tracked material, tests, reports, or tool output.
  Public availability and maintainer choice do not establish an upstream grant
  or a newly issued KinoTV client; do not make those claims.
- Keep local configuration ignored and preserve its unrelated settings. GitHub
  repository secrets KP_CLIENT_ID and KP_CLIENT_SECRET supply Vite's corresponding
  VITE-prefixed build variables. Configuration verification reports presence
  only. Fork checks use fixtures and receive no publishing credentials.
- Preserve the existing manual tag-driven release route initially. Conventional
  commit and squash-merge guidance can improve consistency without requiring a
  replacement release-management system.
- Replace placeholder repository identity with the actual publishing repository.
  Gate stable numeric versions, matching source/package/lock/widget versions,
  intended repository, and nonempty client configuration. A presence check must
  not claim to verify credential ownership or upstream authorization.
- Define the initial asset contract as KinoTV.wgt, install.sh,
  kinotv-installer.mjs, and SHA256SUMS. The widget is unsigned; the user signs it
  locally. Include notices through an explicit, verified distribution mechanism.
- Resolve one immutable selected release before payload downloads. Verify all
  payload checksums and define compatible handling of an explicitly supplied
  widget. Checksums establish integrity, not independent publisher authenticity.
- Stage releases as drafts, validate the full asset set, and publish afterward.
  Retry incomplete drafts safely; do not replace completed public assets or move
  published tags as routine recovery.
- Prevent stale signed-output reuse and validate resulting application identity
  and widget version before installation. Preserve author-certificate continuity.
- Pin reviewed external Actions revisions and retain least-privilege job tokens.
  Exercise actual-project assembly with fake client configuration in CI.
- Demonstrate qualifying PR check behavior before requiring its exact observed
  check name. Configure mainline PR/check protection, block force pushes and
  deletion, select squash-only merging, and delete merged branches. Choose a
  solo-maintainer-compatible review policy; remote mutations need scoped approval.
- Reconcile existing browser timing failures using the existing reliability
  ticket instead of masking failures with unrelated reruns or duplicated fixes.
- Provide fresh-clone contribution instructions, issue/PR templates, private
  reporting guidance, and best-effort support boundaries. Obtain a real reporting
  contact before publishing it. Explain GitHub-to-Beads handoff for maintainers.
- Track essential agent onboarding documents currently hidden by a global ignore
  rule. Mark historical research/designs and current guidance clearly.
- Retain the Russian guide and add an English entry point. Align current feature
  descriptions, actual tested firmware, target minimum, manifest requirements,
  release links, and installation instructions.
- Confirm the launch support baseline with the maintainer. The initial proposed
  installer host is macOS and the observed TV is the Samsung Q60C on Tizen 9 /
  Chromium 120; treat this as observed/proposed scope rather than proof of all
  firmware or model variants. Record verification dates and exact device details.
- Run a maintained, redacting scanner against intended reachable public history
  and current content. Review accessible hosted logs/artifacts and final package
  contents. Record exclusions and inaccessible surfaces; resolve concrete findings.
  History rewriting is a separate recovery decision.
- Final completion has four independent evidence categories: prepared locally,
  configured on GitHub, published, and installation verified. An existing public
  repository needs no visibility transition to meet this spec.

## Testing Decisions

The maintainer explicitly approved the following verification scope before spec
publication. Prefer existing externally observable seams over new mock layers.

- Reuse CI's typecheck, unit, browser, and production-build checks against the
  exact candidate. Record commands, revision, skip reasons, and complete results.
  Historical green counts are not current-candidate evidence.
- Reuse the release assembler and assembled-installer integration seam: inspect
  output identity/version/assets/notices and drive the actual generated bootstrap
  with controlled downloads and Samsung CLI stubs. Cover single-version selection,
  missing/mismatched checksums, explicit widget handling, and stale signed output.
- Reuse release-gate and workflow tests for synchronized versions, missing
  configuration, correct repository, fork-secret isolation, and publication job
  permissions. Test outcomes rather than asserting comments or private helpers.
- Validate draft retry behavior and completed-release protection without replacing
  public assets. Confirm actual hosted workflow/check results and effective remote
  settings by readback, not merely generated YAML.
- Verify fresh-clone instructions using only tracked files and explicit documented
  prerequisites. Credential-free checks must work without the maintainer's env or
  signing settings; live sign-in prerequisites remain explicit.
- Run maintained redacted exposure scanning and inspect deliverables for private
  signing material, user tokens, account content, and applicable notices. Record
  app-client embedding as intentional, not as evidence that user tokens may ship.
- After publication, anonymously retrieve release metadata and the complete asset
  set, verify checksums, and use those downloaded files for installation testing.
- On the agreed macOS/TV baseline, verify local signing, fresh installation,
  launch, device-code sign-in, core browsing/native playback, and upgrade with the
  same author certificate preserving session/settings. Coordinate one TV owner.
- Extend the existing integrated device checklist for History/resume, watched
  state, Live TV, startup preferences, audio/subtitles/quality, and lifecycle and
  artwork regressions. Use viewer confirmation for physical picture/sound and
  readability; browser fixtures and JS-memory estimates do not prove native output.
- Record pass/fail/blocked per device item and exact package/source identity.
  Unresolved core installation, sign-in, or playback failures block installable
  launch; other exclusions require explicit disclosure and maintainer acceptance.

## Out of Scope

- Implementation during this specification/ticket-creation request.
- Publishing to npm, a TV app store, Homebrew, or an unrelated repository.
- A new authentication architecture, companion server, transcoding service, or
  password-entry flow replacing device approval.
- Fabricated support across host operating systems, TV models, or firmware.
- Automatically replacing functioning tag-driven tooling with Release Please.
- Treating secret configuration as upstream authorization or credential ownership.
- Embedding user passwords, access tokens, refresh tokens, or signing private keys.
- Rewriting history, changing visibility, committing, pushing, merging, creating
  PRs, changing protection/settings, or publishing releases without authorization
  for those operations.
- Closing existing application defects or device-acceptance tickets merely
  because this launch spec exists or a packaging check passes.

## Further Notes

The investigation established that previous working builds fetched app credentials
from the public kpapp.link JavaScript and injected them ephemerally. Both values
matched the inspected local widget. The maintainer subsequently approved keeping
them in ignored local configuration and configuring GitHub release secrets.
Neither action establishes a fresh client issued for KinoTV.

GitHub secret names were verified present on November 17, 2026. Preserve that
completed setup instead of creating duplicate secret tasks; recheck presence and
workflow wiring before release. Local agent guidance already records provenance.

The earlier audit's candidate was f01df75. Later local committed tip 652b04e and
substantial uncommitted changes add product behavior and verification evidence;
earlier test totals do not certify the eventual release candidate. An ordinary
configured production build subsequently passed and embedded the local client.

Existing tracker context: kinotv-91o.19 contains the implemented release pipeline
and installer; kinotv-91o.20 records the earlier own-client request requirement;
kinotv-91o.23 owns known timing instability; kinotv-91o.26.13 owns coordinated
integrated TV acceptance. Link/reconcile these rather than duplicating their work
or automatically changing their status. The new launch choice supersedes the
earlier own-client-only product assumption, not the historical record of it.

Maintainer inputs still required before affected work can finish: exact copyright
name/year, private reporting contact, confirmed support baseline, and release
candidate/integration selection. Record these inputs without inventing identities
or broadening support. This spec authorizes planning; remote publication and Git
operations remain subject to explicit scoped approval.
