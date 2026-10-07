#!/usr/bin/env bash
# Review handoff: setup dependencies while networking is available, before offline agent phase.
# This script is supplied, NOT RUN on this Windows host. It never contacts a coaching provider.
set -euo pipefail
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  librsvg2-dev libxdo-dev libssl-dev pkg-config build-essential openssl
pnpm --dir app install --frozen-lockfile --config.strict-dep-builds=false
pnpm --dir app exec playwright install chromium
pnpm --dir app build
cargo fetch --locked
# All-feature SIWC tests still need a MATCHING synthetic key + public JWKS pair.
# Do not overwrite the committed JWKS in the actual checkout. Reproduce in an
# archive under review/ as this review did; paired generated public data belongs
# in that review-owned copy. A random private key alone is insufficient.
# Linux native build icon workaround (no config edits):
export TAURI_CONFIG='{"bundle":{"icon":["icons/icon.png","icons/icon.ico"]}}'
printf '%s\n' 'Dependencies cached. Clean install and fixture failures remain findings; setup flags are workarounds.'
