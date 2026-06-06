#!/usr/bin/env bash
#
# Mirrors the shipping extension files into the Safari Xcode project's
# Resources directory. The Xcode project references files from there via
# relative paths, so this has to run whenever a runtime file changes
# (manifest, background, content scripts, popup build output, icons).
#
# Usage: scripts/sync-safari.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/safari/WordPress Browser Extension/WordPress Browser Extension Extension/Resources"

if [ ! -d "$DEST" ]; then
  echo "Safari Xcode project not found at: $DEST" >&2
  echo "Re-generate it with: xcrun safari-web-extension-converter (see SAFARI.md)" >&2
  exit 1
fi

# Wipe sub-folders so deletes in source propagate; top-level files are
# overwritten below so the DEST listing matches source exactly.
rm -rf "$DEST/lib" "$DEST/popup" "$DEST/dist" "$DEST/icons"
mkdir -p "$DEST/lib" "$DEST/popup" "$DEST/dist" "$DEST/icons"

cp "$ROOT/manifest.json" "$DEST/"
cp "$ROOT/background.js" "$DEST/"
cp "$ROOT/content.js"    "$DEST/"

cp "$ROOT/lib/early.js"            "$DEST/lib/"
cp "$ROOT/lib/detect.js"           "$DEST/lib/"
cp "$ROOT/lib/rest.js"             "$DEST/lib/"
cp "$ROOT/lib/host.js"             "$DEST/lib/"
cp "$ROOT/lib/block-inspector.js"  "$DEST/lib/"

cp "$ROOT/popup/popup.html" "$DEST/popup/"

cp "$ROOT/dist/popup.css" "$DEST/dist/"
cp "$ROOT/dist/popup.js"  "$DEST/dist/"

# Safari Web Extensions template-render toolbar icons — Safari ignores
# the icon's own colors and paints the alpha shape with the system tint.
# The colored icons in icons/*.png are designed for Chrome, where full
# color is preserved; the silhouette versions in icons/template/*.png
# are what Safari's tinting expects.
cp "$ROOT/icons/template"/*.png "$DEST/icons/"

echo "Synced runtime files → $DEST"
