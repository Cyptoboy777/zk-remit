#!/usr/bin/env bash
# Installs the official Midnight Compact compiler (compactc) from GitHub releases.
# Default 0.31.1 = the toolchain in Midnight's compatibility matrix for Preview/Preprod/Mainnet
# (runtime 0.16.0, ledger 8). Pass another version (e.g. 0.35.0) to test forward-compat.
set -euo pipefail
VER="${1:-0.31.1}"
DEST="${COMPACTC_HOME:-$HOME/.local/compactc-$VER}"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) PLAT=x86_64-unknown-linux-musl ;;
  Linux-aarch64) PLAT=aarch64-unknown-linux-musl ;;
  Darwin-arm64) PLAT=aarch64-darwin ;;
  Darwin-x86_64) PLAT=x86_64-darwin ;;
  *) echo "unsupported platform"; exit 1 ;;
esac
mkdir -p "$DEST"
curl -fsSL -o "$DEST/compactc.zip" "https://github.com/midnightntwrk/compact/releases/download/compactc-v$VER/compactc_v${VER}_${PLAT}.zip"
# unzip is missing on some build images (e.g. Vercel); fall back to Python, which drops the exec bit.
if command -v unzip >/dev/null 2>&1; then
  (cd "$DEST" && unzip -o -q compactc.zip && rm compactc.zip)
else
  (cd "$DEST" && python3 -c "import zipfile; zipfile.ZipFile('compactc.zip').extractall('.')" && rm compactc.zip)
fi
chmod +x "$DEST/compactc"
"$DEST/compactc" --version
echo "Add to PATH: export PATH=\"$DEST:\$PATH\""
