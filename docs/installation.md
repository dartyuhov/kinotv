# Install KinoTV with your own Samsung certificate

KinoTV's selected release format is an **unsigned `KinoTV.wgt`**. You create a
Samsung TV certificate profile for your TV's DUID, sign the widget locally, and
install it over the network. The project doesn't supply a maintainer certificate.
KinoTV is unofficial and isn't installed through the Samsung app store.

[Русское краткое руководство](../README.md#установка-на-телевизор) ·
[English overview](../README.en.md) · [Source builds](../CONTRIBUTING.md)

This is a pre-release guide, checked against source and Samsung documentation on
November 17, 2026. **Public release assets are not available yet.** The commands
below describe the current tools and the intended downloaded-file journey;
they aren't evidence of a completed public-download installation.

## Prerequisites and scope

The observed development environment is macOS plus Samsung Q60C on Tizen 9 /
Chromium 120. That observation doesn't validate all Q60C firmware or constitute
launch acceptance. Tizen 6.5+ is a design target; Chrome 85 is the build target.
The manifest's `required_version="3.0"` is not a tested support floor. Linux is
unverified; this guide doesn't establish a Windows installer route.

Prepare the following before starting:

- A TV that allows Developer Mode and a Mac on the same local network.
- Node.js **22.18+** with npm for KinoTV's tools; `curl` for the bootstrap.
- A Samsung Developer account for certificate creation.
- Tizen SDK Web CLI, `sdb`, TV Extension, and Samsung Certificate Extension.
- A Certificate Manager UI, through Tizen Studio or Samsung's Tizen TV extension
  for VS Code, and Device Manager for installation permission.
- Your own kino.watch account and subscription for viewing after installation.

For a manual unpack/check/sign workflow, the macOS commands below also use
`unzip`, `shasum`, and `mktemp`. You don't need a source checkout or `npm ci` to
run a downloaded bundled `kinotv-installer.mjs` once a release exists.

## Prepare Samsung tools

Install the SDK and extensions using Samsung's
[TV SDK instructions](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html).
The project's setup wizard can locate an existing SDK or prompt for a downloaded
[macOS CLI installer](https://samsungtizenos.com/tools-download/). It prints
extension setup instructions; package names vary by SDK version. For the UI,
see Samsung's [VS Code extension guide](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode-extension-new.html).
The SDK used by the current wizard requires Rosetta on Apple Silicon; the wizard
asks before installing it.

The project tools search `PATH` and `$TIZEN_HOME`, defaulting to
`~/tizen-studio`. For the manual commands in this guide, expose the SDK binaries
in your current terminal (adjust the first path if necessary):

```sh
export TIZEN_HOME="$HOME/tizen-studio"
export PATH="$TIZEN_HOME/tools/ide/bin:$TIZEN_HOME/tools:$PATH"
tizen version
sdb version
```

These commands must succeed before continuing. Use the same SDK installation
for Certificate Manager and CLI commands so they can find the same profile.

## Enable Developer Mode and connect

The TV needs the **computer's** address in Host PC IP. The installer needs the
**TV's** address. Menu labels vary by model and firmware.

1. Put the TV and Mac on the same local network. Find the Mac's LAN address in
   **System Settings → Wi-Fi → Details** (or the active Ethernet connection).
2. Open **Apps** on the TV. Enter **1 2 3 4 5** using the remote or on-screen
   number pad. Some firmware opens the dialog from the Apps settings screen.
3. Set **Developer mode → On** and **Host PC IP** to the Mac's address.
4. Restart the TV; hold the remote's power button until it restarts. Confirm
   **Develop Mode** is displayed in Apps.
5. Read the TV's address in **Settings → General → Network → Network Status →
   IP Settings**, or the equivalent menu on your firmware.
6. Replace the example address below with the TV's address and connect:

   ```sh
   TV_IP=192.168.1.50
   sdb connect "$TV_IP:26101"
   sdb devices
   ```

Confirm that the matching serial, such as `192.168.1.50:26101`, has state
`device`. A successful `sdb connect` message alone doesn't establish a usable
connection. Keep Developer Mode enabled for subsequent updates.

## Create your Samsung TV certificate profile

A profile combines an **author certificate** (your application's update
identity) and a **distributor certificate** (permission for the listed TVs).
Samsung's [certificate instructions](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
describe the current UI.

1. Find the TV's DUID. KinoTV's setup/installer prints it after connection.
   You can also find **Unique Device ID** under **Support → About This TV**
   or **Contact Samsung**, or select the connected device in Certificate Manager.
   A DUID is not the TV's IP address or model name.
2. Open **Tools → Certificate Manager** in Tizen Studio, or the Certificate
   Manager command supplied by Samsung's VS Code extension.
3. Click **+**, choose **Samsung → TV**, and name the profile `KinoTV`.
   Choose Samsung TV certificates, not a generic Tizen certificate.
4. For a first installation, create an **author certificate**, sign in to your
   Samsung Developer account, and choose a backup path. For an update, import
   the **same `author.p12` used for the installed copy**.
5. Back up `author.p12` and its password securely outside the source checkout.
   A new certificate under the same Samsung account or profile name does not
   preserve the author identity. Don't upload private certificates or passwords.
6. Create a **distributor certificate**, choose the **Public** privilege level,
   and add your TV's DUID. Finish the profile. For another TV, include its DUID
   in the distributor certificate while retaining the author certificate.
7. In Device Manager, right-click the connected TV and select **Permit to
   install applications**. The project wizard attempts the CLI equivalent;
   use Device Manager if that attempt fails.
8. Confirm the CLI can find your profile:

   ```sh
   tizen security-profiles list
   ```

Keep the profile name for signing. The certificate files remain local; they
aren't placed in the unsigned release widget. If certificates expire, renew the
appropriate certificate while preserving author identity for updates.

## Select and check downloaded files

When releases are published, open
[KinoTV Releases](https://github.com/dartyuhov/kinotv/releases) and select one
version explicitly. The planned asset set is `KinoTV.wgt`, `install.sh`,
`kinotv-installer.mjs`, and `SHA256SUMS`, with applicable notices supplied by the
release. Download all files from that same release to a new folder. Don't use
the automatically generated source archive as an installable widget.

Require the selected release's `SHA256SUMS`; if it is missing, stop and report
the incomplete asset set. Open a terminal in that folder and verify it before
running a downloaded installer or signing the widget:

```sh
shasum -a 256 -c SHA256SUMS
unzip -p KinoTV.wgt config.xml
```

Every listed file must be present and report `OK`. Stop on missing files or
mismatches. Check that the manifest is the requested version, the application ID
is `KinoTV0001.KinoTV`, and the package ID is `KinoTV0001`. The expected widget
version is the release's numeric version without the leading `v`. The manifest
contains no account credentials. Checksums check integrity against that release's
manifest; they don't independently authenticate its publisher.

The current bootstrap at documentation base `652b04e` has **no checksum check or
release-selection flag**. Even `--wgt` downloads the installer from `latest`.
Don't assume it implements the planned single-release contract. The direct
bundled-installer route below avoids that bootstrap download. Final bootstrap
flags and explicit-widget checksum behavior must be reconciled with the release
tooling before this guide is marked launch-ready.

## Sign and install the downloaded widget

Keep the original unsigned WGT unchanged so its published checksum remains
verifiable. Local signing changes the archive, so the signed copy won't have the
same checksum as the downloaded unsigned file. Choose one of the following
routes, after the certificate and download checks above.

### Use the bundled installer

The existing bundled installer accepts `--wgt`, performs SDK/TV/profile setup,
unpacks the unsigned archive, signs it with your selected profile, installs it,
and launches KinoTV. From the folder containing the selected release files, run:

```sh
node kinotv-installer.mjs --wgt ./KinoTV.wgt
```

Enter the TV's address and the profile name when prompted. It saves choices in
`tizen/.signing/settings.json` under the current directory and writes the signed
package under `signed/`. Before rerunning the current installer, ensure an old
`signed/KinoTV.wgt` cannot be reused: move the previous `signed/` directory to a
backup location or use a new working folder. Its stale-output hardening remains
separate implementation work. Check the version inside the signed WGT and the
installed app before treating an update as successful.

The shell bootstrap's currently verified syntax is:

```sh
bash ./install.sh --help
bash ./install.sh
bash ./install.sh --wgt ./KinoTV.wgt
```

Its help reports only `[--wgt FILE]`. It stores downloads under `~/KinoTV`, or
`$KINOTV_DIR`. These are current syntax examples, not the final verified release
download procedure. The unassembled `tools/install.sh` in source still has a
repository placeholder at this base; don't use it as a published download.

### Sign and install manually with the Samsung CLI

This route uses a new staging directory for every signing attempt to avoid
stale signed output. The downloaded widget already contains the built web app;
you don't need to compile the source again. From the download folder, run each
command separately and stop on failure:

```sh
PROFILE=KinoTV
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/kinotv-sign.XXXXXX")
mkdir "$STAGE/widget" "$STAGE/signed"
unzip -q ./KinoTV.wgt -d "$STAGE/widget"
tizen package -t wgt -s "$PROFILE" -o "$STAGE/signed" -- "$STAGE/widget"
unzip -p "$STAGE/signed/KinoTV.wgt" config.xml
unzip -l "$STAGE/signed/KinoTV.wgt"
```

Use the profile name shown by `tizen security-profiles list`. Confirm the CLI
reports success and the **new** output exists at the path above. Inspect its
manifest version and application/package IDs against the unsigned input; confirm
`author-signature.xml` and `signature1.xml` are present. Don't install an older
file after a failed signing attempt. These instructions start with an unsigned
release; if it unexpectedly contains signature files, stop and check its origin
and release notes rather than silently reusing another author's package.

With `TV_IP` set to your TV's address as above, install and launch:

```sh
tizen install -n KinoTV.wgt -s "$TV_IP:26101" -- "$STAGE/signed"
tizen run -p KinoTV0001.KinoTV -s "$TV_IP:26101"
```

Read the installation output as well as the exit status: the Samsung CLI can
report an installation failure even when its process exits successfully. Open
KinoTV from **Apps** if automatic launch fails. Check the installed version
before recording success. Keep the staging folder until you've verified the
installation; afterward you can remove that temporary folder yourself.

## Approve device-code sign-in

An installed, configured release requests its own device code. You don't need
to obtain or type OAuth client values as a release user.

1. Open KinoTV on the TV.
2. Scan its QR code or open the displayed address on your phone/computer.
3. Sign in to your own kino.watch account on that site and approve the TV's code.
4. Wait for the TV to open Home. Try browsing and a film or episode.

App OAuth credentials identify the shared application, while access and refresh
tokens belong to the approved account session on each installation. The chosen
release configuration uses maintainer-approved credentials borrowed from a public
client, not a newly issued KinoTV client. This doesn't assert ownership or
upstream permission. Builds must never distribute the maintainer's account
password, session tokens, or signing private keys. Source builders can read the
[configuration explanation](../CONTRIBUTING.md#configure-real-device-code-sign-in).

## Update while preserving your installation

Use the same application identity and **same author certificate** for updates.
Don't uninstall first: uninstalling discards local session/settings. A matching
profile name alone isn't sufficient if the underlying author certificate changed.

1. Keep your existing author-certificate backup and note the current app version,
   signed-in state, and preferences.
2. Download one newer release's complete asset set and verify it.
3. Sign in a fresh staging directory with the original author certificate and a
   valid distributor certificate containing the TV's DUID.
4. Confirm the newly signed manifest version and IDs, then install over the
   existing application using the commands above.
5. Launch KinoTV and verify the new installed version, retained sign-in, startup
   preference, and a real playback/resume journey.

Session/settings retention is the intended upgrade behavior; acceptance using
public downloads is still pending. The in-app update notice, once release
configuration is complete, is a notification rather than an over-the-air updater.
If the original author certificate is lost, a new certificate cannot update the
existing installation in place. Recover the backup first; removing the old app
and reinstalling is a last resort that loses local data and requires sign-in.

## Troubleshoot installation and playback

Use the error text to narrow the failure before changing certificates or
removing the installed app:

| Symptom | Check |
| --- | --- |
| TV not listed as `device` | Same LAN, no client isolation, correct TV IP, Developer Mode, correct Mac Host PC IP, TV restart |
| Profile not found | Same SDK/UI installation, exact profile name, `tizen security-profiles list` |
| `Author certificate not match` | Original author certificate, not a newly created certificate with the same profile name |
| `Invalid certificate chain`, `1010` | Distributor DUID, certificate validity, Samsung TV rather than generic Tizen profile |
| Installation not permitted | Device Manager → connected TV → **Permit to install applications** |
| Wrong version after signing | New output directory, signed manifest version, input release identity; don't reuse an old output |
| No sign-in code | Network/service availability; for source builds, both effective app-client values before rebuilding |
| No picture/sound/subtitles | Subscription, network, title/episode, codec/quality/track; compare another stream and report sanitized details |
| Artwork or return-from-Home problems | Restart and record the precise journey; native cache/lifecycle acceptance is still pending |

Use [GitHub Issues](https://github.com/dartyuhov/kinotv/issues) for nonsensitive
reports. Include version/source, host, TV model/firmware, exact steps, expected
and actual result, and sanitized error text. Don't attach credentials, DUIDs,
private signing material, authenticated stream URLs, or account response bodies.
A private reporting contact awaits maintainer confirmation; don't put sensitive
findings in public reports. Support is best-effort, without response deadlines.

## Verification still required for launch

These instructions distinguish local preparation from release acceptance:

| Evidence category | What must establish it |
| --- | --- |
| Prepared locally | Exact selected source, relevant automated checks, link/command checks, signed output identity |
| Configured on GitHub | Readback of actual workflow/check/secret-presence/settings state; not inferred from a guide |
| Published | Anonymous retrieval of a complete, matching release asset set |
| Installation verified | Those downloads signed/installed on the agreed macOS/TV baseline, real sign-in/native playback, same-author upgrade retaining session/settings |

The [integrated device checklist](integrated-tv-acceptance.md) supplies additional
History/resume, watched state, Live TV, startup, audio/subtitles/quality, artwork,
and lifecycle checks. Record exact package/source identity, device/firmware,
date, and pass/fail/blocked outcomes, with viewer confirmation of picture and
sound. Earlier browser fixtures and development observations don't complete
public-download acceptance. The final host/TV baseline and release candidate
still need coordinator confirmation.

## Samsung references

The certificate and CLI procedures were cross-checked against current Samsung
documentation, including Context7 retrieval, on November 17, 2026:

- [Create Samsung TV certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).
- [Package, install, run, and repackage with the CLI](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html).
- [Connect a TV device](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

SDK UI labels can change. Preserve the author identity and device authorization
requirements when following a newer Samsung UI.
