# KinoTV

Watch films and series from [kino.watch](https://kino.watch) on your Samsung TV.
KinoTV is an unofficial Tizen app with a Russian interface you navigate with
your remote. You’ll need a kino.watch account with an active subscription.

[Русский](README.md) · [Download](https://github.com/dartyuhov/kinotv/releases/latest) · [Install](#install-on-your-tv)

![KinoTV Home with The Sopranos featured above a row of posters](docs/screenshots/home.webp)

| Search | Films and series |
| --- | --- |
| [![On-screen Russian keyboard and a result for The Sopranos](docs/screenshots/search.webp)](docs/screenshots/search.webp) | [![The Sopranos details with season tabs and episode thumbnails](docs/screenshots/the-sopranos.webp)](docs/screenshots/the-sopranos.webp) |

Screenshots use a sample catalog. Posters and stills are from [TVmaze](https://www.tvmaze.com/).

## Install on your TV

KinoTV isn’t in the Samsung app store. We used a Mac to reinstall and launch
`v0.1.0` on a Samsung Q60C running Tizen 9.

1. Put your Mac and TV on the same network. Install Node.js 22.18+ and follow
   the [setup guide](docs/installation.md#prepare-samsung-tools) to install the
   Tizen SDK, enable Developer Mode, and set up a Samsung TV certificate.
2. Download `KinoTV.wgt`, `install.sh`, `kinotv-installer.mjs`, and `SHA256SUMS`
   from [the same release](https://github.com/dartyuhov/kinotv/releases).
3. In the download folder, check that all three files report `OK` before running
   the installer. Replace `v0.1.0` with the tag you downloaded if it differs.

   ```sh
   shasum -a 256 -c SHA256SUMS && bash ./install.sh --release v0.1.0
   ```

4. Open KinoTV on the TV. Scan the QR code with your phone, sign in to kino.watch,
   and approve the code shown on the TV.

To update, sign with the same author certificate and install over the existing
app. Uninstalling clears your local settings and sign-in. If installation fails,
see the [troubleshooting guide](docs/installation.md#troubleshoot-installation-and-playback).

## Watching with the remote

Search with the Russian or English on-screen keyboard, bookmark titles, and pick
up where you left off from History. KinoTV saves your position to your kino.watch
account. You can mark episodes and seasons as watched or switch to the TV tab
for live channels.

Use the arrows, **OK**, and **Back** to browse. During playback, **OK** pauses or resumes,
**left/right** seeks, and **up** opens audio, subtitles, and quality. Available
tracks and video quality depend on your TV and the stream.

## Contribute or report a bug

See [CONTRIBUTING.md](CONTRIBUTING.md) to build the app and run tests. For bugs,
[open an issue](https://github.com/dartyuhov/kinotv/issues) with your TV model,
firmware, KinoTV version, and steps to reproduce it. For private reports, email
[darst94@gmail.com](mailto:darst94@gmail.com).

KinoTV is licensed under the [MIT License](LICENSE). See the
[third-party notices](THIRD_PARTY_NOTICES.md) for other licenses.
