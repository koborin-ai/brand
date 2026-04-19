---
name: render-brand
description: Regenerate icon and lockup PNG variants from SVG masters in this brand repo. Trigger on "render brand assets", "regenerate PNGs", "rebuild brand", or after editing any SVG under icon/ or lockup/.
---

# render-brand

Regenerates all icon and lockup PNG variants from the SVG masters.

## When to invoke

- After editing any SVG under `icon/` or `lockup/`
- When the user says "render brand", "regenerate PNGs", or similar

## How to use

Run from the brand repo root:

```bash
bash .claude/skills/render-brand/scripts/render-icons.sh
bash .claude/skills/render-brand/scripts/render-lockups.sh
```

Both scripts auto-detect the repo root from their own location, so cwd doesn't matter as long as the skill is installed inside the repo.

## Requirements

- `rsvg-convert` (`brew install librsvg`) — used for icon PNGs (respects SVG viewBox)
- `magick` (`brew install imagemagick`) — used to crop / fill bg in lockup PNGs
- Google Chrome at `/Applications/Google Chrome.app` — used for lockup PNGs (loads Google Fonts via @import)

## Output

- `icon/png/{transparent,on-dark,on-light}/{16..1024}.png` (14 PNGs)
- `lockup/{pixel,modern}/png/{transparent,on-dark,on-light}/{stacked,horizontal}@{1,2,4}x.png` (36 PNGs)

## Notes

- Don't use ImageMagick for the icon SVG itself — it ignores viewBox
- Lockup SVGs require font-size in **user units** (e.g. `32`, not `32px`) so that text scales together with the icon
- The scripts wipe the target PNG dirs before regenerating, so manual edits inside `png/` are lost on rerun
