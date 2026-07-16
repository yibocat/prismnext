#!/usr/bin/env bash
set -euo pipefail

# Download the *pinned* OpenCode binary for the current platform into
# bin/opencode/<platform>-<arch>/ for local dev and electron-builder packaging.
#
# This is a developer / CI tool — not a user-facing install path.
# Users get OpenCode only as the binary bundled inside the Prism app.
#
# Usage:
#   ./scripts/download-opencode.sh              # pin from scripts/opencode-version.txt
#   ./scripts/download-opencode.sh v1.18.2      # explicit tag (override pin)
#   ./scripts/download-opencode.sh --allow-latest latest   # emergency only
#
# Pin file: scripts/opencode-version.txt (committed; bump deliberately).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIN_FILE="$SCRIPT_DIR/opencode-version.txt"
BINARIES_DIR="$SCRIPT_DIR/../bin/opencode"
ALLOW_LATEST=0
VERSION_ARG=""

usage() {
  cat <<'EOF'
Usage: ./scripts/download-opencode.sh [version]
       ./scripts/download-opencode.sh --allow-latest latest

Default version is the pin in scripts/opencode-version.txt (not GitHub latest).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
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
  echo "Refusing to download 'latest' — Prism pins OpenCode for ACP compatibility." >&2
  echo "  Use the pin:  ./scripts/download-opencode.sh" >&2
  echo "  Or a tag:     ./scripts/download-opencode.sh v1.18.2" >&2
  echo "  Emergency:    ./scripts/download-opencode.sh --allow-latest latest" >&2
  exit 1
fi

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    PLATFORM="darwin"
    ;;
  Linux)
    PLATFORM="linux"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    PLATFORM="windows"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  arm64|aarch64)
    ARCH="arm64"
    ;;
  x86_64|amd64)
    ARCH="x64"
    ;;
  *)
    echo "Unsupported arch: $ARCH"
    exit 1
    ;;
esac

TARGET_DIR="$BINARIES_DIR/$PLATFORM-$ARCH"
mkdir -p "$TARGET_DIR"

BINARY_NAME="opencode"
if [ "$PLATFORM" = "windows" ]; then
  BINARY_NAME="opencode.exe"
fi

echo "Downloading OpenCode ${VERSION} for ${PLATFORM}/${ARCH}..."
echo "  (pin file: $PIN_FILE)"

# GitHub releases URL for OpenCode (anomalyco/opencode)
REPO_URL="https://github.com/anomalyco/opencode/releases"
if [ "$VERSION" = "latest" ]; then
  DOWNLOAD_URL="${REPO_URL}/latest/download"
else
  DOWNLOAD_URL="${REPO_URL}/download/${VERSION}"
fi

# Determine file extension: macOS and Windows use .zip, Linux uses .tar.gz
if [ "$PLATFORM" = "linux" ]; then
  ARCHIVE_NAME="opencode-${PLATFORM}-${ARCH}.tar.gz"
  ARCHIVE_TYPE="tar"
else
  ARCHIVE_NAME="opencode-${PLATFORM}-${ARCH}.zip"
  ARCHIVE_TYPE="zip"
fi

FULL_URL="${DOWNLOAD_URL}/${ARCHIVE_NAME}"
echo "Downloading: $FULL_URL"

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

if curl -fsSL "$FULL_URL" -o "$TEMP_DIR/archive"; then
  if [ "$ARCHIVE_TYPE" = "zip" ]; then
    unzip -o "$TEMP_DIR/archive" -d "$TEMP_DIR/extracted" >/dev/null 2>&1
  else
    mkdir -p "$TEMP_DIR/extracted"
    tar -xzf "$TEMP_DIR/archive" -C "$TEMP_DIR/extracted" 2>/dev/null || true
  fi
  # Find the binary in extracted files
  BINARY_PATH=$(find "$TEMP_DIR/extracted" -name "opencode" -type f 2>/dev/null | head -1)
  if [ -z "$BINARY_PATH" ]; then
    # Maybe the download IS the binary directly
    BINARY_PATH="$TEMP_DIR/archive"
  fi
  cp "$BINARY_PATH" "$TARGET_DIR/$BINARY_NAME"
  chmod +x "$TARGET_DIR/$BINARY_NAME"
  # Sidecar for local inspection (bin/opencode is gitignored)
  printf '%s\n' "$VERSION" > "$TARGET_DIR/VERSION"
  echo "✅ OpenCode ${VERSION} installed to $TARGET_DIR/$BINARY_NAME"
  if [[ "$VERSION" != "latest" && -x "$TARGET_DIR/$BINARY_NAME" ]]; then
    ACTUAL="$("$TARGET_DIR/$BINARY_NAME" --version 2>/dev/null | head -1 | tr -d '[:space:]' || true)"
    EXPECT="${VERSION#v}"
    if [[ -n "$ACTUAL" && "$ACTUAL" != "$EXPECT" && "v${ACTUAL}" != "$VERSION" ]]; then
      echo "⚠️  Binary reports --version '$ACTUAL' (expected '$EXPECT'). Check the release asset." >&2
    fi
  fi
else
  echo "⚠️  Failed to download OpenCode binary automatically."
  echo "URL: $FULL_URL"
  echo ""
  echo "Please manually download the OpenCode binary from:"
  echo "  ${REPO_URL}"
  echo ""
  echo "And place it at: $TARGET_DIR/$BINARY_NAME"
  exit 1
fi
