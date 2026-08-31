#!/bin/sh
# Install Node, portable Git, Tectonic, and Tinymist into ~/.prismnext-host/current.
# Runs on the Linux server. The laptop only pushes this script + pin files.
set -eu

ARCH=""
CURRENT=""
HOST_ROOT=""
STEP="all"
PRINT_PLAN=0

usage() {
  echo "usage: install-runtime [--current DIR] [--host-root DIR] [--arch x64|arm64] [--step node|git|tectonic|tinymist|all] [--print-plan]" >&2
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

pin_get() {
  file="$1"
  key="$2"
  [ -f "$file" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      \#*|"" ) continue ;;
    esac
    k=${line%% *}
    v=${line#* }
    if [ "$k" = "$key" ]; then
      printf '%s\n' "$v"
      return 0
    fi
  done < "$file"
  return 1
}

detect_arch() {
  m=$(uname -m 2>/dev/null || true)
  case "$m" in
    x86_64|amd64) echo x64 ;;
    aarch64|arm64) echo arm64 ;;
    *) return 1 ;;
  esac
}

download() {
  url="$1"
  dest="$2"
  echo "downloading $(basename "$dest") (server-side; this can take a few minutes)…"
  if need_cmd curl; then
    # -sS: no meter (stderr meter was drowning the install log). Still fail on HTTP errors.
    curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 30 -o "$dest" "$url"
  elif need_cmd wget; then
    wget -q -O "$dest" "$url"
  else
    echo "install-runtime: need curl or wget to download runtime binaries" >&2
    return 1
  fi
}

file_sha256() {
  if need_cmd sha256sum; then
    sha256sum "$1" | awk '{print $1}'
  elif need_cmd shasum; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "install-runtime: need sha256sum or shasum" >&2
    return 1
  fi
}

verify_sha() {
  file="$1"
  expected="$2"
  actual=$(file_sha256 "$file")
  if [ "$actual" != "$expected" ]; then
    echo "install-runtime: checksum mismatch for $(basename "$file")" >&2
    echo "  expected $expected" >&2
    echo "  actual   $actual" >&2
    rm -f "$file"
    return 1
  fi
}

stamp_get() {
  [ -f "$STAMP" ] || return 1
  pin_get "$STAMP" "$1"
}

stamp_set() {
  key="$1"
  val="$2"
  tmp="$STAMP.tmp"
  : > "$tmp"
  if [ -f "$STAMP" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      k=${line%% *}
      if [ "$k" != "$key" ] && [ -n "$line" ]; then
        printf '%s\n' "$line" >> "$tmp"
      fi
    done < "$STAMP"
  fi
  printf '%s %s\n' "$key" "$val" >> "$tmp"
  mv "$tmp" "$STAMP"
}

cache_ready() {
  path="$1"
  sha="$2"
  [ -f "$path" ] && verify_sha "$path" "$sha"
}

# First bytes as hex. GitHub sometimes serves the Tectonic musl build as a
# raw ELF named *.tar.gz; `tar -xzf` then fails and dest is never written.
file_magic_hex() {
  path="$1"
  bytes="$2"
  dd if="$path" bs=1 count="$bytes" 2>/dev/null | od -An -tx1 | tr -d " \n"
}

is_elf() {
  [ -f "$1" ] && [ "$(file_magic_hex "$1" 4)" = "7f454c46" ]
}

is_gzip() {
  [ -f "$1" ] && [ "$(file_magic_hex "$1" 2)" = "1f8b" ]
}

# Directories are -x on Linux; the laptop sftpStat uses `[ -f ]` and treats
# size 0 as missing. Skip / success must be a non-empty regular file.
bin_ready() {
  [ -f "$1" ] && [ -s "$1" ] && [ -x "$1" ]
}

place_bin() {
  src="$1"
  dest="$2"
  label="$3"
  if [ -d "$dest" ] && [ ! -L "$dest" ]; then
    echo "install-runtime: replacing leftover directory $dest" >&2
    rm -rf "$dest"
  fi
  mkdir -p "$(dirname "$dest")"
  tmp="$dest.part"
  rm -f "$tmp"
  cp "$src" "$tmp"
  chmod 755 "$tmp"
  if ! bin_ready "$tmp"; then
    echo "install-runtime: failed to stage $label at $tmp" >&2
    rm -f "$tmp"
    return 1
  fi
  mv -f "$tmp" "$dest"
  if ! bin_ready "$dest"; then
    echo "install-runtime: failed to place $label at $dest" >&2
    return 1
  fi
}

find_extracted_bin() {
  extract="$1"
  name="$2"
  src=$(find "$extract" -type f -name "$name" 2>/dev/null | sed -n '1p')
  if [ -n "$src" ]; then
    printf '%s\n' "$src"
    return 0
  fi
  find "$extract" -type f 2>/dev/null | while IFS= read -r f; do
    if is_elf "$f"; then
      printf '%s\n' "$f"
      exit 0
    fi
  done
}

install_tectonic_payload() {
  payload="$1"
  dest="$2"
  src=""
  if is_elf "$payload"; then
    src="$payload"
  elif is_gzip "$payload"; then
    extract="$CACHE/extract-tectonic-$ARCH"
    rm -rf "$extract"
    mkdir -p "$extract"
    if ! tar -xzf "$payload" -C "$extract" 2>/dev/null; then
      gzip -dc "$payload" > "$extract/tectonic" || {
        echo "install-runtime: Tectonic archive is not gzip-tar or ELF" >&2
        rm -rf "$extract"
        return 1
      }
    fi
    src=$(find_extracted_bin "$extract" tectonic)
    if [ -z "$src" ]; then
      gzip -dc "$payload" > "$extract/tectonic" 2>/dev/null || true
      src=$(find_extracted_bin "$extract" tectonic)
    fi
    if [ -z "$src" ]; then
      echo "install-runtime: Tectonic archive missing binary" >&2
      rm -rf "$extract"
      return 1
    fi
  else
    echo "install-runtime: Tectonic cache is neither gzip nor ELF: $payload" >&2
    return 1
  fi
  place_bin "$src" "$dest" "Tectonic" || return 1
  rm -rf "$CACHE/extract-tectonic-$ARCH"
}

install_node() {
  ver=$(pin_get "$NODE_PIN" version) || {
    echo "install-runtime: missing Node pin" >&2
    return 1
  }
  archive_tmpl=$(pin_get "$NODE_PIN" archive)
  sha=$(pin_get "$NODE_PIN" "sha256-$ARCH")
  archive=$(printf '%s' "$archive_tmpl" | sed "s/{version}/$ver/g; s/{arch}/$ARCH/g")
  url="https://nodejs.org/dist/v${ver}/${archive}"
  dest_node="$CURRENT/bin/node"

  if [ "$PRINT_PLAN" = 1 ]; then
    echo "node $url $sha"
    return 0
  fi

  if [ -x "$dest_node" ]; then
    got=$("$dest_node" --version 2>/dev/null || true)
    if [ "$got" = "v$ver" ]; then
      stamp_set node "$ver"
      echo "Node $got already installed — skip."
      return 0
    fi
  fi

  mkdir -p "$CACHE" "$CURRENT/bin"
  tar_path="$CACHE/$archive"
  if ! cache_ready "$tar_path" "$sha"; then
    download "$url" "$tar_path"
    verify_sha "$tar_path" "$sha"
  fi

  extract="$CACHE/extract-node-$ARCH"
  rm -rf "$extract"
  mkdir -p "$extract"
  tar -xzf "$tar_path" -C "$extract"
  src=$(find "$extract" -type f -path "*/bin/node" | head -1)
  if [ -z "$src" ]; then
    echo "install-runtime: Node archive missing bin/node" >&2
    return 1
  fi
  cp "$src" "$dest_node"
  chmod 755 "$dest_node"
  rm -rf "$extract"
  stamp_set node "$ver"
  echo "Node $($dest_node --version) ready."
}

install_git() {
  tag=$(pin_get "$GIT_PIN" tag) || {
    echo "install-runtime: missing Git pin" >&2
    return 1
  }
  archive_tmpl=$(pin_get "$GIT_PIN" archive)
  sha=$(pin_get "$GIT_PIN" "sha256-$ARCH")
  archive=$(printf '%s' "$archive_tmpl" | sed "s/{arch}/$ARCH/g")
  url="https://github.com/desktop/dugite-native/releases/download/${tag}/${archive}"
  dest_git="$CURRENT/vendor/git/bin/git"

  if [ "$PRINT_PLAN" = 1 ]; then
    echo "git $url $sha"
    return 0
  fi

  if [ -x "$dest_git" ] && [ "$(stamp_get git || true)" = "$tag" ]; then
    echo "Git $tag already installed — skip."
    return 0
  fi

  mkdir -p "$CACHE"
  tar_path="$CACHE/$archive"
  if ! cache_ready "$tar_path" "$sha"; then
    download "$url" "$tar_path"
    verify_sha "$tar_path" "$sha"
  fi

  extract="$CACHE/extract-git-$ARCH"
  rm -rf "$extract"
  mkdir -p "$extract"
  tar -xzf "$tar_path" -C "$extract"
  found=$(find "$extract" -type f -path "*/bin/git" | head -1)
  if [ -z "$found" ]; then
    echo "install-runtime: Git archive missing bin/git" >&2
    return 1
  fi
  prefix=$(dirname "$(dirname "$found")")
  vendor="$CURRENT/vendor/git"
  rm -rf "$vendor"
  mkdir -p "$(dirname "$vendor")"
  cp -R "$prefix" "$vendor"
  for extra in git-lfs git-credential-manager git-credential-manager-core; do
    rm -f "$vendor/bin/$extra"
  done
  chmod 755 "$vendor/bin/git"
  rm -rf "$extract"
  stamp_set git "$tag"
  echo "Git $tag ready."
}

install_tectonic() {
  ver=$(pin_get "$TEC_PIN" version) || {
    echo "install-runtime: missing Tectonic pin" >&2
    return 1
  }
  triple=$(pin_get "$TEC_PIN" "triple-$ARCH")
  sha=$(pin_get "$TEC_PIN" "sha256-$ARCH")
  archive="tectonic-${ver}-${triple}.tar.gz"
  url="https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${ver}/${archive}"
  dest="$CURRENT/bin/tectonic"

  if [ "$PRINT_PLAN" = 1 ]; then
    echo "tectonic $url $sha"
    return 0
  fi

  if bin_ready "$dest" && [ "$(stamp_get tectonic || true)" = "$ver" ]; then
    echo "Tectonic $ver already installed — skip."
    return 0
  fi

  mkdir -p "$CACHE" "$CURRENT/bin"
  tar_path="$CACHE/$archive"

  if [ -f "$tar_path" ] && is_elf "$tar_path"; then
    install_tectonic_payload "$tar_path" "$dest" || return 1
    stamp_set tectonic "$ver"
    echo "Tectonic $ver ready (cached ELF)."
    return 0
  fi

  if ! cache_ready "$tar_path" "$sha"; then
    download "$url" "$tar_path"
    if is_elf "$tar_path"; then
      :
    else
      verify_sha "$tar_path" "$sha" || return 1
    fi
  fi

  install_tectonic_payload "$tar_path" "$dest" || return 1
  stamp_set tectonic "$ver"
  echo "Tectonic $ver ready."
}

install_tinymist_payload() {
  payload="$1"
  dest="$2"
  src=""
  if is_elf "$payload"; then
    src="$payload"
  elif is_gzip "$payload"; then
    extract="$CACHE/extract-tinymist-$ARCH"
    rm -rf "$extract"
    mkdir -p "$extract"
    if ! tar -xzf "$payload" -C "$extract" 2>/dev/null; then
      gzip -dc "$payload" > "$extract/tinymist" || {
        echo "install-runtime: Tinymist archive is not gzip-tar or ELF" >&2
        rm -rf "$extract"
        return 1
      }
    fi
    src=$(find_extracted_bin "$extract" tinymist)
    if [ -z "$src" ]; then
      gzip -dc "$payload" > "$extract/tinymist" 2>/dev/null || true
      src=$(find_extracted_bin "$extract" tinymist)
    fi
    if [ -z "$src" ]; then
      echo "install-runtime: Tinymist archive missing binary" >&2
      rm -rf "$extract"
      return 1
    fi
  else
    echo "install-runtime: Tinymist cache is neither gzip nor ELF: $payload" >&2
    return 1
  fi
  place_bin "$src" "$dest" "Tinymist" || return 1
  rm -rf "$CACHE/extract-tinymist-$ARCH"
}

install_tinymist() {
  ver=$(pin_get "$TINY_PIN" version) || {
    echo "install-runtime: missing Tinymist pin" >&2
    return 1
  }
  triple=$(pin_get "$TINY_PIN" "triple-$ARCH")
  sha=$(pin_get "$TINY_PIN" "sha256-$ARCH")
  archive="tinymist-${triple}.tar.gz"
  url="https://github.com/Myriad-Dreamin/tinymist/releases/download/v${ver}/${archive}"
  dest="$CURRENT/bin/tinymist"
  cache_name="tinymist-${ver}-${triple}.tar.gz"

  if [ "$PRINT_PLAN" = 1 ]; then
    echo "tinymist $url $sha"
    return 0
  fi

  if bin_ready "$dest" && [ "$(stamp_get tinymist || true)" = "$ver" ]; then
    echo "Tinymist $ver already installed — skip."
    return 0
  fi

  mkdir -p "$CACHE" "$CURRENT/bin"
  tar_path="$CACHE/$cache_name"

  if [ -f "$tar_path" ] && is_elf "$tar_path"; then
    install_tinymist_payload "$tar_path" "$dest" || return 1
    stamp_set tinymist "$ver"
    echo "Tinymist $ver ready (cached ELF)."
    return 0
  fi

  if ! cache_ready "$tar_path" "$sha"; then
    download "$url" "$tar_path"
    if is_elf "$tar_path"; then
      :
    else
      verify_sha "$tar_path" "$sha" || return 1
    fi
  fi

  install_tinymist_payload "$tar_path" "$dest" || return 1
  stamp_set tinymist "$ver"
  echo "Tinymist $ver ready."
}

while [ $# -gt 0 ]; do
  case "$1" in
    --current)
      CURRENT=$2
      shift 2
      ;;
    --host-root)
      HOST_ROOT=$2
      shift 2
      ;;
    --arch)
      ARCH=$2
      shift 2
      ;;
    --step)
      STEP=$2
      shift 2
      ;;
    --print-plan)
      PRINT_PLAN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

if [ -z "$CURRENT" ]; then
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  CURRENT=$(dirname "$SCRIPT_DIR")
fi
CURRENT=$(CDPATH= cd -- "$CURRENT" && pwd)
if [ -z "$HOST_ROOT" ]; then
  HOST_ROOT=$(dirname "$CURRENT")
fi
if [ -z "$ARCH" ]; then
  ARCH=$(detect_arch) || {
    echo "install-runtime: unsupported machine $(uname -m). Need Linux x64 or arm64." >&2
    exit 1
  }
fi
case "$ARCH" in
  x64|arm64) ;;
  *)
    echo "install-runtime: --arch must be x64 or arm64" >&2
    exit 1
    ;;
esac

CACHE="$HOST_ROOT/cache"
# Key/value text (not JSON) so the POSIX installer can rewrite it.
STAMP="$HOST_ROOT/runtime-stamp.txt"
RUNTIME="$CURRENT/runtime"
NODE_PIN="$RUNTIME/node-version.txt"
GIT_PIN="$RUNTIME/git-version.txt"
TEC_PIN="$RUNTIME/tectonic-linux.txt"
TINY_PIN="$RUNTIME/tinymist-linux.txt"

if [ ! -d "$RUNTIME" ]; then
  echo "install-runtime: missing $RUNTIME (Host payload pins)" >&2
  exit 1
fi

run_step() {
  case "$1" in
    node) install_node ;;
    git) install_git ;;
    tectonic) install_tectonic ;;
    tinymist) install_tinymist ;;
    *)
      echo "install-runtime: unknown step $1" >&2
      return 1
      ;;
  esac
}

if [ "$STEP" = "all" ]; then
  run_step node
  run_step git
  run_step tectonic
  run_step tinymist
else
  run_step "$STEP"
fi
