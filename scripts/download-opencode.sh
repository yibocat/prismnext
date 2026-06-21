#!/usr/bin/env bash
set -euo pipefail

# Download OpenCode binary for the current platform.
# Usage: ./scripts/download-opencode.sh [version]
# Default: latest release

VERSION="${1:-latest}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARIES_DIR="$SCRIPT_DIR/../bin/opencode"

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
  echo "✅ OpenCode binary installed to $TARGET_DIR/$BINARY_NAME"
else
  echo "⚠️  Failed to download OpenCode binary automatically."
  echo "URL: $DOWNLOAD_URL"
  echo ""
  echo "Please manually download the OpenCode binary from:"
  echo "  ${REPO_URL}"
  echo ""
  echo "And place it at: $TARGET_DIR/$BINARY_NAME"
  exit 1
fi
