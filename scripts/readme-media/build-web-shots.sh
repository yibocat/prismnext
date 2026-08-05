#!/usr/bin/env bash
# build-web-shots.sh — Convert assets/screenshots-2/ PNGs into website-ready WebP.
#
# Output: website/assets/shots/<type>/<pack>-<mode>.webp  (9 types × 5 packs × 2 modes = 90 files)
#   type: home intensive multimodel experiment git literature notes reading writing
#   pack: academic midnight forest warmpaper graphite
#   mode: light dark
# Plus website/assets/shots/interactive.webp (theme-independent).
#
# WebP keeps the source alpha (window shadow / rounded corners) — JPEG did not.
# Requires: sips (macOS builtin) + cwebp (brew install webp).
#
# Handles known source quirks:
#   - "forset" / "warmpaper" typos in every folder
#   - midnight naming differs per folder (midlight-dark/midnight-light/mignight-light/midnight-dark)
#   - MultiModel uses timestamp filenames (mapping verified by eye, 2026-08-04)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/assets/screenshots-2"
OUT="$ROOT/website/assets/shots"
QUALITY=88
WIDTH=2000

command -v cwebp >/dev/null || { echo "cwebp not found — brew install webp" >&2; exit 1; }
[[ -d "$SRC" ]] || { echo "source dir not found: $SRC" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

convert() { # $1=src-file $2=dst-file(no ext)
  local src="$1" dst="$2"
  if [[ ! -f "$src" ]]; then
    echo "MISSING: $src" >&2
    return 1
  fi
  mkdir -p "$(dirname "$dst")"
  local w h
  w=$(sips -g pixelWidth "$src" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$src" | awk '/pixelHeight/{print $2}')
  local rh=$(( WIDTH * h / w ))
  cwebp -quiet -q "$QUALITY" -resize "$WIDTH" "$rh" "$src" -o "$dst.webp"
  echo "ok: ${dst#"$OUT"/}.webp"
}

# --- standard folders: everything except midnight is consistently named ---
# args: srcdir type mid_dark mid_light
build_type() {
  local dir="$1" type="$2" mid_dark="$3" mid_light="$4"
  convert "$SRC/$dir/academic-dark.png"   "$OUT/$type/academic-dark"
  convert "$SRC/$dir/academic-light.png"  "$OUT/$type/academic-light"
  convert "$SRC/$dir/$mid_dark"           "$OUT/$type/midnight-dark"
  convert "$SRC/$dir/$mid_light"          "$OUT/$type/midnight-light"
  convert "$SRC/$dir/forset-dark.png"     "$OUT/$type/forest-dark"
  convert "$SRC/$dir/forset-light.png"    "$OUT/$type/forest-light"
  convert "$SRC/$dir/warmpaper-dark.png"  "$OUT/$type/warmpaper-dark"
  convert "$SRC/$dir/warmpaper-light.png" "$OUT/$type/warmpaper-light"
  convert "$SRC/$dir/graphite-dark.png"   "$OUT/$type/graphite-dark"
  convert "$SRC/$dir/graphite-light.png"  "$OUT/$type/graphite-light"
}

rm -rf "$OUT"

build_type "HomePage-NewAgentSession"            home       midnight-dark.png mignight-light.png
build_type "IntensiveReading-FormulaExplanation" intensive  midnight-dark.png mignight-light.png
build_type "experiment"                          experiment midlight-dark.png midnight-light.png
build_type "git"                                 git        midlight-dark.png midnight-light.png
build_type "literature"                          literature midlight-dark.png mignight-light.png
build_type "notes"                               notes      midlight-dark.png mignight-light.png
build_type "reading"                             reading    midlight-dark.png mignight-light.png
build_type "writing"                             writing    midlight-dark.png mignight-light.png

# --- MultiModel: timestamp filenames ---
MM="$SRC/MultiModel"
convert "$MM/Screenshot2026-08-04 23.02.58.png" "$OUT/multimodel/academic-light"
convert "$MM/Screenshot2026-08-04 23.03.02.png" "$OUT/multimodel/midnight-light"
convert "$MM/Screenshot2026-08-04 23.03.05.png" "$OUT/multimodel/forest-light"
convert "$MM/Screenshot2026-08-04 23.03.07.png" "$OUT/multimodel/warmpaper-light"
convert "$MM/Screenshot2026-08-04 23.03.09.png" "$OUT/multimodel/graphite-light"
convert "$MM/Screenshot2026-08-04 23.03.15.png" "$OUT/multimodel/academic-dark"
convert "$MM/Screenshot2026-08-04 23.03.17.png" "$OUT/multimodel/midnight-dark"
convert "$MM/Screenshot2026-08-04 23.03.19.png" "$OUT/multimodel/forest-dark"
convert "$MM/Screenshot2026-08-04 23.03.21.png" "$OUT/multimodel/warmpaper-dark"
convert "$MM/Screenshot2026-08-04 23.03.23.png" "$OUT/multimodel/graphite-dark"

# --- theme-independent extras ---
convert "$ROOT/assets/screenshots-2/交互式科研.png" "$OUT/interactive"

echo "---"
find "$OUT" -name '*.webp' | wc -l | xargs echo "total webp files:"
du -sh "$OUT" | cut -f1 | xargs echo "total size:"
