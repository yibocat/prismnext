#!/usr/bin/env bash
# Regenerate the README covers from scripts/readme-media/cover.html
# (website "living preprint" style, 2400x720) using headless Chrome:
#   ?lang=en -> assets/readme-cover.png      (English README)
#   ?lang=zh -> assets/readme-cover-zh.png   (中文 README)
#
# Usage:  ./scripts/readme-media/generate-readme-cover.sh
# Override the browser:  CHROME=/path/to/chrome ./scripts/readme-media/generate-readme-cover.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SRC="file://$ROOT/scripts/readme-media/cover.html"

render() { # $1 = lang, $2 = output
  local out="$2"
  rm -f "$out"
  "$CHROME" --headless=new --disable-gpu --user-data-dir="$(mktemp -d)/cover-$1" \
    --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=9000 --window-size=2400,720 \
    --screenshot="$out" "$SRC?lang=$1" >/dev/null 2>&1 &
  local pid=$!
  for _ in $(seq 1 45); do [[ -s "$out" ]] && break; sleep 1; done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  [[ -s "$out" ]] || { echo "cover render failed: $out" >&2; exit 1; }
  echo "wrote $out"
}

render en "$ROOT/assets/readme-cover.png"
render zh "$ROOT/assets/readme-cover-zh.png"
