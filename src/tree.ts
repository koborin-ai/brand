import { LAYOUT, PALETTE, THEMES, TILE_THEME, TYPOGRAPHY, type Role, type Theme } from "./brand.ts";
import {
  loadArtwork,
  type Format,
  type IcoSize,
  type Picture,
} from "./artwork.ts";

export type Family = "mark" | "lockup" | "icon" | "avatar" | "ogp" | "preview";
export type PublicPath = `${Family}/${string}`;
export type DocFile = "README.md" | "CLAUDE.md";
export type RepoPath = PublicPath | DocFile;

export type Inputs = {
  readonly wordmarkFont: Uint8Array;
  readonly docs: Readonly<Record<DocFile, string>>;
};

export type DesiredTree = {
  readonly files: ReadonlyMap<RepoPath, Uint8Array>;
  readonly owned: readonly Family[];
};

type ArtworkFile = { readonly path: PublicPath; readonly picture: Picture; readonly format: Format };
type Region = "hero" | "palette" | "typography" | "assets";

const SVG: Format = { kind: "svg" };
const png = (height: number): Format => ({ kind: "png", height });
const APP_ICON: Picture = { kind: "app-icon" };
const AVATAR: Picture = { kind: "avatar" };
const OG: Picture = { kind: "og" };
const ROLES: readonly Role[] = ["bg", "fg", "accent", "muted"];
const textEncoder = new TextEncoder();

const ARTWORK: readonly ArtworkFile[] = [
  { path: "mark/mark-dark.svg", picture: { kind: "mark", theme: "dark" }, format: SVG },
  { path: "mark/mark-dark-512.png", picture: { kind: "mark", theme: "dark" }, format: png(512) },
  { path: "mark/mark-light.svg", picture: { kind: "mark", theme: "light" }, format: SVG },
  { path: "mark/mark-light-512.png", picture: { kind: "mark", theme: "light" }, format: png(512) },
  { path: "lockup/lockup-dark.svg", picture: { kind: "lockup", theme: "dark" }, format: SVG },
  { path: "lockup/lockup-dark-256.png", picture: { kind: "lockup", theme: "dark" }, format: png(256) },
  { path: "lockup/lockup-light.svg", picture: { kind: "lockup", theme: "light" }, format: SVG },
  { path: "lockup/lockup-light-256.png", picture: { kind: "lockup", theme: "light" }, format: png(256) },
  { path: "icon/favicon.svg", picture: APP_ICON, format: SVG },
  { path: "icon/favicon.ico", picture: APP_ICON, format: { kind: "ico", sizes: [16, 32, 48] } },
  { path: "icon/apple-touch-icon.png", picture: APP_ICON, format: png(180) },
  { path: "icon/icon-512.png", picture: APP_ICON, format: png(512) },
  { path: "avatar/avatar-1024.png", picture: AVATAR, format: png(1024) },
  { path: "ogp/default.png", picture: OG, format: png(LAYOUT.og.height) },
];

const DOC_REGIONS: Record<DocFile, readonly Region[]> = {
  "README.md": ["hero", "palette", "typography", "assets"],
  "CLAUDE.md": ["palette", "typography", "assets"],
};

const DOC_FILES = ["README.md", "CLAUDE.md"] as const satisfies readonly DocFile[];

export function plan(inputs: Inputs): DesiredTree {
  const art = loadArtwork(inputs.wordmarkFont);
  const files = new Map<RepoPath, Uint8Array>();
  for (const file of ARTWORK) files.set(file.path, art.render(file.picture, file.format));
  files.set("preview/index.html", textEncoder.encode(previewHtml()));
  for (const doc of DOC_FILES) files.set(doc, textEncoder.encode(spliceRegions(doc, inputs.docs[doc])));
  return { files, owned: ownedFamilies(files) };
}

function ownedFamilies(files: ReadonlyMap<RepoPath, Uint8Array>): readonly Family[] {
  const owned: Family[] = [];
  for (const filePath of files.keys()) {
    if (!isPublicPath(filePath)) continue;
    const family = familyOf(filePath);
    if (!owned.includes(family)) owned.push(family);
  }
  return owned;
}

function isFamily(value: string): value is Family {
  switch (value) {
    case "mark":
    case "lockup":
    case "icon":
    case "avatar":
    case "ogp":
    case "preview":
      return true;
    default:
      return false;
  }
}

export function isPublicPath(value: string): value is PublicPath {
  const slash = value.indexOf("/");
  return slash > 0 && slash < value.length - 1 && isFamily(value.slice(0, slash));
}

function familyOf(filePath: PublicPath): Family {
  const head = filePath.slice(0, filePath.indexOf("/"));
  if (!isFamily(head)) throw new Error(`unknown family ${head}`);
  return head;
}

type Marker = {
  readonly kind: "open" | "close";
  readonly region: string;
  readonly index: number;
  readonly length: number;
};

function findMarkers(text: string): readonly Marker[] {
  const markers: Marker[] = [];
  for (const match of text.matchAll(/<!-- (\/?)brand:([a-z]+) -->/g)) {
    const slash = match[1];
    const region = match[2];
    const index = match.index;
    if (slash === undefined || region === undefined || index === undefined) continue;
    markers.push({
      kind: slash === "/" ? "close" : "open",
      region,
      index,
      length: match[0].length,
    });
  }
  return markers;
}

function isRegion(value: string): value is Region {
  switch (value) {
    case "hero":
    case "palette":
    case "typography":
    case "assets":
      return true;
    default:
      return false;
  }
}

function isDocRegion(doc: DocFile, value: string): value is Region {
  return isRegion(value) && DOC_REGIONS[doc].includes(value);
}

function spliceRegions(doc: DocFile, text: string): string {
  const open = new Map<Region, Marker>();
  const close = new Map<Region, Marker>();
  for (const marker of findMarkers(text)) {
    if (!isDocRegion(doc, marker.region)) throw new Error(`${doc}: unknown brand:${marker.region}`);
    const bucket = marker.kind === "open" ? open : close;
    if (bucket.has(marker.region)) throw new Error(`${doc}: duplicate brand:${marker.region}`);
    bucket.set(marker.region, marker);
  }
  const spans: { readonly region: Region; readonly start: number; readonly end: number }[] = [];
  for (const region of DOC_REGIONS[doc]) {
    const openMarker = open.get(region);
    const closeMarker = close.get(region);
    if (openMarker === undefined || closeMarker === undefined || closeMarker.index < openMarker.index) {
      throw new Error(`${doc}: missing brand:${region}`);
    }
    spans.push({ region, start: openMarker.index + openMarker.length, end: closeMarker.index });
  }
  spans.sort((a, b) => b.start - a.start);
  let result = text;
  for (const span of spans) {
    result = result.slice(0, span.start) + `\n${renderRegion(span.region)}\n` + result.slice(span.end);
  }
  return result;
}

function renderRegion(region: Region): string {
  switch (region) {
    case "hero":
      return hero();
    case "palette":
      return palette();
    case "typography":
      return typography();
    case "assets":
      return assets();
    default: {
      const _exhaustive: never = region;
      throw new Error(`unexpected region ${String(_exhaustive)}`);
    }
  }
}

function hero(): string {
  const dark = "lockup/lockup-dark-256.png";
  const light = "lockup/lockup-light-256.png";
  if (!ARTWORK.some((file) => file.path === dark) || !ARTWORK.some((file) => file.path === light)) {
    throw new Error("missing lockup 256 artwork");
  }
  return [
    "<picture>",
    `<source media="(prefers-color-scheme: dark)" srcset="${dark}">`,
    `<img src="${light}" alt="koborin.ai" width="480">`,
    "</picture>",
  ].join("\n");
}

function themeLabel(theme: Theme): string {
  switch (theme) {
    case "dark":
      return "Dark";
    case "light":
      return "Light";
    default: {
      const _exhaustive: never = theme;
      return _exhaustive;
    }
  }
}

function palette(): string {
  const header = `| Role | ${THEMES.map((theme) => themeLabel(theme)).join(" | ")} |`;
  const rule = `| --- | ${THEMES.map(() => "---").join(" | ")} |`;
  const rows = ROLES.map((role) => {
    const cells = THEMES.map((theme) => `\`${PALETTE[theme][role]}\``);
    return `| ${role} | ${cells.join(" | ")} |`;
  });
  const note = [
    "The mark uses the accent color.",
    `The wordmark uses the ${TYPOGRAPHY.wordmark.role} color.`,
    `The tile uses the ${TILE_THEME} theme.`,
  ].join(" ");
  return [header, rule, ...rows, "", note].join("\n");
}

function typography(): string {
  const faces = {
    body: TYPOGRAPHY.body,
    wordmark: TYPOGRAPHY.wordmark,
    japanese: TYPOGRAPHY.japanese,
  } satisfies typeof TYPOGRAPHY;
  const rows = [
    faceRow("body", faces.body),
    faceRow("wordmark", faces.wordmark),
    faceRow("japanese", faces.japanese),
  ];
  const notes = `The wordmark is ${faces.wordmark.sizePx} px. It uses the ${faces.wordmark.role} role.`;
  return ["| Face | Family | Weights | Stack |", "| --- | --- | --- | --- |", ...rows, "", notes].join("\n");
}

function faceRow(name: string, face: (typeof TYPOGRAPHY)[keyof typeof TYPOGRAPHY]): string {
  return `| ${name} | ${face.family} | ${face.weights.join(", ")} | \`${face.stack.join(", ")}\` |`;
}

function assets(): string {
  const groups: { readonly family: Family; readonly files: ArtworkFile[] }[] = [];
  for (const file of ARTWORK) {
    const family = familyOf(file.path);
    const current = groups.at(-1);
    if (current === undefined || current.family !== family) groups.push({ family, files: [file] });
    else current.files.push(file);
  }
  return groups
    .map((group) => {
      const rows = group.files.map(
        (file) => `| \`${file.path}\` | ${describe(file.picture)} | ${sizeOf(file)} |`,
      );
      return [`### \`${group.family}\``, "", "| Path | Picture | Size |", "| --- | --- | --- |", ...rows].join("\n");
    })
    .join("\n\n");
}

function describe(picture: Picture): string {
  switch (picture.kind) {
    case "mark":
      return `mark, for ${picture.theme} surfaces`;
    case "lockup":
      return `lockup, for ${picture.theme} surfaces`;
    case "app-icon":
      return "app icon, dark tile";
    case "avatar":
      return "avatar, dark square";
    case "og":
      return "Open Graph image, dark";
    default: {
      const _exhaustive: never = picture;
      throw new Error(`unexpected picture ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function sizeOf(file: ArtworkFile): string {
  const format = file.format;
  switch (format.kind) {
    case "svg":
      return "SVG";
    case "png":
      return pngSize(file.picture, format.height);
    case "ico":
      return `${joinAnd(format.sizes.map(String))} px`;
    default: {
      const _exhaustive: never = format;
      throw new Error(`unexpected format ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function pngSize(picture: Picture, height: number): string {
  switch (picture.kind) {
    case "mark":
    case "app-icon":
    case "avatar":
      return `${height} px square`;
    case "lockup":
      return `${height} px high`;
    case "og":
      return `${LAYOUT.og.width} by ${LAYOUT.og.height} px`;
    default: {
      const _exhaustive: never = picture;
      throw new Error(`unexpected picture ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function joinAnd(items: readonly string[]): string {
  const last = items[items.length - 1];
  if (last === undefined) return "";
  if (items.length === 1) return last;
  return `${items.slice(0, -1).join(", ")}, and ${last}`;
}

function previewHtml(): string {
  const dark: ArtworkFile[] = [];
  const light: ArtworkFile[] = [];
  for (const file of ARTWORK) (onDarkGround(file.picture) ? dark : light).push(file);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>koborin.ai</title>
<link rel="icon" href="../icon/favicon.svg">
<style>
${previewCss()}
</style>
</head>
<body>
<main>
<h1>koborin.ai</h1>
${band("dark", dark)}
${band("light", light)}
</main>
</body>
</html>
`;
}

function onDarkGround(picture: Picture): boolean {
  switch (picture.kind) {
    case "mark":
    case "lockup":
      return picture.theme === "dark";
    case "app-icon":
    case "avatar":
    case "og":
      // The tile is opaque and dark. A light surround keeps the rounded corners visible.
      return false;
    default: {
      const _exhaustive: never = picture;
      throw new Error(`unexpected picture ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function cssFamily(stack: readonly string[]): string {
  return stack.map((name) => (name.includes(" ") ? `"${name}"` : name)).join(", ");
}

function previewCss(): string {
  const body = cssFamily(TYPOGRAPHY.body.stack);
  const mono = cssFamily(TYPOGRAPHY.wordmark.stack);
  return `* { box-sizing: border-box; }
body { margin: 0; background: ${PALETTE.dark.bg}; color: ${PALETTE.dark.fg}; font: 14px/1.45 ${body}; }
main { padding: 28px 32px 40px; display: grid; gap: 20px; }
h1, h2 { font-weight: 500; margin: 0; }
h1 { font-size: 15px; }
h2 { font-size: 12px; }
section { display: grid; gap: 12px; padding: 16px; }
.light { background: ${PALETTE.light.bg}; color: ${PALETTE.light.fg}; }
.row, .swatches { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; }
figure { margin: 0; display: flex; flex-wrap: wrap; align-items: end; gap: 8px 10px; }
figcaption { flex-basis: 100%; }
figcaption { font: 11px/1.3 ${mono}; }
.dark figcaption { color: ${PALETTE.dark.muted}; }
.light figcaption { color: ${PALETTE.light.muted}; }
.swatch { display: grid; grid-template-columns: 28px auto; gap: 8px; align-items: center; font: 11px/1.3 ${mono}; }
.chip { width: 28px; height: 28px; display: block; box-shadow: inset 0 0 0 1px currentColor; }
img { display: block; }
img.scale { height: 96px; width: auto; }
img.lockup { height: 72px; width: auto; }
img.avatar { height: 140px; width: auto; }
img.og { width: min(100%, 760px); height: auto; }`;
}

function band(theme: Theme, files: readonly ArtworkFile[]): string {
  return `<section class="${theme}">
<h2>${themeLabel(theme)}</h2>
${swatches(theme)}
<div class="row">
${files.map((file) => figure(file)).join("\n")}
</div>
</section>`;
}

function swatches(theme: Theme): string {
  const chips = ROLES.map((role) => {
    const hex = PALETTE[theme][role];
    return `<div class="swatch"><span class="chip" style="background:${hex}"></span><span>${role} ${hex}</span></div>`;
  });
  return `<div class="swatches">${chips.join("")}</div>`;
}

function figure(file: ArtworkFile): string {
  const src = `../${file.path}`;
  if (file.path === "icon/favicon.svg") {
    const sizes = faviconSizes();
    const images = sizes
      .map((size) => `<img src="${src}" alt="${file.path} at ${size}" width="${size}" height="${size}">`)
      .join("\n");
    return `<figure>
${images}
<figcaption>${file.path} at ${joinAnd(sizes.map(String))}</figcaption>
</figure>`;
  }
  const largest = file.format.kind === "ico" ? file.format.sizes[file.format.sizes.length - 1] : undefined;
  if (largest !== undefined) {
    return `<figure>
<img src="${src}" alt="${file.path}" width="${largest}" height="${largest}">
<figcaption>${file.path}</figcaption>
</figure>`;
  }
  const cls = imgClass(file.picture);
  return `<figure>
<img class="${cls}" src="${src}" alt="${file.path}">
<figcaption>${file.path}</figcaption>
</figure>`;
}

function faviconSizes(): readonly IcoSize[] {
  for (const file of ARTWORK) {
    if (file.path === "icon/favicon.ico" && file.format.kind === "ico") return file.format.sizes;
  }
  throw new Error("missing icon/favicon.ico");
}

function imgClass(picture: Picture): string {
  switch (picture.kind) {
    case "mark":
    case "app-icon":
      return "scale";
    case "lockup":
      return "lockup";
    case "avatar":
      return "avatar";
    case "og":
      return "og";
    default: {
      const _exhaustive: never = picture;
      throw new Error(`unexpected picture ${JSON.stringify(_exhaustive)}`);
    }
  }
}
