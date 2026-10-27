---
name: render-brand
description: Regenerate the koborin-ai brand files from src/ and fonts/. Trigger after an edit under src/ or fonts/, or when the user says "render brand assets", "regenerate PNGs", or "rebuild brand".
---

# render-brand

`node --run build` writes the brand files from `src/` and `fonts/`.

## When to invoke

- After an edit under `src/` or `fonts/`
- When the user says "render brand assets", "regenerate PNGs", or "rebuild brand"

## How to use

From the repository root, run:

```sh
node --run build
```

Check the tree without writing:

```sh
node --run check
```

## Output

The generator owns these directories. A file placed in one of them by hand is deleted on the next build.

- `mark/`
- `lockup/`
- `icon/`
- `avatar/`
- `ogp/`
- `preview/`

`archive/` and `process/` are not generated.
