import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";
import { parse, type Font } from "opentype.js";

import {
  LAYOUT,
  MARK,
  PALETTE,
  TILE_THEME,
  TYPOGRAPHY,
  WORDMARK,
  type CssHex,
  type Theme,
} from "./brand.ts";

export type Picture =
  | { readonly kind: "mark"; readonly theme: Theme }
  | { readonly kind: "lockup"; readonly theme: Theme }
  | { readonly kind: "app-icon" }
  | { readonly kind: "avatar" }
  | { readonly kind: "og" };

export type IcoSize = 16 | 32 | 48;

export type Format =
  | { readonly kind: "svg" }
  | { readonly kind: "png"; readonly height: number }
  | { readonly kind: "ico"; readonly sizes: readonly IcoSize[] };

export type Artwork = {
  readonly render: (picture: Picture, format: Format) => Uint8Array;
};

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

type WordmarkOutline = {
  readonly d: string;
  readonly unitsPerEm: number;
  readonly capHeight: number;
  readonly ink: Box;
};

type Scene = {
  readonly viewBox: Box;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly body: string;
};

const RASTER = { font: { loadSystemFonts: false } } satisfies ResvgRenderOptions;
const textEncoder = new TextEncoder();

export function loadArtwork(wordmarkFont: Uint8Array): Artwork {
  const font = parse(copyBuffer(wordmarkFont));
  assertWordmarkFont(font);
  const wordmark = outlineWordmark(font);
  const ink = measureMarkInk();
  return {
    render(picture, format) {
      return encode(compose(picture, wordmark, ink), format);
    },
  };
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function englishName(font: Font, key: string): string | undefined {
  if (!isRecord(font.names)) return undefined;
  const record = font.names[key];
  if (!isRecord(record)) return undefined;
  const en = record["en"];
  return typeof en === "string" ? en : undefined;
}

function os2Number(font: Font, key: string): number | undefined {
  const table = font.tables["os2"];
  if (!isRecord(table)) return undefined;
  const value = table[key];
  return typeof value === "number" ? value : undefined;
}

function assertWordmarkFont(font: Font): void {
  // Name ID 1 on this file is "Geist Mono Medium". Name ID 16 is the family.
  const family = englishName(font, "preferredFamily");
  if (family !== WORDMARK.family) {
    throw new Error(`wordmark font name ID 16 is ${family ?? "missing"}`);
  }
  const weight = os2Number(font, "usWeightClass");
  if (weight !== WORDMARK.weight) {
    throw new Error(`wordmark font usWeightClass is ${weight ?? "missing"}`);
  }
  for (const char of WORDMARK.text) {
    if (font.charToGlyph(char).name === ".notdef") {
      throw new Error(`wordmark font has no glyph for ${JSON.stringify(char)}`);
    }
  }
}

function outlineWordmark(font: Font): WordmarkOutline {
  const size = font.unitsPerEm;
  const path = font.getPath(WORDMARK.text, 0, 0, size, { kerning: true });
  const bounds = path.getBoundingBox();
  const capHeight = os2Number(font, "sCapHeight");
  if (capHeight === undefined || capHeight <= 0) {
    throw new Error("wordmark font has no sCapHeight");
  }
  return {
    d: path.toPathData(2),
    unitsPerEm: size,
    capHeight,
    ink: {
      x: bounds.x1,
      y: bounds.y1,
      width: bounds.x2 - bounds.x1,
      height: bounds.y2 - bounds.y1,
    },
  };
}

function measureMarkInk(): Box {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MARK.size}" height="${MARK.size}" ` +
    `viewBox="0 0 ${MARK.size} ${MARK.size}">${markIn("dark")}</svg>`;
  // getBBox includes the stroke. innerBBox does not match this mark.
  const box = new Resvg(svg, RASTER).getBBox();
  if (box === undefined) throw new Error("mark has no bounding box");
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function compose(picture: Picture, wordmark: WordmarkOutline, ink: Box): Scene {
  switch (picture.kind) {
    case "mark":
      return squareScene(markIn(picture.theme));
    case "app-icon":
      return squareScene(tileIn(TILE_THEME) + markIn(TILE_THEME));
    case "avatar":
      return avatarScene();
    case "lockup":
      return lockupScene(picture.theme, wordmark, ink);
    case "og":
      return ogScene(wordmark, ink);
    default: {
      const _exhaustive: never = picture;
      throw new Error(`unexpected picture ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function squareScene(body: string): Scene {
  return {
    viewBox: { x: 0, y: 0, width: MARK.size, height: MARK.size },
    widthPx: MARK.size,
    heightPx: MARK.size,
    body,
  };
}

function avatarScene(): Scene {
  const pad = LAYOUT.avatarPad;
  const side = MARK.size + pad * 2;
  const origin = -pad;
  return {
    viewBox: { x: origin, y: origin, width: side, height: side },
    widthPx: side,
    heightPx: side,
    body:
      `<rect x="${formatNum(origin)}" y="${formatNum(origin)}" width="${formatNum(side)}" height="${formatNum(side)}" fill="${PALETTE[TILE_THEME].bg}"/>` +
      markIn(TILE_THEME),
  };
}

function lockupScene(theme: Theme, wordmark: WordmarkOutline, ink: Box): Scene {
  const layout = lockupLayout(theme, wordmark, ink);
  const em = LAYOUT.lockup.intrinsicEmPx;
  return {
    viewBox: layout.box,
    widthPx: (layout.box.width / wordmark.unitsPerEm) * em,
    heightPx: (layout.box.height / wordmark.unitsPerEm) * em,
    body: layout.body,
  };
}

function ogScene(wordmark: WordmarkOutline, ink: Box): Scene {
  const layout = lockupLayout(TILE_THEME, wordmark, ink);
  const width = LAYOUT.og.width;
  const height = LAYOUT.og.height;
  const scale = (width * LAYOUT.og.lockupWidthRatio) / layout.box.width;
  const centerX = layout.box.x + layout.box.width / 2;
  const centerY = layout.box.y + layout.box.height / 2;
  const translateX = width / 2 - centerX * scale;
  const translateY = height / 2 - centerY * scale;
  return {
    viewBox: { x: 0, y: 0, width, height },
    widthPx: width,
    heightPx: height,
    body:
      `<rect width="${width}" height="${height}" fill="${PALETTE[TILE_THEME].bg}"/>` +
      `<g transform="translate(${formatNum(translateX)} ${formatNum(translateY)}) scale(${formatNum(scale)})">${layout.body}</g>`,
  };
}

function markIn(theme: Theme): string {
  return MARK.body.replaceAll("ACCENT", PALETTE[theme].accent);
}

function tileIn(theme: Theme): string {
  return MARK.tile.replaceAll("TILE", PALETTE[theme].bg);
}

function lockupLayout(
  theme: Theme,
  wordmark: WordmarkOutline,
  ink: Box,
): { readonly body: string; readonly box: Box } {
  const scale = (LAYOUT.lockup.markInkPerCap * wordmark.capHeight) / ink.height;
  const translateX = -scale * ink.x;
  const translateY = -scale * (ink.y + ink.height);
  const markWidth = ink.width * scale;
  const textX = markWidth + LAYOUT.lockup.gapEm * wordmark.unitsPerEm;
  const markHeight = LAYOUT.lockup.markInkPerCap * wordmark.capHeight;
  const body =
    `<g transform="translate(${formatNum(translateX)} ${formatNum(translateY)}) scale(${formatNum(scale)})">${markIn(theme)}</g>` +
    `<path transform="translate(${formatNum(textX)} 0)" d="${wordmark.d}" ${paint(PALETTE[theme][TYPOGRAPHY.wordmark.role])}/>`;
  const union = unionBox(
    { x: 0, y: -markHeight, width: markWidth, height: markHeight },
    {
      x: wordmark.ink.x + textX,
      y: wordmark.ink.y,
      width: wordmark.ink.width,
      height: wordmark.ink.height,
    },
  );
  const margin = LAYOUT.lockup.marginEm * wordmark.unitsPerEm;
  return {
    body,
    box: {
      x: union.x - margin,
      y: union.y - margin,
      width: union.width + margin * 2,
      height: union.height + margin * 2,
    },
  };
}

function unionBox(left: Box, right: Box): Box {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: maxX - x, height: maxY - y };
}

function paint(color: CssHex): string {
  if (color.length === 7) return `fill="${color}"`;
  if (color.length === 9) {
    const alpha = Number.parseInt(color.slice(7), 16) / 255;
    return `fill="${color.slice(0, 7)}" fill-opacity="${alpha.toFixed(4)}"`;
  }
  throw new Error(`bad color ${color}`);
}

function formatNum(value: number): string {
  const trimmed = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "-0" ? "0" : trimmed;
}

function encode(scene: Scene, format: Format): Uint8Array {
  const svg = toSvg(scene);
  switch (format.kind) {
    case "svg":
      return textEncoder.encode(svg);
    case "png":
      return rasterize(svg, format.height);
    case "ico":
      return packIco(format.sizes.map((size) => ({ size, png: rasterize(svg, size) })));
    default: {
      const _exhaustive: never = format;
      throw new Error(`unexpected format ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function toSvg(scene: Scene): string {
  const box = scene.viewBox;
  const viewBox = `${formatNum(box.x)} ${formatNum(box.y)} ${formatNum(box.width)} ${formatNum(box.height)}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${formatNum(scene.widthPx)}" ` +
    `height="${formatNum(scene.heightPx)}" role="img" aria-label="${WORDMARK.text}">${scene.body}</svg>\n`
  );
}

function rasterize(svg: string, height: number): Uint8Array {
  return new Resvg(svg, { ...RASTER, fitTo: { mode: "height", value: height } }).render().asPng();
}

function packIco(images: readonly { readonly size: IcoSize; readonly png: Uint8Array }[]): Uint8Array {
  const headerBytes = 6 + 16 * images.length;
  let payloadBytes = 0;
  for (const image of images) payloadBytes += image.png.byteLength;
  const out = new Uint8Array(headerBytes + payloadBytes);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);
  let offset = headerBytes;
  for (const [index, image] of images.entries()) {
    const entry = 6 + index * 16;
    view.setUint8(entry, image.size);
    view.setUint8(entry + 1, image.size);
    view.setUint8(entry + 2, 0);
    view.setUint8(entry + 3, 0);
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, image.png.byteLength, true);
    view.setUint32(entry + 12, offset, true);
    out.set(image.png, offset);
    offset += image.png.byteLength;
  }
  return out;
}
