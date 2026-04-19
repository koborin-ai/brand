#!/usr/bin/env bash
# Generate all icon PNG variants from SVG masters.
# Requires: rsvg-convert (brew install librsvg)

set -euo pipefail

# Skill lives at <repo>/.claude/skills/render-brand/scripts/, so the repo root is 4 levels up.
BRAND="$(cd "$(dirname "$0")/../../../.." && pwd)"
[ -d "$BRAND/icon" ] || { echo "ERROR: $BRAND is not a brand repo (no icon/ dir)" >&2; exit 1; }

if ! command -v rsvg-convert >/dev/null; then
  echo "ERROR: rsvg-convert not found. Run: brew install librsvg" >&2
  exit 1
fi

rm -f $BRAND/icon/png/transparent/*.png \
      $BRAND/icon/png/on-dark/*.png \
      $BRAND/icon/png/on-light/*.png

for size in 16 32 64 128 256 512 1024; do
  rsvg-convert -w $size -h $size $BRAND/icon/icon.svg \
    -o $BRAND/icon/png/transparent/${size}.png
done

for size in 128 256 512 1024; do
  rsvg-convert -w $size -h $size $BRAND/icon/icon-on-dark.svg \
    -o $BRAND/icon/png/on-dark/${size}.png
done

for size in 256 512 1024; do
  rsvg-convert -w $size -h $size $BRAND/icon/icon-on-light.svg \
    -o $BRAND/icon/png/on-light/${size}.png
done

echo "Icon PNGs generated:"
find $BRAND/icon/png -name '*.png' | sort
