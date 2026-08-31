#!/usr/bin/env bash
set -euo pipefail

# Download pinned Tinymist binaries into bin/tinymist/<platform>-<arch>/ for
# dev + packaging. Keep all release platforms locally, then electron-builder
# copies the matching folder per target (see electron-builder.yml).
#
# Usage:
#   ./scripts/download-tinymist.sh --all          # all platforms (recommended before dist)
#   ./scripts/download-tinymist.sh                # host platform only (CI per-OS job)
#   ./scripts/download-tinymist.sh 0.15.2 --all
#
# Pin file: scripts/tinymist-version.txt
# Digests: GitHub release *.sha256 assets for v0.15.2
#
# Manual download from browser? macOS may block the binary (Gatekeeper). After placing
# the file, run:  xattr -dr com.apple.quarantine bin/tinymist/darwin-arm64/tinymist

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIN_FILE="$SCRIPT_DIR/tinymist-version.txt"
BINARIES_DIR="$SCRIPT_DIR/../bin/tinymist"

DOWNLOAD_ALL=0
VERSION_ARG=""

usage() {
  cat <<'EOF'
Usage: ./scripts/download-tinymist.sh [--all] [version]

  --all   Download darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64
  version Override pin in scripts/tinymist-version.txt
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

BASE_URL="https://github.com/Myriad-Dreamin/tinymist/releases/download/v${VERSION}"

# sha256 from GitHub release v0.15.2 *.sha256 assets. Unknown version: skip verify.
expected_sha() {
  local archive="$1"
  case "$archive" in
    tinymist-aarch64-apple-darwin.tar.gz) echo "16241868c6752aa5e8f9c162562293c7cdf69e82f54687d7886336daf2c51915" ;;
    tinymist-x86_64-apple-darwin.tar.gz) echo "fcfcfd01376394048443f81de349d165c271c17c36579eb9a08b889b30b8c3b2" ;;
    tinymist-x86_64-unknown-linux-musl.tar.gz) echo "46ff973fbc89c89714e7b03488498404da0a517d4686e3f6f870b978c91d5f84" ;;
    tinymist-aarch64-unknown-linux-musl.tar.gz) echo "bfa7e93af0c0761206d810ac4781b0dd17b09fbbba6a26bea8f1b0756fa5132a" ;;
    tinymist-x86_64-pc-windows-msvc.zip) echo "91edb0d21edca5841b896d702d8086622792d52b71a9b444d8befb0e937969ae" ;;
    *) echo "" ;;
  esac
}

file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# platform_dir arch_dir archive_name binary_name
download_one() {
  local platform_dir="$1"
  local arch_dir="$2"
  local archive="$3"
  local binary_name="$4"

  local target_dir="$BINARIES_DIR/$platform_dir-$arch_dir"
  mkdir -p "$target_dir"

  local full_url="${BASE_URL}/${archive}"
  echo "Downloading Tinymist ${VERSION} → ${platform_dir}-${arch_dir}..."
  echo "  ${full_url}"

  local temp_dir
  temp_dir="$(mktemp -d)"

  if ! curl -fsSL --http1.1 --retry 3 --retry-delay 2 "$full_url" -o "$temp_dir/archive"; then
    rm -rf "$temp_dir"
    echo "Failed to download: $full_url" >&2
    return 1
  fi

  local want
  want="$(expected_sha "$archive")"
  if [[ -n "$want" ]]; then
    local got
    got="$(file_sha256 "$temp_dir/archive")"
    if [[ "$got" != "$want" ]]; then
      rm -rf "$temp_dir"
      echo "Checksum mismatch for $archive" >&2
      echo "  expected $want" >&2
      echo "  actual   $got" >&2
      return 1
    fi
  fi

  mkdir -p "$temp_dir/extracted"
  if [[ "$archive" == *.zip ]]; then
    unzip -o "$temp_dir/archive" -d "$temp_dir/extracted" >/dev/null
  else
    tar -xzf "$temp_dir/archive" -C "$temp_dir/extracted"
  fi

  local binary_path
  binary_path="$(find "$temp_dir/extracted" \( -name 'tinymist' -o -name 'tinymist.exe' \) -type f | head -1)"
  if [[ -z "$binary_path" ]]; then
    rm -rf "$temp_dir"
    echo "Could not find tinymist binary in $archive" >&2
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
  echo "Fetching Tinymist ${VERSION} for all release platforms (pin: $PIN_FILE)"
  download_one darwin arm64 "tinymist-aarch64-apple-darwin.tar.gz" tinymist
  download_one darwin x64 "tinymist-x86_64-apple-darwin.tar.gz" tinymist
  download_one linux x64 "tinymist-x86_64-unknown-linux-musl.tar.gz" tinymist
  download_one linux arm64 "tinymist-aarch64-unknown-linux-musl.tar.gz" tinymist
  download_one windows x64 "tinymist-x86_64-pc-windows-msvc.zip" tinymist.exe
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

  binary_name="tinymist"
  if [[ "$platform_dir" == "windows" ]]; then
    binary_name="tinymist.exe"
  fi

  if [[ "$platform_dir" == "darwin" ]]; then
    archive="tinymist-${rust_arch}-apple-darwin.tar.gz"
  elif [[ "$platform_dir" == "linux" ]]; then
    archive="tinymist-${rust_arch}-unknown-linux-musl.tar.gz"
  else
    archive="tinymist-${rust_arch}-pc-windows-msvc.zip"
  fi

  download_one "$platform_dir" "$arch_dir" "$archive" "$binary_name"
}

if [[ "$DOWNLOAD_ALL" -eq 1 ]]; then
  download_all_platforms
else
  download_host_platform
fi
