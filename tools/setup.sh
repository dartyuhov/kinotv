#!/usr/bin/env bash
# KinoTV TV setup wizard: Tizen tools, TV Developer Mode, sdb connection and the Samsung certificate.
# Same as `npm run tv:setup`. The wizard itself is tools/tizen/setup.ts.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js is not installed. Install Node 22.18 or later (https://nodejs.org), then run this again." >&2
  exit 1
fi
if ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)'; then
  echo "✗ Node $(node -v) is too old. Install Node 22.18 or later, then run this again." >&2
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing the project's dependencies (npm ci)…"
  npm ci
fi

exec node tools/tizen/cli.ts setup "$@"
