# KinoTV

Unofficial kino.watch client for Samsung Tizen TVs, built as a Tizen web app. Design spec:
[`docs/superpowers/specs/2026-11-02-kinotv-tizen-app-design.md`](docs/superpowers/specs/2026-11-02-kinotv-tizen-app-design.md).

## Install KinoTV on your Samsung TV

KinoTV isn't in Samsung's app store. You install it from your computer with an install script. Samsung TVs
only accept apps signed for that particular TV, so the script helps you make a free Samsung certificate for
your TV and signs KinoTV with it. The first install takes about 30 minutes. Updates take a minute.

**You need:**

- a kino.watch subscription;
- a Samsung TV from 2022 or later (tested on a 2023 Q60C with Tizen 7.0);
- a Mac on the same network as the TV (tested on macOS; Linux may work but is untested);
- a Samsung account, for the certificate;
- [Node.js](https://nodejs.org) 22 or later (the LTS version).

The script never installs anything on your computer without asking first. It keeps its files in `~/KinoTV`.

### 1. Get Samsung's TV tools

1. Download the Tizen SDK **CLI installer** for macOS from <https://samsungtizenos.com/tools-download/>.
   It's a file named like `web-cli_Tizen_SDK_<version>_macos-64.bin`. Don't run it yourself: the install
   script asks for it in step 3 and installs it into `~/tizen-studio`. On an Apple Silicon Mac the script also
   offers to install Rosetta, which Samsung's tools need.
2. Install [VS Code](https://code.visualstudio.com) and its Samsung **Tizen TV** extension
   (`tizensdk.tizentv`). You'll use its Certificate Manager in step 6. Tizen Studio's Certificate Manager
   works too.

### 2. Turn on Developer Mode on the TV

1. On the TV, open **Apps** and press **1 2 3 4 5** on the remote (or on the on-screen keypad).
2. Set **Developer mode** to **On**. For **Host PC IP**, enter your Mac's IP address. It's in System
   Settings → Wi-Fi → Details, and the script prints it too when it gets to the TV.
3. Restart the TV: hold the power button on the remote until it restarts. **Develop Mode** now shows at the
   top of Apps.
4. Note the TV's IP address: Settings → General → Network → Network Status → IP Settings.

> **TODO (screenshot, needs the TV):** the Developer Mode dialog in Apps, with Host PC IP filled in.

### 3. Download and run the install script

1. Open the **Releases** page of this repository on GitHub and, under the latest release, download
   `install.sh`. You only need this one file; the script downloads the rest.
2. Open Terminal and run:

   ```sh
   bash ~/Downloads/install.sh
   ```

The script works through five steps and stops with instructions if one needs you. Fix what it says and run
it again. It remembers your answers and skips what is already done.

### 4. Script step 1: Tizen tools

If the Tizen CLI isn't installed yet, the script asks for the path of the CLI installer you downloaded in
step 1. Drag the file into the Terminal window and press Enter. Then it shows the package-manager commands
that add Samsung's TV extensions. Run them in a second Terminal window and press Enter when they're done.

> **TODO (screenshot):** Terminal at "Step 1/5 · Tizen tools".

### 5. Script steps 2 and 3: connecting to the TV

Type the TV's IP address when the script asks. It connects to the TV and shows the TV's **DUID**, a device
ID that the certificate needs. If it can't reach the TV, check the Developer Mode steps above. The Host PC IP
must be this Mac's address, and the TV must have been restarted after you set it.

> **TODO (screenshot):** Terminal showing "Connected to …" and the DUID.

### 6. Script step 4: your Samsung certificate

This is the one step that has to be done in Samsung's app. In VS Code, open the command palette and run
**Tizen: Run Certificate Manager** (or in Tizen Studio: Tools → Certificate Manager). Then:

1. Click **+**, choose **Samsung** (not Tizen), then **TV**. Name the profile `KinoTV`.
2. **Author certificate:** create a new one and sign in with your Samsung account. Keep a backup of the
   `author.p12` file it makes (in `~/SamsungCertificate/KinoTV/`). Updates must be signed with the same
   author certificate.
3. **Distributor certificate:** choose privilege **Public** and add the DUID the script showed.
4. Click **Finish**, go back to Terminal and press Enter.

> **TODO (screenshots):** Certificate Manager: choosing Samsung → TV; the author certificate; the
> distributor certificate with the DUID.

### 7. Script step 5: signing and installing

The script signs KinoTV with your certificate, installs it on the TV and starts it. KinoTV is now in
**Apps** on the TV, and you can sign in with your kino.watch account.

> **TODO (screenshot, needs the TV):** KinoTV in Apps.

### Updating

When a new version is out, KinoTV shows **Доступно обновление (vX.Y.Z)** ("Update available") in Settings.
Samsung doesn't let sideloaded apps update themselves, so run the script again:

```sh
bash ~/Downloads/install.sh
```

It downloads the latest release and reuses the TV address and certificate from the first install. The TV
must still be in Developer Mode.

To install a `KinoTV.wgt` you already downloaded, run `bash install.sh --wgt path/to/KinoTV.wgt`.

### If something goes wrong

| What the script says | What to do |
|---|---|
| `Can't reach the TV at …` | Developer Mode must be on with this Mac's IP as Host PC IP, and the TV restarted after setting it. Both must be on the same network. |
| `Author certificate not match` | KinoTV is already on the TV, signed with a different author certificate. Uninstall it from Apps on the TV and run the script again. |
| `Invalid certificate chain` or error `1010` | The certificate wasn't made for this TV. Recreate the distributor certificate with this TV's DUID. |
| `Node.js is not installed` / `too old` | Install the LTS version from <https://nodejs.org>. |

The script keeps the TV address and profile name in `~/KinoTV/tizen/.signing/settings.json`. Delete that file
to start over. Set `KINOTV_DIR` to use another folder.

## Development

Needs Node 22.

```sh
npm install
npx playwright install chromium   # once, for the e2e tests
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. The 1920×1080 TV frame is scaled to fit the browser window. |
| `npm test` | Vitest: small tests for pure logic (e.g. key mapping), next to the code as `*.test.ts`. |
| `npm run e2e` | Playwright: builds the app against a fake API and drives it with remote keys in Chromium at 1920×1080. |
| `npm run typecheck` | TypeScript, app and tests. |
| `npm run build` | Production build into `dist/` (Chrome 85 target) and prints the gzipped JS size against the 300 KB budget. |

The keyboard stands in for the remote:

| Remote | Keyboard |
|---|---|
| D-pad, OK | Arrow keys, Enter |
| Back | Backspace or Escape |
| Play/Pause | Space |
| Rewind / Fast-forward | `[` / `]` |
| CH ▲ / CH ▼ | Page Up / Page Down |

### Sign-in credentials

Sign-in uses kino.watch's OAuth device flow, which needs an OAuth client. Copy `.env.example` to `.env.local`
(git-ignored) and fill in `VITE_KP_CLIENT_ID` and `VITE_KP_CLIENT_SECRET`. Without them the Sign-in screen
can't get a code. Never commit real credentials. The e2e build overrides both (and the API host) with fake
values from `playwright.config.ts`, so real credentials never reach a test.

The API host defaults to `https://api.service-kp.com`. Set `VITE_API_BASE_URL` in `.env.local` to use another
one (for example the mirror `https://api.srvkp.com`).

### Playback in the browser

In Chrome the player uses a plain `<video>` element. Current desktop Chrome plays kino.watch's HLS streams
natively, so there is no hls.js; a browser without native HLS gets the MP4 stream instead. The e2e build sets
`VITE_PLAYER=fake` to play through the FakePlayer, which tests script from `e2e/harness/player.ts`. You can use
it in development too (`VITE_PLAYER=fake npm run dev`): playback is simulated, no video is fetched.

## On the TV

The app is a Tizen web app (`.wgt`). A Samsung TV only installs packages signed with a Samsung certificate
made for that TV, so the first run needs a one-time setup. Samsung's TV emulator doesn't run on Apple Silicon,
so test on a real TV.

| Command | What it does |
|---|---|
| `npm run tv:setup` (or `tools/setup.sh`) | Interactive wizard. It checks Rosetta, installs or finds the Tizen CLI and `sdb`, walks you through TV Developer Mode, connects to the TV, shows its DUID and guides you through creating the Samsung certificate. Safe to re-run. |
| `npm run package` | Builds and packages `dist-tizen/KinoTV.wgt`. It is signed when a certificate profile is set up, otherwise unsigned (no Tizen tools needed). |
| `npm run tv` | Builds, signs, installs and launches the app on the TV. |
| `npm run tv:debug` | The same, launched in debug mode. Prints the DevTools address to open in Chrome. |

The wizard saves the TV's address and the certificate profile name in `tizen/.signing/settings.json`, which
is git-ignored. `KINOTV_TV` and `KINOTV_TIZEN_PROFILE` override them. The Tizen tools are found on `PATH` or in
`$TIZEN_HOME` (default `~/tizen-studio`).

The package manifest (`config.xml`) is generated at build time by `tools/tizen/configXml.ts`, with the version
taken from `package.json`. The launcher icon is `tizen/icon.png`, rendered from `tizen/icon.svg` with
`node tools/tizen/renderIcon.ts`. The production build is a single classic script (not an ES module), because
the TV opens the app from local files and Chromium doesn't load module scripts from `file://`.

## Releases (maintainers)

CI (`.github/workflows/ci.yml`) runs the typecheck, unit tests, e2e tests and the build on every push to a
branch and on pull requests. Pushing a version tag runs `.github/workflows/release.yml`. It checks the release
gate, runs the same tests, builds the app with the project's own API credentials and publishes a GitHub
Release with three files:

| File | What it is |
|---|---|
| `KinoTV.wgt` | The app, **unsigned**. Each user signs it with their own Samsung certificate. |
| `install.sh` | The script users download and run. It fetches the other two files from the latest release. |
| `kinotv-installer.mjs` | The installer (`tools/tizen/installer.ts` plus the setup wizard), bundled into one file that needs only Node.js. |

**One-time setup on GitHub, before the first release:**

1. **The repo.** Set `"kinotv": { "githubRepo": "<owner>/<repo>" }` in `package.json`. This is the only place
   it is set. The app's update check and `install.sh` use it. Until it is set, it stays the placeholder
   `OWNER/REPO`, the update check is off and releases are blocked.
2. **The credentials.** Add the repository secrets `KP_CLIENT_ID` and `KP_CLIENT_SECRET` (GitHub → Settings →
   Secrets and variables → Actions → New repository secret). They must be KinoTV's **own** kino.watch API
   client, never the borrowed development one from `.env.local`. The release build passes them to the app as
   `VITE_KP_CLIENT_ID` and `VITE_KP_CLIENT_SECRET`, the same variables `.env.local` sets during development.

The release gate (`tools/release/gate.ts`) fails the workflow with a clear message if either secret is missing,
if the tag isn't `v` + the `package.json` version, or if `githubRepo` doesn't name the repository being
released.

**To release:** set `version` in `package.json`, commit, then `git tag v<version>` and push the tag. To check the
release files locally, run `npm run build && npm run release:assets`. They go to `dist-release/` (git-ignored).

The app checks `https://api.github.com/repos/<githubRepo>/releases/latest` at launch, at most once a day. The
result is kept in `localStorage`. When the latest tag is a newer semver than the app's own version, Settings shows
"Доступно обновление (vX.Y.Z)". `VITE_RELEASES_URL` overrides the URL; the e2e tests point it at the fake API.
