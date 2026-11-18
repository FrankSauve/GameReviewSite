import { PALETTES } from "./theme.js";

/**
 * The tokens the shared images paint with, copied from the [data-palette]
 * blocks in frontend/src/index.css. That file is authoritative;
 * share-image-palettes.test.ts fails when the two drift.
 */
export const IMAGE_TOKENS = [
  "bg",
  "surface",
  "surface-raised",
  "line",
  "text",
  "text-muted",
  "text-subtle",
  "accent-subtle-bg",
  "accent-subtle-text",
  "warning-text",
] as const;

export type ImageToken = (typeof IMAGE_TOKENS)[number];

/** RGB channel triplets, as index.css writes them. */
export type ImagePalette = Record<ImageToken, string>;

export const IMAGE_PALETTES: Record<(typeof PALETTES)[number], ImagePalette> = {
  midnight: {
    bg: "8 12 22",
    surface: "20 25 35",
    "surface-raised": "31 37 48",
    line: "32 38 49",
    text: "243 247 255",
    "text-muted": "178 182 190",
    "text-subtle": "159 163 171",
    "accent-subtle-bg": "43 32 97",
    "accent-subtle-text": "183 181 252",
    "warning-text": "238 177 84",
  },
  ember: {
    bg: "22 8 3",
    surface: "36 20 12",
    "surface-raised": "49 32 24",
    line: "50 34 25",
    text: "254 245 240",
    "text-muted": "189 180 175",
    "text-subtle": "170 161 157",
    "accent-subtle-bg": "77 30 0",
    "accent-subtle-text": "236 174 142",
    "warning-text": "238 177 84",
  },
  phosphor: {
    bg: "4 15 6",
    surface: "15 28 18",
    "surface-raised": "27 41 30",
    line: "28 42 31",
    text: "241 249 243",
    "text-muted": "177 184 178",
    "text-subtle": "158 165 159",
    "accent-subtle-bg": "0 57 9",
    "accent-subtle-text": "153 206 154",
    "warning-text": "238 177 84",
  },
  cobalt: {
    bg: "2 13 26",
    surface: "12 26 40",
    "surface-raised": "24 38 53",
    line: "25 39 54",
    text: "241 248 255",
    "text-muted": "176 183 189",
    "text-subtle": "158 164 170",
    "accent-subtle-bg": "0 52 62",
    "accent-subtle-text": "132 203 220",
    "warning-text": "238 177 84",
  },
  paper: {
    bg: "252 248 245",
    surface: "255 255 255",
    "surface-raised": "245 242 238",
    line: "229 225 222",
    text: "31 27 22",
    "text-muted": "91 86 80",
    "text-subtle": "111 105 99",
    "accent-subtle-bg": "233 233 255",
    "accent-subtle-text": "89 86 142",
    "warning-text": "151 101 4",
  },
  newsprint: {
    bg: "253 248 240",
    surface: "255 255 255",
    "surface-raised": "247 242 234",
    line: "230 225 217",
    text: "31 27 21",
    "text-muted": "90 86 79",
    "text-subtle": "110 106 99",
    "accent-subtle-bg": "255 228 224",
    "accent-subtle-text": "139 70 64",
    "warning-text": "151 101 4",
  },
};

const BY_KEY = new Map<string, ImagePalette>(Object.entries(IMAGE_PALETTES));

/** An unset or retired key paints in the default, as the site does. */
export function imagePalette(key: string | null): ImagePalette {
  return (
    (key === null ? undefined : BY_KEY.get(key)) ?? IMAGE_PALETTES.midnight
  );
}
