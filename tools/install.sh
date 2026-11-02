#!/usr/bin/env bash
# KinoTV installer for Samsung TVs (spec §11). Download it from the latest GitHub release and run:
#
#   bash install.sh                  install (or update) the latest release
#   bash install.sh --wgt FILE       install a KinoTV.wgt you already downloaded
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
while [ $# -gt 0 ]; do
  case "$1" in
    --wgt)
      [ $# -ge 2 ] || fail "--wgt needs the path to a KinoTV.wgt file."
      wgt="$2"
      shift 2
      ;;
    -h | --help)
      printf 'Usage: bash install.sh [--wgt FILE]\n'
      exit 0
      ;;
    *) fail "Unknown option: $1" "Usage: bash install.sh [--wgt FILE]" ;;
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

# A --wgt path is relative to where you ran this, so make it absolute before changing folders.
if [ -n "$wgt" ]; then
  case "$wgt" in /*) ;; *) wgt="$PWD/$wgt" ;; esac
  [ -f "$wgt" ] || fail "No file at $wgt."
fi

mkdir -p "$KINOTV_DIR"
cd "$KINOTV_DIR"

release="https://github.com/$GITHUB_REPO/releases/latest"
download() {
  printf 'Downloading %s…\n' "$1"
  curl -fL --progress-bar -o "$KINOTV_DIR/$1" "$release/download/$1" ||
    fail "Couldn't download $1 from $release." \
      "Check this computer's internet connection, or open $release in a browser to see the release."
}

download kinotv-installer.mjs
if [ -z "$wgt" ]; then
  download KinoTV.wgt
  wgt="$KINOTV_DIR/KinoTV.wgt"
fi

exec node kinotv-installer.mjs --wgt "$wgt"
