#!/usr/bin/env bash
set -euo pipefail

# Download pinned Tectonic binaries into bin/tectonic/<platform>-<arch>/ for dev + packaging.
# Keep all release platforms locally, then electron-builder copies the matching folder
# per target (see electron-builder.yml).
#
# Usage:
#   ./scripts/download-tectonic.sh --all          # all platforms (recommended before dist)
#   ./scripts/download-tectonic.sh                # host platform only (CI per-OS job)
#   ./scripts/download-tectonic.sh 0.15.0 --all
#
# Pin file: scripts/tectonic-version.txt
#
# Manual download from browser? macOS may block the binary (Gatekeeper). After placing
# the file, run:  xattr -dr com.apple.quarantine bin/tectonic/darwin-arm64/tectonic

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIN_FILE="$SCRIPT_DIR/tectonic-version.txt"
BINARIES_DIR="$SCRIPT_DIR/../bin/tectonic"

DOWNLOAD_ALL=0
VERSION_ARG=""

usage() {
  cat <<'EOF'
Usage: ./scripts/download-tectonic.sh [--all] [version]

  --all   Download darwin-arm64, linux-x64, linux-arm64, windows-x64
  version Override pin in scripts/tectonic-version.txt
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --all)
      DOWNLOAD_ALL=1
      shift
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      VERSION_ARG="$1"
      shift
      ;;
  esac
done

read_pin() {
  if [[ ! -f "$PIN_FILE" ]]; then
    echo "Missing pin file: $PIN_FILE" >&2
    exit 1
  fi
  local line
  line="$(grep -v '^[[:space:]]*#' "$PIN_FILE" | grep -v '^[[:space:]]*$' | head -1 | tr -d '[:space:]')"
  if [[ -z "$line" ]]; then
    echo "Pin file has no version: $PIN_FILE" >&2
    exit 1
  fi
  echo "$line"
}

VERSION="${VERSION_ARG:-$(read_pin)}"
VERSION="${VERSION#v}"

TAG="tectonic%40${VERSION}"
BASE_URL="https://github.com/tectonic-typesetting/tectonic/releases/download/${TAG}"

# platform_dir arch_dir archive_name binary_name
download_one() {
  local platform_dir="$1"
  local arch_dir="$2"
  local archive="$3"
  local binary_name="$4"

  local target_dir="$BINARIES_DIR/$platform_dir-$arch_dir"
  mkdir -p "$target_dir"

  local full_url="${BASE_URL}/${archive}"
  echo "Downloading Tectonic ${VERSION} → ${platform_dir}-${arch_dir}..."
  echo "  ${full_url}"

  local temp_dir
  temp_dir="$(mktemp -d)"

  if ! curl -fsSL --retry 3 --retry-delay 2 "$full_url" -o "$temp_dir/archive"; then
    rm -rf "$temp_dir"
    echo "Failed to download: $full_url" >&2
    return 1
  fi

  mkdir -p "$temp_dir/extracted"
  if [[ "$archive" == *.zip ]]; then
    unzip -o "$temp_dir/archive" -d "$temp_dir/extracted" >/dev/null
  else
    tar -xzf "$temp_dir/archive" -C "$temp_dir/extracted"
  fi

  local binary_path
  binary_path="$(find "$temp_dir/extracted" \( -name 'tectonic' -o -name 'tectonic.exe' \) -type f | head -1)"
  if [[ -z "$binary_path" ]]; then
    rm -rf "$temp_dir"
    echo "Could not find tectonic binary in $archive" >&2
    return 1
  fi

  cp "$binary_path" "$target_dir/$binary_name"
  chmod +x "$target_dir/$binary_name"
  if [[ "$platform_dir" == "darwin" ]]; then
    xattr -dr com.apple.quarantine "$target_dir/$binary_name" 2>/dev/null || true
  fi
  printf '%s\n' "$VERSION" > "$target_dir/VERSION"
  rm -rf "$temp_dir"
  echo "Installed → $target_dir/$binary_name"
}

download_all_platforms() {
  echo "Fetching Tectonic ${VERSION} for all release platforms (pin: $PIN_FILE)"
  # Release trio: darwin-arm64, linux-x64, windows-x64
  download_one darwin arm64 "tectonic-${VERSION}-aarch64-apple-darwin.tar.gz" tectonic
  download_one linux x64 "tectonic-${VERSION}-x86_64-unknown-linux-musl.tar.gz" tectonic
  download_one linux arm64 "tectonic-${VERSION}-aarch64-unknown-linux-musl.tar.gz" tectonic
  download_one windows x64 "tectonic-${VERSION}-x86_64-pc-windows-msvc.zip" tectonic.exe
  echo "All platforms installed under $BINARIES_DIR"
}

download_host_platform() {
  local os arch platform_dir arch_dir rust_arch archive binary_name

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) platform_dir="darwin" ;;
    Linux) platform_dir="linux" ;;
    MINGW*|MSYS*|CYGWIN*) platform_dir="windows" ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    arm64|aarch64)
      arch_dir="arm64"
      rust_arch="aarch64"
      ;;
    x86_64|amd64)
      arch_dir="x64"
      rust_arch="x86_64"
      ;;
    *)
      echo "Unsupported arch: $arch" >&2
      exit 1
      ;;
  esac

  binary_name="tectonic"
  if [[ "$platform_dir" == "windows" ]]; then
    binary_name="tectonic.exe"
  fi

  if [[ "$platform_dir" == "darwin" ]]; then
    archive="tectonic-${VERSION}-${rust_arch}-apple-darwin.tar.gz"
  elif [[ "$platform_dir" == "linux" ]]; then
    archive="tectonic-${VERSION}-${rust_arch}-unknown-linux-musl.tar.gz"
  else
    archive="tectonic-${VERSION}-${rust_arch}-pc-windows-msvc.zip"
  fi

  download_one "$platform_dir" "$arch_dir" "$archive" "$binary_name"
}

if [[ "$DOWNLOAD_ALL" -eq 1 ]]; then
  download_all_platforms
else
  download_host_platform
fi
