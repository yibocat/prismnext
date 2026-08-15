#!/usr/bin/env bash
set -euo pipefail

# Mirror the Host checks that private Pro release CI runs before packaging.
# Run this from the Host repo before tagging / pushing a release.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PRISM_COMPILE_TIMEOUT_MS="${PRISM_COMPILE_TIMEOUT_MS:-180000}"

echo "==> Download bundled Tectonic (host platform)"
./scripts/download-tectonic.sh

echo "==> Prewarm Tectonic support bundle"
./scripts/release/prewarm-tectonic.sh

echo "==> Real compiler + release-sensitive tests"
pnpm exec vitest run \
  tests/main/compile-bib-integration.test.ts \
  tests/main/standalone-tex-inplace.real.test.ts \
  tests/main/experiment-ipc.test.ts \
  tests/renderer/welcome-page.test.tsx

echo "==> Full Host suite"
pnpm test

echo "Host release gate passed"
