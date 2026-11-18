# Third-party notices

KinoTV redistributes the software and font resources listed below. Their
licenses apply independently of any license for KinoTV's original code. Preserve
the linked license texts and copyright notices when you redistribute these
components. Each linked text is included in this repository; a URL alone does
not replace the required notice.

## Application inventory

This inventory covers the production TV application built from revision
`652b04e5e4c325214bbcdfaf2449eca72dcde336` and its committed `package-lock.json`.
Versions are the installed, locked versions, not dependency ranges.

| Component | Version | License text | Provenance |
| --- | --- | --- | --- |
| Inter font and Fontsource CSS (`@fontsource/inter`) | 5.3.0 | [SIL OFL 1.1](public/licenses/inter-ofl-1.1.txt) | Package `LICENSE` |
| Norigin Spatial Navigation (`@noriginmedia/norigin-spatial-navigation`) | 3.4.0 | [MIT](public/licenses/norigin-mit.txt) | Upstream root `LICENSE`; re-export facade |
| Norigin Spatial Navigation Core (`@noriginmedia/norigin-spatial-navigation-core`) | 4.2.0 | [MIT](public/licenses/norigin-mit.txt) | Upstream root `LICENSE` |
| Norigin Spatial Navigation React (`@noriginmedia/norigin-spatial-navigation-react`) | 3.3.0 | [MIT](public/licenses/norigin-mit.txt) | Upstream root `LICENSE` |
| Lodash ES (`lodash-es`) | 4.18.1 | [MIT and accompanying notices](public/licenses/lodash-mit.txt) | Package `LICENSE` |
| TanStack Query (`@tanstack/react-query`) | 5.105.1 | [MIT](public/licenses/tanstack-mit.txt) | Package `LICENSE` |
| TanStack Query Core (`@tanstack/query-core`) | 5.105.1 | [MIT](public/licenses/tanstack-mit.txt) | Package `LICENSE` |
| Lucide React (`lucide-react`), including Feather-derived icons | 1.66.0 | [ISC and Feather MIT](public/licenses/lucide-isc-feather-mit.txt) | Complete package `LICENSE` |
| React (`react`), including JSX runtime | 18.3.1 | [MIT](public/licenses/react-mit.txt) | Package `LICENSE` |
| React DOM (`react-dom`) | 18.3.1 | [MIT](public/licenses/react-mit.txt) | Identical package `LICENSE` |
| React Scheduler (`scheduler`) | 0.23.2 | [MIT](public/licenses/react-mit.txt) | Identical package `LICENSE` |
| uqr (`uqr`), including Project Nayuki QR code implementation | 0.1.3 | [MIT](public/licenses/uqr-mit.txt) | Package `LICENSE` |
| Zustand (`zustand`) | 5.0.16 | [MIT](public/licenses/zustand-mit.txt) | Package `LICENSE` |

Inter is bundled as Latin and Cyrillic normal weights 400, 600, 700, and 800,
in both WOFF and WOFF2 formats (16 font files). The copyright line in the
Fontsource package is preserved verbatim, including its reference to an italic
source font. It is not a claim that KinoTV loads italic fonts. Inter font
software remains under OFL 1.1, independently of the application's license.

The Lucide notice preserves the entire upstream list of Feather-derived icons
and Cole Bemis's MIT notice. The list describes upstream provenance, not a claim
that KinoTV bundles every listed icon. The Lodash notice also preserves its
Underscore attribution and accompanying terms. The uqr notice preserves both
Project Nayuki and Anthony Fu attributions.

## Installer inventory

The generated `kinotv-installer.mjs` bundles these additional components,
classified as development dependencies in `package.json` or their dependencies.

| Component | Version | License text | Provenance |
| --- | --- | --- | --- |
| fflate (`fflate`) | 0.8.3 | [MIT](public/licenses/fflate-mit.txt) | Package `LICENSE` |
| Saxes (`saxes`) | 6.0.0 | [ISC and upstream notices](public/licenses/saxes-isc.txt) | Upstream `v6.0.0` root `LICENSE` |
| xmlchars (`xmlchars`) | 2.2.0 | [MIT](public/licenses/xmlchars-mit.txt) | Package `LICENSE` |

Saxes parses manifests with namespace and well-formedness checks; xmlchars
supplies its XML character tables. Its npm package omits the license file; the
complete text comes from the
[Saxes v6.0.0 license](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE),
including inherited SAX notices. These packages are installer tooling and do
not contribute JavaScript to the TV application.

Node.js built-ins are external runtime imports; KinoTV does not redistribute Node.js,
Samsung's SDK, or their executables in that bundle. The `install.sh` bootstrap
contains project shell code and invokes separately installed host tools.

## Source provenance

The license resources retain the complete upstream texts. Identical texts are
shared only where the installed package files match (React/React DOM/Scheduler
and the two TanStack packages). The fflate copy adds a final newline to the
packaged text; its license wording is unchanged. Package `LICENSE` means
`node_modules/<package>/LICENSE` after `npm ci` against the committed lockfile.
The lockfile records the registry tarball URL and integrity for each package.

The three Norigin npm packages omit a license file but declare `MIT` and point
to the same upstream repository. Their full license was retrieved from the
root `LICENSE` at the registry-reported `gitHead` for each installed version:

- Facade 3.4.0 and core 4.2.0:
  [Norigin license at 20a497a96276e579969aa512c2f8d181b468d6f9](https://github.com/NoriginMedia/Norigin-Spatial-Navigation/blob/20a497a96276e579969aa512c2f8d181b468d6f9/LICENSE).
- React adapter 3.3.0:
  [Norigin license at 5483dc21f5f2ebcdaf639c2c6dcef7386709a58d](https://github.com/NoriginMedia/Norigin-Spatial-Navigation/blob/5483dc21f5f2ebcdaf639c2c6dcef7386709a58d/LICENSE).

Both revisions contain the same MIT text, copyright 2022 NoriginMedia. The
copyright holders and years in these resources come from those upstream texts;
they do not establish the copyright holder or year for KinoTV's original code.

## Inventory verification

The inventory was checked on November 17, 2026, using `npm ci`, Vite 8.3.5, the
application's production build configuration, and the installer bundle settings
from `tools/release/assemble.ts`. Only fake OAuth client configuration was used.

An audit-only Vite plugin inspected every emitted JavaScript chunk's `modules`
in `generateBundle`, grouping module IDs under `node_modules` by package. The
application emitted code from Norigin core/React, Lodash ES, both TanStack
packages, Lucide React, React, React DOM, Scheduler, uqr, and Zustand. The Norigin
facade was a zero-length re-export. Eight Fontsource CSS modules supplied the
font assets. The installer used `configFile: false`, `ssr.noExternal: true`,
`build.ssr: tools/tizen/installer.ts`, target `node22`, no minification, and one
ES module output, matching the assembler's bundle configuration.

`npm ls --omit=dev --all` alone overstates the distributed closure. Type
packages, `loose-envify`, and `js-tokens` occur in the installed dependency tree
but contribute no modules to the production bundle. Zustand's bundled
`esm/react.mjs` uses `React.useSyncExternalStore`; the optional
`use-sync-external-store` and `immer` packages are neither installed nor bundled.
Build/test tools such as Vite, Rolldown, TypeScript, Vitest, and Playwright do
not contribute package modules to either distributed JavaScript bundle.

A production build passed with fake client configuration. The nine notice
resources matched their packaged or pinned upstream texts (with the final
newline addition noted above). All nine survived public-directory copying,
unsigned WGT assembly, and `copyWidget` signing staging byte-for-byte; the WGT
also contained all 16 font files. This checks signing staging, not a Samsung
certificate operation or TV installation. An audit-only installer build also
verified that an `output.banner` comment preserves the complete fflate text.

When you change dependencies, entry points, build settings, fonts, or icons,
repeat this audit against the exact release candidate. Add notices for any new
bundled code or resources; do not assume the runtime dependency tree or this
revision's inventory describes a later artifact.

## Distribution integration

The release asset contract is `KinoTV.wgt`, `install.sh`,
`kinotv-installer.mjs`, and `SHA256SUMS`. Carry the notices inside those assets
without requiring a fifth download:

1. Copy `public/licenses/` unchanged to `dist/licenses/`. Vite's normal public
   directory copying supplies these files. Copy this inventory to
   `dist/THIRD_PARTY_NOTICES.md` before widget assembly, and rewrite its license
   links from `public/licenses/` to `licenses/` in that distribution copy.
   `createUnsignedWgt` includes these ordinary files, and `copyWidget` retains
   them during local signing.
2. Embed the full project `LICENSE` followed by the complete texts of
   `public/licenses/fflate-mit.txt`,
   `public/licenses/saxes-isc.txt`, and `public/licenses/xmlchars-mit.txt` in a
   leading comment in `kinotv-installer.mjs`. The assembler supplies them through
   `build.rolldownOptions.output.banner`, wrapped in `/*! ... */`. Preserve the
   complete copyright, permission, and disclaimer, not only an SPDX identifier
   or a link. Embedded notices remain alongside the bundled code when the
   generated installer is downloaded or copied alone.
3. Generate checksums after notice embedding and all other asset changes.
   Inspect the actual WGT archive for the inventory and all license texts,
   and compare the installer comment with the project and all three dependency
   licenses. Verify
   that local signing preserves the WGT notice entries. Keep these checks in
   the release assembler's existing integration seam.

The release assembler implements the inventory-copy and installer-banner steps.
It also copies the project `LICENSE` into the widget. The source and distributed
`install.sh` carry the full project MIT text in a comment header. Local artifact
tests check these notices and signing staging; published-artifact verification
remains separate.

## Original-code license

KinoTV's original code uses the [MIT License](LICENSE), with the maintainer's
confirmed line `Copyright (c) 2026 Dzmitry Artsiukhou`. These third-party notices
remain separate from that license and retain their original holders and terms.
