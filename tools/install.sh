#!/usr/bin/env bash
# MIT License
#
# Copyright (c) 2026 Dzmitry Artsiukhou
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# KinoTV installer for Samsung TVs (spec §11). Download it from the latest GitHub release and run:
#
#   bash install.sh                  install (or update) the latest release
#   bash install.sh --wgt FILE       install a KinoTV.wgt you already downloaded
#   bash install.sh --release v1.2.3 select a specific release instead of latest
#
# It downloads the installer (kinotv-installer.mjs) and the unsigned app (KinoTV.wgt) from the latest
# release into ~/KinoTV (or $KINOTV_DIR), then runs the installer there. The installer walks you through
# TV Developer Mode, the connection and your Samsung certificate, then signs the app with your certificate
# and installs it. It never installs anything on this computer without asking first.
set -euo pipefail

# The GitHub repo the release came from. tools/release/assemble.ts fills it in from package.json
# ("kinotv": { "githubRepo" }) when it builds the release; KINOTV_GITHUB_REPO overrides it.
GITHUB_REPO="${KINOTV_GITHUB_REPO:-OWNER/REPO}"
KINOTV_DIR="${KINOTV_DIR:-$HOME/KinoTV}"

fail() {
  printf '✗ %s\n' "$1" >&2
  shift
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  exit 1
}

wgt=""
tag=""
while [ $# -gt 0 ]; do
  case "$1" in
    --wgt)
      [ $# -ge 2 ] && [ -n "$2" ] || fail "--wgt needs the path to a KinoTV.wgt file."
      wgt="$2"
      shift 2
      ;;
    --release)
      [ $# -ge 2 ] && [ -n "$2" ] || fail "--release needs a tag such as v1.2.3."
      tag="$2"
      shift 2
      ;;
    -h | --help)
      printf 'Usage: bash install.sh [--release vX.Y.Z] [--wgt FILE]\n'
      printf 'With --wgt, only the installer comes from the selected release; the local widget is inspected, not release-checksummed.\n'
      exit 0
      ;;
    *) fail "Unknown option: $1" "Usage: bash install.sh [--release vX.Y.Z] [--wgt FILE]" ;;
  esac
done

if [ "$GITHUB_REPO" = "OWNER/REPO" ]; then
  fail "This copy of install.sh doesn't know where KinoTV's releases are." \
    "Download install.sh from the Releases page of KinoTV on GitHub and run that one."
fi

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed. The installer needs Node.js 22 or later." \
    "Install the LTS version from https://nodejs.org, then run this again."
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  fail "Node.js $(node -v) is too old. The installer needs Node.js 22 or later." \
    "Install the LTS version from https://nodejs.org, then run this again."
fi
command -v curl >/dev/null 2>&1 || fail "curl is not installed." "Install curl, then run this again."

# Resolve latest exactly once; every asset request below uses this same tag.
if [ -z "$tag" ]; then
  metadata="$(curl -fLsS "https://api.github.com/repos/$GITHUB_REPO/releases/latest")" ||
    fail "Couldn't resolve the latest release."
  tag="$(node -e 'try { const r = JSON.parse(process.argv[1]); if (typeof r.tag_name !== "string") process.exit(1); process.stdout.write(r.tag_name); } catch { process.exit(1); }' "$metadata")" ||
    fail "The latest release response has no valid tag."
fi
[[ "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] ||
  fail "Invalid release tag: $tag. Expected vX.Y.Z."
printf 'Selected release %s\n' "$tag"

# A --wgt path is relative to where you ran this, so make it absolute before changing folders.
if [ -n "$wgt" ]; then
  case "$wgt" in /*) ;; *) wgt="$PWD/$wgt" ;; esac
  [ -f "$wgt" ] || fail "No file at $wgt."
fi

mkdir -p "$KINOTV_DIR"
cd "$KINOTV_DIR"
KINOTV_DIR="$PWD"

release="https://github.com/$GITHUB_REPO/releases/download/$tag"
download() {
  printf 'Downloading %s…\n' "$1"
  curl -fL --progress-bar -o "$KINOTV_DIR/$1" "$release/$1" ||
    fail "Couldn't download $1 from $release." \
      "Check this computer's internet connection, or open $release in a browser to see the release."
}

verify() {
  node --input-type=commonjs - "$1" <<'NODE'
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const name = process.argv[2];
try {
  const entries = fs.readFileSync('SHA256SUMS', 'utf8').split(/\r?\n/)
    .map(line => /^([a-fA-F0-9]{64}) [ *](.+)$/.exec(line))
    .filter(entry => entry && entry[2] === name);
  if (entries.length !== 1) throw new Error('missing or duplicate SHA256SUMS entry');
  const actual = createHash('sha256').update(fs.readFileSync(name)).digest('hex');
  if (actual !== entries[0][1].toLowerCase()) throw new Error('SHA256 mismatch');
  console.log(`Verified ${name}`);
} catch (error) {
  console.error(`Cannot verify ${name}: ${error.message}`);
  process.exit(1);
}
NODE
}

download SHA256SUMS
download kinotv-installer.mjs
verify kinotv-installer.mjs
if [ -z "$wgt" ]; then
  download KinoTV.wgt
  verify KinoTV.wgt
  wgt="$KINOTV_DIR/KinoTV.wgt"
  exec node kinotv-installer.mjs --wgt "$wgt" --release "$tag"
fi

printf 'Using local widget %s (not verified against release SHA256SUMS); its identity and version will be inspected.\n' "$wgt"
exec node kinotv-installer.mjs --wgt "$wgt"
