#!/usr/bin/env bash
# Generate all lockup PNG variants from SVG masters.
# Uses Chrome headless to render Google Fonts (@import), then ImageMagick to crop body margin.
# Requires: Google Chrome at /Applications/Google Chrome.app, ImageMagick (magick)

set -euo pipefail

# Skill lives at <repo>/.claude/skills/render-brand/scripts/, so the repo root is 4 levels up.
BRAND="$(cd "$(dirname "$0")/../../../.." && pwd)"
[ -d "$BRAND/lockup" ] || { echo "ERROR: $BRAND is not a brand repo (no lockup/ dir)" >&2; exit 1; }
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "ERROR: Chrome not found at $CHROME" >&2
  exit 1
fi

if ! command -v magick >/dev/null; then
  echo "ERROR: ImageMagick (magick) not found. Run: brew install imagemagick" >&2
  exit 1
fi

rm -f $BRAND/lockup/pixel/png/transparent/*.png \
      $BRAND/lockup/pixel/png/on-dark/*.png \
      $BRAND/lockup/pixel/png/on-light/*.png \
      $BRAND/lockup/modern/png/transparent/*.png \
      $BRAND/lockup/modern/png/on-dark/*.png \
      $BRAND/lockup/modern/png/on-light/*.png

render() {
  local svg=$1
  local w=$2
  local h=$3
  local out=$4
  local bg=$5  # "none" for transparent, or hex like "#181616"
  local tmp="/tmp/render-$$-$(basename "$out").svg"

  sed -E "/<svg/ {s/width=\"[0-9]+\"/width=\"$w\"/; s/height=\"[0-9]+\"/height=\"$h\"/;}" "$svg" > "$tmp"

  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --window-size=$((w+16)),$((h+16)) --force-device-scale-factor=1 \
    --default-background-color=00000000 --virtual-time-budget=15000 \
    --screenshot="$out" "file://$tmp" 2>/dev/null

  # crop body margin offset, then enforce canvas size with bg fill
  # (Chrome SVG render sometimes leaves white edges; -extent fills with intended bg color)
  magick "$out" -crop ${w}x${h}+8+8 +repage \
    -background "$bg" -extent ${w}x${h} "$out" 2>/dev/null
  rm "$tmp"
}

# stacked viewBox 240x240 → 1x=480 / 2x=960 / 4x=1920
# horizontal viewBox 260x60 → 1x=520x120 / 2x=1040x240 / 4x=2080x480

for v in pixel modern; do
  for variant in transparent on-dark on-light; do
    case $variant in
      transparent) svg_suffix=""; bg="none" ;;
      on-dark)     svg_suffix="-on-dark"; bg="#181616" ;;
      on-light)    svg_suffix="-on-light"; bg="#f5f1e8" ;;
    esac

    src_stacked=$BRAND/lockup/${v}/stacked${svg_suffix}.svg
    src_horizontal=$BRAND/lockup/${v}/horizontal${svg_suffix}.svg
    dst_dir=$BRAND/lockup/${v}/png/${variant}

    render "$src_stacked" 480 480 "$dst_dir/stacked@1x.png" "$bg"
    render "$src_stacked" 960 960 "$dst_dir/stacked@2x.png" "$bg"
    render "$src_stacked" 1920 1920 "$dst_dir/stacked@4x.png" "$bg"

    render "$src_horizontal" 520 120 "$dst_dir/horizontal@1x.png" "$bg"
    render "$src_horizontal" 1040 240 "$dst_dir/horizontal@2x.png" "$bg"
    render "$src_horizontal" 2080 480 "$dst_dir/horizontal@4x.png" "$bg"
  done
done

echo "Lockup PNGs generated:"
find $BRAND/lockup -name '*.png' | sort
