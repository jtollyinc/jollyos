#!/usr/bin/env bash
# scripts/package-release.sh — build one ready-to-run release zip.
# ─────────────────────────────────────────────────────────────────────────────
# Usage: scripts/package-release.sh <target> [version] [options]
#   <target>    windows-x64 | macos-arm64 | macos-x64 | linux-x64
#   [version]   0.1.0 or v0.1.0; default GITHUB_REF_NAME, else package.json
#   --out DIR   where the zip lands (default ./dist)
#   --no-build  reuse the existing .next build
#   --rebuild   always run `npm run build` first
#
# The zip is what someone with nothing installed double-clicks: the prebuilt
# Next.js standalone server plus the official Node 22 runtime for that OS
# (downloaded from nodejs.org and checksum-verified against SHASUMS256.txt).
# No npm, no compiler and no Docker ever runs on the user's machine.
#
# Every target can be built from Linux — only the bundled runtime differs, so
# the four zips carry an identical app payload (see the native-module check
# below). Needs: bash, curl, tar, unzip, zip, sha256sum (or shasum).
set -euo pipefail

TARGET="${1:-}"
shift || true

VERSION=""
OUT_DIR="${OUT_DIR:-dist}"
BUILD_MODE="auto" # auto | never | always
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT_DIR="${2:?--out needs a directory}"; shift 2 ;;
    --no-build) BUILD_MODE="never"; shift ;;
    --rebuild) BUILD_MODE="always"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) VERSION="$1"; shift ;;
  esac
done

# The Node runtime that ships inside every zip. Bump deliberately: it is the
# only thing the user "installs", and it is what the smoke tests exercise.
NODE_VERSION="${JOLLYOS_NODE_VERSION:-22.23.4}"
NODE_DIST="${JOLLYOS_NODE_DIST:-https://nodejs.org/dist}"
CACHE_DIR="${JOLLYOS_NODE_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/jollyos-node}"

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

die() { echo "package-release: $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

case "$TARGET" in
  windows-x64) NODE_ARCHIVE="node-v${NODE_VERSION}-win-x64.zip" ;;
  macos-arm64) NODE_ARCHIVE="node-v${NODE_VERSION}-darwin-arm64.tar.gz" ;;
  macos-x64)   NODE_ARCHIVE="node-v${NODE_VERSION}-darwin-x64.tar.gz" ;;
  linux-x64)   NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz" ;;
  "") die "usage: scripts/package-release.sh <windows-x64|macos-arm64|macos-x64|linux-x64> [version]" ;;
  *) die "unknown target '$TARGET' (windows-x64, macos-arm64, macos-x64, linux-x64)" ;;
esac

for tool in curl tar zip unzip; do
  command -v "$tool" >/dev/null || die "need '$tool' on PATH (Debian/Ubuntu: sudo apt-get install $tool)"
done
if command -v sha256sum >/dev/null; then SHA256="sha256sum"
elif command -v shasum >/dev/null; then SHA256="shasum -a 256"
else die "need sha256sum or shasum"; fi

if [ -z "$VERSION" ]; then
  VERSION="${GITHUB_REF_NAME:-}"
  case "$VERSION" in v[0-9]*) ;; *) VERSION=""; esac
fi
if [ -z "$VERSION" ]; then
  VERSION="$(node -p "require('./package.json').version")"
fi
VERSION="${VERSION#v}"
[ -n "$VERSION" ] || die "could not work out a version"

ZIP_NAME="jollyos-${VERSION}-${TARGET}.zip"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

# ── 1. The production build ──────────────────────────────────────────────────
if [ "$BUILD_MODE" = "always" ] || { [ "$BUILD_MODE" = "auto" ] && [ ! -f .next/standalone/server.js ]; }; then
  step "npm run build"
  npm run build
else
  step "reusing the existing build in .next/standalone"
  [ -f .next/standalone/server.js ] || die ".next/standalone/server.js is missing — drop --no-build"
fi

STAGE="$(mktemp -d -t jollyos-release-XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
ROOT="$STAGE/JollyOS" # the one top-level folder inside the zip
APP="$ROOT/app"
mkdir -p "$APP" "$ROOT/runtime"

# ── 2. The app payload: an allowlist, so no source, test or dev file sneaks in ─
step "staging the app payload"
cp .next/standalone/server.js "$APP/server.js"
cp .next/standalone/package.json "$APP/package.json"
cp -R .next/standalone/.next "$APP/.next"
cp -R .next/standalone/node_modules "$APP/node_modules"
cp -R .next/static "$APP/.next/static"
cp -R public "$APP/public"
mkdir -p "$APP/demo"
cp -R demo/samples "$APP/demo/samples" # read from disk by "Try with sample data"
# The password reset CLI, the way the Dockerfile ships it: the script plus the
# three files it imports (READ ME FIRST.txt quotes the command).
mkdir -p "$APP/scripts" "$APP/lib/auth"
cp scripts/reset-owner.mjs "$APP/scripts/reset-owner.mjs"
cp lib/auth/rules.ts lib/auth/password.ts "$APP/lib/auth/"
cp lib/data-dir.ts "$APP/lib/data-dir.ts"
cp scripts/launcher/launch.mjs "$APP/launcher.mjs"

# ── 3. Platform-specific modules ─────────────────────────────────────────────
# sharp is Next's optional image optimiser and the ONLY native dependency the
# standalone output pulls in. Nothing in the app imports next/image, so it is
# never loaded; dropping it keeps the payload identical on all four targets.
# If next/image ever appears, this stops the release instead of shipping a zip
# that fails on three OSes out of four.
step "checking for native modules"
if grep -rqsE "from [\"']next/(legacy/)?image[\"']|require\\([\"']next/(legacy/)?image[\"']\\)" app components modules lib; then
  die "next/image is now used, so sharp must be bundled per target (see scripts/package-release.sh)"
fi
rm -rf "$APP/node_modules/sharp" "$APP/node_modules/@img" \
       "$APP/node_modules/@emnapi" "$APP/node_modules/detect-libc" "$APP/node_modules/semver"
LEFTOVER_NATIVE="$(find "$APP" -type f \( -name '*.node' -o -name '*.dll' -o -name '*.dylib' -o -name '*.so' -o -name '*.so.*' \) -print)"
[ -z "$LEFTOVER_NATIVE" ] || die "platform-specific binaries in the payload, handle them per target:
$LEFTOVER_NATIVE"

# ── 4. Nothing private, nothing dev-only ─────────────────────────────────────
step "checking the payload"
STRAY="$(find "$ROOT" \( -name '.env' -o -name '.env.*' -o -name '.git' -o -name 'data' \
  -o -name 'tests' -o -name '*.tsbuildinfo' -o -name 'Dockerfile' -o -name 'docker-compose.yml' \
  -o -name 'CLAUDE.md' -o -name '*.log' \) -print)"
[ -z "$STRAY" ] || die "these must not be in a release zip:
$STRAY"

# ── 5. The launcher the user double-clicks, plus the plain-text instructions ──
step "adding the launcher"
cp LICENSE "$ROOT/LICENSE.txt"
case "$TARGET" in
  windows-x64)
    # CRLF so Notepad and the cmd parser both behave.
    sed 's/$/\r/' 'scripts/launcher/Start JollyOS.cmd' > "$ROOT/Start JollyOS.cmd"
    sed 's/$/\r/' scripts/launcher/READ-ME-FIRST.windows.txt > "$ROOT/READ ME FIRST.txt"
    ;;
  macos-*)
    cp 'scripts/launcher/Start JollyOS.command' "$ROOT/Start JollyOS.command"
    chmod 755 "$ROOT/Start JollyOS.command"
    cp scripts/launcher/READ-ME-FIRST.macos.txt "$ROOT/READ ME FIRST.txt"
    ;;
  linux-x64)
    cp scripts/launcher/start-jollyos.sh "$ROOT/start-jollyos.sh"
    chmod 755 "$ROOT/start-jollyos.sh"
    cp scripts/launcher/READ-ME-FIRST.linux.txt "$ROOT/READ ME FIRST.txt"
    ;;
esac

# ── 6. The official Node runtime, checksum-verified ──────────────────────────
step "bundling Node v${NODE_VERSION} for ${TARGET}"
mkdir -p "$CACHE_DIR/v$NODE_VERSION"
ARCHIVE_PATH="$CACHE_DIR/v$NODE_VERSION/$NODE_ARCHIVE"
SHASUMS_PATH="$CACHE_DIR/v$NODE_VERSION/SHASUMS256.txt"
[ -s "$SHASUMS_PATH" ] || curl -fsSL --retry 3 "$NODE_DIST/v$NODE_VERSION/SHASUMS256.txt" -o "$SHASUMS_PATH"
[ -s "$ARCHIVE_PATH" ] || curl -fL --retry 3 "$NODE_DIST/v$NODE_VERSION/$NODE_ARCHIVE" -o "$ARCHIVE_PATH"

EXPECTED="$(awk -v f="$NODE_ARCHIVE" '$2 == f || $2 == "./"f {print $1}' "$SHASUMS_PATH")"
[ -n "$EXPECTED" ] || die "$NODE_ARCHIVE is not listed in SHASUMS256.txt for v$NODE_VERSION"
ACTUAL="$($SHA256 "$ARCHIVE_PATH" | awk '{print $1}')"
if [ "$EXPECTED" != "$ACTUAL" ]; then
  rm -f "$ARCHIVE_PATH"
  die "checksum mismatch for $NODE_ARCHIVE (expected $EXPECTED, got $ACTUAL) — the cached copy was deleted, run again"
fi
echo "   checksum ok: $NODE_ARCHIVE"

NODE_UNPACK="$STAGE/node"
mkdir -p "$NODE_UNPACK"
case "$NODE_ARCHIVE" in
  *.zip) unzip -q "$ARCHIVE_PATH" -d "$NODE_UNPACK" ;;
  *) tar -xf "$ARCHIVE_PATH" -C "$NODE_UNPACK" ;;
esac
NODE_HOME="$NODE_UNPACK/$(ls "$NODE_UNPACK")"

# Only the runtime itself: no npm, no headers, no docs. Plus Node's licence.
if [ "$TARGET" = "windows-x64" ]; then
  cp "$NODE_HOME/node.exe" "$ROOT/runtime/node.exe"
else
  mkdir -p "$ROOT/runtime/bin"
  cp "$NODE_HOME/bin/node" "$ROOT/runtime/bin/node"
  chmod 755 "$ROOT/runtime/bin/node"
fi
cp "$NODE_HOME/LICENSE" "$ROOT/runtime/LICENSE-nodejs.txt"
printf 'Node.js v%s for %s, from %s/v%s/%s\nSHA-256 %s (verified against SHASUMS256.txt at package time).\n' \
  "$NODE_VERSION" "$TARGET" "$NODE_DIST" "$NODE_VERSION" "$NODE_ARCHIVE" "$EXPECTED" \
  > "$ROOT/runtime/README-nodejs.txt"

# ── 7. The zip ───────────────────────────────────────────────────────────────
step "writing $OUT_DIR/$ZIP_NAME"
rm -f "$OUT_DIR/$ZIP_NAME"
( cd "$STAGE" && zip -q -r -X "$OUT_DIR/$ZIP_NAME" JollyOS )
( cd "$OUT_DIR" && $SHA256 "$ZIP_NAME" > "$ZIP_NAME.sha256" )

if [ "$TARGET" != "windows-x64" ]; then
  LAUNCHER="$(cd "$ROOT" && ls | grep -E '^(Start JollyOS\.command|start-jollyos\.sh)$')"
  unzip -Z "$OUT_DIR/$ZIP_NAME" "JollyOS/$LAUNCHER" "JollyOS/runtime/bin/node" | grep -q '^-rwx' \
    || die "the executable bit did not survive zipping"
fi

printf '\n%s (%s)\n' "$OUT_DIR/$ZIP_NAME" "$(du -h "$OUT_DIR/$ZIP_NAME" | cut -f1)"
