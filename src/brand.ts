export type Theme = "dark" | "light";
export const THEMES: readonly Theme[] = ["dark", "light"];

export type Role = "bg" | "fg" | "accent" | "muted";
/** `#rrggbb`, or `#rrggbbaa` when the color carries alpha. */
export type CssHex = `#${string}`;

export const PALETTE = {
  dark: { bg: "#0b0d12", fg: "#eceae5", accent: "#d5dae1", muted: "#eceae56b" },
  light: { bg: "#faf9f6", fg: "#16161a", accent: "#4a5260", muted: "#16161a73" },
} as const satisfies Record<Theme, Record<Role, CssHex>>;

export const TILE_THEME = "dark" satisfies Theme;

type Face = {
  readonly family: string;
  readonly weights: readonly number[];
  readonly stack: readonly string[];
  readonly sizePx?: number;
  readonly role?: Role;
};

export const TYPOGRAPHY = {
  body: { family: "Geist", weights: [400], stack: ["Geist", "Noto Sans JP", "sans-serif"] },
  wordmark: {
    family: "Geist Mono",
    weights: [500],
    stack: ["Geist Mono", "Noto Sans JP", "ui-monospace", "monospace"],
    sizePx: 13,
    role: "muted",
  },
  japanese: { family: "Noto Sans JP", weights: [400, 500], stack: ["Noto Sans JP"] },
} as const satisfies Record<string, Face>;

export const WORDMARK = {
  text: "koborin.ai",
  family: TYPOGRAPHY.wordmark.family,
  weight: TYPOGRAPHY.wordmark.weights[0],
  fontFile: "fonts/geist-mono/GeistMono-Medium.ttf",
} as const;

export const MARK = {
  size: 32,
  body:
    '<path d="M8 15 A5 5 0 0 1 18 15 V24" fill="none" stroke="ACCENT" stroke-width="4" stroke-linecap="butt"/>' +
    '<rect x="6" y="18" width="4" height="10" fill="ACCENT"/>' +
    '<rect x="21.5" y="19" width="5" height="5" fill="ACCENT"/>',
  tile: '<rect width="32" height="32" rx="6" fill="TILE"/>',
} as const;

export const LAYOUT = {
  lockup: {
    markInkPerCap: 1,
    gapEm: 0.5,
    marginEm: 0.25,
    intrinsicEmPx: 32,
  },
  avatarPad: 4,
  og: { width: 1200, height: 630, lockupWidthRatio: 0.6 },
} as const;
