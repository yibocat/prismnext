#!/usr/bin/env bash
set -euo pipefail

# Download the *pinned* OpenCode binary into bin/opencode/<platform>-<arch>/
# for local dev and electron-builder packaging.
#
# This is a developer / CI tool — not a user-facing install path.
# Users get OpenCode only as the binary bundled inside prismnext
# (see electron-builder.yml mac/win/linux extraResources → resources/opencode/).
#
# Usage:
#   ./scripts/download-opencode.sh              # host platform (pin file)
#   ./scripts/download-opencode.sh --all        # darwin-arm64, linux-x64, windows-x64
#   ./scripts/download-opencode.sh v1.18.2      # explicit tag (override pin)
#   ./scripts/download-opencode.sh --allow-latest latest   # emergency only
#
# Pin file: scripts/opencode-version.txt (committed; bump deliberately).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIN_FILE="$SCRIPT_DIR/opencode-version.txt"
BINARIES_DIR="$SCRIPT_DIR/../bin/opencode"
ALLOW_LATEST=0
DOWNLOAD_ALL=0
VERSION_ARG=""

usage() {
  cat <<'EOF'
Usage: ./scripts/download-opencode.sh [--all] [version]
       ./scripts/download-opencode.sh --allow-latest latest

  --all   Download darwin-arm64, linux-x64, windows-x64 (needed to package Windows from macOS)

Default version is the pin in scripts/opencode-version.txt (not GitHub latest).
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
    --allow-latest)
      ALLOW_LATEST=1
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
  # First non-empty, non-comment line
  local line
  line="$(grep -v '^[[:space:]]*#' "$PIN_FILE" | grep -v '^[[:space:]]*$' | head -1 | tr -d '[:space:]')"
  if [[ -z "$line" ]]; then
    echo "Pin file has no version: $PIN_FILE" >&2
    exit 1
  fi
  echo "$line"
}

normalize_tag() {
  local v="$1"
  if [[ "$v" == "latest" ]]; then
    echo "latest"
    return
  fi
  # GitHub release tags use a leading v
  if [[ "$v" =~ ^[0-9] ]]; then
    echo "v${v}"
  else
    echo "$v"
  fi
}

if [[ -n "$VERSION_ARG" ]]; then
  VERSION="$(normalize_tag "$VERSION_ARG")"
else
  VERSION="$(normalize_tag "$(read_pin)")"
fi

if [[ "$VERSION" == "latest" && "$ALLOW_LATEST" -ne 1 ]]; then
  echo "Refusing to download 'latest' — PrismNext pins OpenCode for ACP compatibility." >&2
  echo "  Use the pin:  ./scripts/download-opencode.sh" >&2
  echo "  Or a tag:     ./scripts/download-opencode.sh v1.18.2" >&2
  echo "  Emergency:    ./scripts/download-opencode.sh --allow-latest latest" >&2
  exit 1
fi

REPO_URL="https://github.com/anomalyco/opencode/releases"
if [ "$VERSION" = "latest" ]; then
  DOWNLOAD_URL="${REPO_URL}/latest/download"
else
  DOWNLOAD_URL="${REPO_URL}/download/${VERSION}"
fi

file_magic() {
  od -An -tx1 -N4 "$1" | tr -d ' \n'
}

# Zip-as-exe is the Windows `spawn UNKNOWN` failure: find used to miss
# opencode.exe and copy the .zip onto that name.
assert_real_binary() {
  local path="$1"
  local dest_name="$2"
  local magic
  magic="$(file_magic "$path")"
  if [[ "$magic" == 504b* ]]; then
    echo "Refusing to install a zip as $dest_name (that causes Windows spawn UNKNOWN)." >&2
    return 1
  fi
  if [[ "$dest_name" == *.exe && "$magic" != 4d5a* ]]; then
    echo "Windows OpenCode binary is not a PE executable (missing MZ header): $path" >&2
    return 1
  fi
}

download_one() {
  local platform="$1"
  local arch="$2"
  local binary_name="opencode"
  if [[ "$platform" == "windows" ]]; then
    binary_name="opencode.exe"
  fi

  local archive_name archive_type
  if [[ "$platform" == "linux" ]]; then
    archive_name="opencode-${platform}-${arch}.tar.gz"
    archive_type="tar"
  else
    archive_name="opencode-${platform}-${arch}.zip"
    archive_type="zip"
  fi

  local target_dir="$BINARIES_DIR/${platform}-${arch}"
  mkdir -p "$target_dir"

  local full_url="${DOWNLOAD_URL}/${archive_name}"
  echo "Downloading OpenCode ${VERSION} for ${platform}/${arch}..."
  echo "  $full_url"

  local temp_dir
  temp_dir="$(mktemp -d)"

  if ! curl -fsSL --retry 3 --retry-delay 2 "$full_url" -o "$temp_dir/archive"; then
    rm -rf "$temp_dir"
    echo "Failed to download: $full_url" >&2
    echo "Place ${binary_name} at: $target_dir/$binary_name" >&2
    return 1
  fi

  mkdir -p "$temp_dir/extracted"
  if [[ "$archive_type" == "zip" ]]; then
    unzip -o "$temp_dir/archive" -d "$temp_dir/extracted" >/dev/null
  else
    tar -xzf "$temp_dir/archive" -C "$temp_dir/extracted"
  fi

  local binary_path
  binary_path="$(find "$temp_dir/extracted" \( -name 'opencode' -o -name 'opencode.exe' \) -type f | head -1)"
  if [[ -z "$binary_path" ]]; then
    rm -rf "$temp_dir"
    echo "Could not find opencode or opencode.exe in $archive_name" >&2
    return 1
  fi

  if ! assert_real_binary "$binary_path" "$binary_name"; then
    rm -rf "$temp_dir"
    return 1
  fi

  cp "$binary_path" "$target_dir/$binary_name"
  chmod +x "$target_dir/$binary_name"
  printf '%s\n' "$VERSION" > "$target_dir/VERSION"
  rm -rf "$temp_dir"
  echo "Installed → $target_dir/$binary_name"

  if [[ "$VERSION" != "latest" && -x "$target_dir/$binary_name" ]]; then
    local actual expect
    actual="$("$target_dir/$binary_name" --version 2>/dev/null | head -1 | tr -d '[:space:]' || true)"
    expect="${VERSION#v}"
    if [[ -n "$actual" && "$actual" != "$expect" && "v${actual}" != "$VERSION" ]]; then
      echo "⚠️  Binary reports --version '$actual' (expected '$expect'). Check the release asset." >&2
    fi
  fi
}

download_host_platform() {
  local os arch platform arch_dir
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) platform="darwin" ;;
    Linux) platform="linux" ;;
    MINGW*|MSYS*|CYGWIN*) platform="windows" ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    arm64|aarch64) arch_dir="arm64" ;;
    x86_64|amd64) arch_dir="x64" ;;
    *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
  esac

  echo "  (pin file: $PIN_FILE)"
  download_one "$platform" "$arch_dir"
}

if [[ "$DOWNLOAD_ALL" -eq 1 ]]; then
  echo "Fetching OpenCode ${VERSION} for all release platforms (pin: $PIN_FILE)"
  download_one darwin arm64
  download_one linux x64
  download_one windows x64
  echo "All platforms installed under $BINARIES_DIR"
else
  download_host_platform
fi
