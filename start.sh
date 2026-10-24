#!/usr/bin/env bash
# One-command local start for Linux/macOS: installs dependencies on first run, then starts API + UI.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "Node.js 18+ is required: https://nodejs.org/"; exit 1; fi
exec node scripts/dev.mjs "$@"
