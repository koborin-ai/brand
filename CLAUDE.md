# CLAUDE.md

Context for `koborin-ai/brand` — the visual identity Single Source of Truth.

## Philosophy

`koborin-ai` is a personal org rooted in cycles of *hypothesize → verify → return*. Reading, music, and warm baths keep the loop steady; the self is a single trembling light moving through it. Spinning the loop together with cherished people and AI makes life richer.

## Symbol meaning

The icon is a single picture of the cycle.

- **8 nodes** = steady inputs that fuel each turn of *hypothesize → verify → return* (code, music, reading, baths, dialogue, the people who share them)
- **1 gold node** = the self mid-cycle — the present moment of the loop, the only part that pulses

## Colors

- Primary: `#7fb4ca` crystalBlue
- Bg: `#181616` (dark) / `#f5f1e8` (light)
- Accent: `#c4b28a` gold (on dark) / `#a8703a` copper (on light)
- Text: `#c5c9c5` (on dark) / `#2a3a4a` (on light)

## Typography

- A primary: **Pixelify Sans** — face, hero, OG, avatar
- B secondary: **Geist Sans** — body, UI, formal contexts
- When in doubt, choose B.

## Voice

Quiet, honest, with retro/gadget playfulness. Co-creative — show work in progress, make the loop visible. Write outward-facing copy in English; single-character kanji (巡 / 環 / 還) used sparingly as accent.

## Asset structure

- `icon/{*.svg, png/{transparent,on-dark,on-light}/{16..1024}.png}`
- `lockup/{pixel,modern}/{layout}{,-on-dark,-on-light}.svg` + `png/{transparent,on-dark,on-light}/{stacked,horizontal}@{1,2,4}x.png`

## Render

Use the `render-brand` skill (in `.claude/skills/`) to regenerate PNGs.
