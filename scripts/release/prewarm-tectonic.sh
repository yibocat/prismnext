#!/usr/bin/env bash
set -euo pipefail

# First Tectonic compile downloads the support bundle. CI's 60s compile
# timeout otherwise kills standalone/bib fixtures mid-package-load.
# Usage: ./scripts/release/prewarm-tectonic.sh [tectonic-binary]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

resolve_bundled() {
  local os arch platform_dir arch_dir binary_name
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin) platform_dir="darwin" ;;
    Linux) platform_dir="linux" ;;
    MINGW*|MSYS*|CYGWIN*) platform_dir="windows" ;;
    *) echo "Unsupported OS: $os" >&2; return 1 ;;
  esac
  case "$arch" in
    arm64|aarch64) arch_dir="arm64" ;;
    x86_64|amd64) arch_dir="x64" ;;
    *) echo "Unsupported arch: $arch" >&2; return 1 ;;
  esac
  binary_name="tectonic"
  if [[ "$platform_dir" == "windows" ]]; then
    binary_name="tectonic.exe"
  fi
  echo "$ROOT/bin/tectonic/${platform_dir}-${arch_dir}/${binary_name}"
}

TECTONIC="${1:-$(resolve_bundled)}"
if [[ ! -x "$TECTONIC" ]]; then
  echo "Tectonic binary missing or not executable: $TECTONIC" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat > "$work/warm.tex" <<'TEX'
\documentclass{article}
\begin{document}
ok
\end{document}
TEX

echo "Prewarming Tectonic bundle via $TECTONIC"
"$TECTONIC" --keep-logs --outdir "$work" "$work/warm.tex"
test -f "$work/warm.pdf"
echo "Tectonic bundle is warm"
