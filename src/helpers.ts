import { other } from "./lexer/rules.ts";
import type { Token, Tokens } from "./Tokens.ts";

const emptyTokens: Token[] = [];
const emptyRows: Tokens.TableCell[][] = [];

const escapeReplacements: { [index: string]: string } = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "[": "&#91;",
  "]": "&#93;",
};
const getEscapeReplacement = (ch: string) => escapeReplacements[ch];

export function escapeHtmlEntities(html: string, encode?: boolean) {
  if (encode) {
    if (other.escapeTest.test(html)) {
      return html.replace(other.escapeReplace, getEscapeReplacement);
    }
  } else {
    if (other.escapeTestNoEncode.test(html)) {
      return html.replace(other.escapeReplaceNoEncode, getEscapeReplacement);
    }
  }

  return html;
}

export function cleanUrl(href: string) {
  try {
    href = encodeURI(href).replace(other.percentDecode, "%");
  } catch {
    return null;
  }
  return href;
}

export function percentEncodeLower(s: string): string {
  const encoded = encodeURIComponent(
    s.replace(other.unpairedSurrogate, "\ufffd"),
  );
  return encoded.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase());
}

/**
 * @license
 * validate-color
 * https://github.com/dreamyguy/validate-color
 *
 * Copyright (c) Wallace Sidhrée - All rights reserved.
 * Licensed under the MIT License.
 */
const colorNameToHex: Record<string, string> = Object.create(null);
Object.assign(colorNameToHex, {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  darkgreen: "#006400",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  grey: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  lightgreen: "#90ee90",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32",
});

export const colorToHex = (color: string): string =>
  colorNameToHex[color.toLowerCase()] ??
  (other.hexColor.test(color) ? color.toLowerCase() : color);

export function parseColor(str: string): string | null {
  if (other.hexColor.test(str)) return str;
  const stripped = str.startsWith("#") ? str.slice(1) : str;
  if (colorNameToHex[stripped.toLowerCase()] !== undefined) return stripped;
  if (stripped === "transparent") return stripped;
  return null;
}

const rubyRejectedColorNames = new Set([
  "grey",
  "darkgrey",
  "dimgrey",
  "lightgrey",
  "lightslategrey",
  "slategrey",
  "darkslategrey",
]);

export function isRubyColor(str: string): boolean {
  if (other.hexColor.test(str)) return true;
  return !rubyRejectedColorNames.has(str) && colorNameToHex[str] !== undefined;
}

/**
 * @license
 * Dark Reader
 * https://github.com/darkreader/darkreader
 *
 * Copyright (c) 2026 Dark Reader Ltd. - All rights reserved.
 * Licensed under the MIT License.
 */
const scale = (x: number, a: number, b: number, c: number, d: number): number =>
  ((x - a) * (d - c)) / (b - a) + c;

function rgbToHsl(rgb: number[]): number[] {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const di =
    Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
  let h =
    max === r
      ? ((rgb[1] - rgb[2]) / di) % 6
      : max === g
        ? (rgb[2] - rgb[0]) / di + 2
        : (rgb[0] - rgb[1]) / di + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, d / (1 - Math.abs(2 * l - 1)), l];
}

const TIE = 1e-9;
const round255 = (v: number): number => {
  const half = Math.floor(v) + 0.5;
  return Math.round(Math.abs(v - half) < TIE ? half : v);
};

function hslToRgb(h: number, s: number, l: number): number[] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let t: number[];
  if (h < 60) t = [c, x, 0];
  else if (h < 120) t = [x, c, 0];
  else if (h < 180) t = [0, c, x];
  else if (h < 240) t = [0, x, c];
  else if (h < 300) t = [x, 0, c];
  else t = [c, 0, x];
  return [
    Math.max(0, Math.min(255, round255((t[0] + m) * 255))),
    Math.max(0, Math.min(255, round255((t[1] + m) * 255))),
    Math.max(0, Math.min(255, round255((t[2] + m) * 255))),
  ];
}

function hexToRgb(color: string): number[] | null {
  if (/^#[\da-f]{3}$/i.test(color)) {
    return [
      parseInt(color[1] + color[1], 16),
      parseInt(color[2] + color[2], 16),
      parseInt(color[3] + color[3], 16),
    ];
  }
  if (/^#[\da-f]{6}$/i.test(color)) {
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16),
    ];
  }
  return null;
}

const rgbToHex = (rgb: number[]): string =>
  "#" + rgb.map((v) => v.toString(16).toUpperCase().padStart(2, "0")).join("");

const MAX_BG_LIGHTNESS = 0.4;
const BG_POLE = rgbToHsl([24, 26, 27]);

export function namuBgDark(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const [h, s, l] = rgbToHsl(rgb);
  const isNeutral = s < 0.12 || (l > 0.8 && 200 < h && h < 280);
  if (l < 0.5) {
    const lx = scale(l, 0, 0.5, 0, MAX_BG_LIGHTNESS);
    if (isNeutral) return rgbToHex(hslToRgb(BG_POLE[0], BG_POLE[1], lx));
    return rgbToHex(hslToRgb(h, s, lx));
  }
  let lx = scale(l, 0.5, 1, MAX_BG_LIGHTNESS, BG_POLE[2]);
  if (isNeutral) return rgbToHex(hslToRgb(BG_POLE[0], BG_POLE[1], lx));
  let hx = h;
  if (60 < h && h < 180) {
    hx = h > 120 ? scale(h, 120, 180, 135, 180) : scale(h, 60, 120, 60, 105);
  }
  if (40 < hx && hx < 80) lx *= 0.75;
  return rgbToHex(hslToRgb(hx, s, lx));
}

export function namuFgDark(
  color: string,
  darkBg?: string,
  onPage?: boolean,
): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const f32 = Math.fround;
  const [r, g, b] = rgb.map((v) => f32(v / 255));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sum = f32(max + min);
  const lightness = f32(sum / 2);

  const bgCap = darkBg ? other.rgbColor.exec(darkBg) : null;
  const bgRgb =
    (bgCap
      ? [Number(bgCap[1]), Number(bgCap[2]), Number(bgCap[3])]
      : darkBg
        ? hexToRgb(darkBg)
        : null) ?? (onPage ? [0, 0, 0] : [45, 47, 52]);
  const bg = bgRgb.map((v) => f32(v / 255));
  const backgroundLightness = f32(f32(Math.max(...bg) + Math.min(...bg)) / 2);

  if (Math.abs(lightness - backgroundLightness) >= 0.45) return color;
  const target = f32(
    backgroundLightness > 0.56
      ? backgroundLightness - 0.45
      : backgroundLightness + 0.55,
  );

  const delta = f32(max - min);
  let saturation =
    delta === 0
      ? 0
      : f32(delta / (lightness > 0.5 ? f32(f32(2 - max) - min) : sum));
  let hue: number;
  if (lightness < 0.2 || saturation < 0.24) {
    hue = f32(0.1);
    saturation = f32(0.1);
  } else {
    const numerator =
      max === r ? f32(g - b) : max === g ? f32(b - r) : f32(r - g);
    const sector = max === r ? (g < b ? 6 : 0) : max === g ? 2 : 4;
    hue = f32(f32(f32(numerator / delta) + sector) / 6);
    if (205 < hue * 360 && hue * 360 < 245) {
      hue = f32(f32(f32(f32(hue * 360) - 205) * 0.375) + 205) / 360;
    }
    hue = f32(hue);
  }

  const q =
    target < 0.5
      ? f32(target * f32(1 + saturation))
      : f32(f32(target + saturation) - target * saturation);
  const p = f32(f32(2 * target) - q);
  const range = f32(q - p);
  const channel = (t: number): number => {
    if (t < 0) t = f32(t + 1);
    if (t > 1) t = f32(t - 1);
    let value: number;
    if (t < 1 / 6) value = f32(p + f32(range * 6) * t);
    else if (t < 0.5) value = q;
    else if (t < 2 / 3) value = f32(p + range * f32(f32(2 / 3 - t) * 6));
    else value = p;
    return Math.max(0, Math.min(255, Math.round(f32(value * 255))));
  };
  return rgbToHex([
    channel(f32(hue + 1 / 3)),
    channel(hue),
    channel(f32(hue - 1 / 3)),
  ]);
}

export const maxColorNameLength = Math.max(
  "transparent".length,
  ...Object.keys(colorNameToHex).map((name) => name.length),
);

export function joinTokens(nodes: Token[], mode: "raw" | "text"): string {
  let s = "";
  for (const n of nodes) {
    s +=
      mode === "text" && n.type === "text"
        ? (n as Tokens.Text).text
        : ((n as Tokens.Generic).raw ?? "");
  }
  return s;
}

export interface ChunkList {
  parts: (string | ChunkList)[];
  tail: string;
  length: number;
}

export const chunk = (): ChunkList => ({ parts: [], tail: "", length: 0 });

export const appendChunk = (list: ChunkList, part: string | ChunkList) => {
  if (typeof part === "string") {
    list.tail += part;
    list.length += part.length;
    return;
  }
  if (list.tail !== "") {
    list.parts.push(list.tail);
    list.tail = "";
  }
  list.parts.push(part);
  list.length += part.length;
};

export function flattenChunk(root: ChunkList): string {
  if (root.parts.length === 0) return root.tail;

  let out = "";
  const lists: ChunkList[] = [root];
  const at: number[] = [0];
  while (lists.length > 0) {
    const list = lists[lists.length - 1];
    const i = at[at.length - 1]++;
    if (i === list.parts.length) {
      out += list.tail;
      lists.pop();
      at.pop();
      continue;
    }
    const part = list.parts[i];
    if (typeof part === "string") {
      out += part;
      continue;
    }
    lists.push(part);
    at.push(0);
  }
  return out;
}

export function walkTokens(tokens: Token[], cb: (t: Token) => void) {
  type WalkFrame = {
    list: Token[];
    i: number;
    rows: Tokens.TableCell[][];
    row: number;
    cell: number;
  };
  const stack: WalkFrame[] = [
    { list: tokens, i: 0, rows: emptyRows, row: 0, cell: 0 },
  ];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.i >= frame.list.length) {
      if (frame.row >= frame.rows.length) {
        stack.pop();
        continue;
      }
      const row = frame.rows[frame.row];
      if (frame.cell >= row.length) {
        frame.row++;
        frame.cell = 0;
        continue;
      }
      frame.list = row[frame.cell++].tokens;
      frame.i = 0;
      continue;
    }

    const token = frame.list[frame.i++];
    cb(token);
    if (token.type === "table") {
      const t = token as Tokens.Table;
      stack.push({
        list: t.caption ? t.caption.tokens : emptyTokens,
        i: 0,
        rows: t.rows,
        row: 0,
        cell: 0,
      });
    } else if (token.type === "list") {
      stack.push({
        list: (token as Tokens.List).items,
        i: 0,
        rows: emptyRows,
        row: 0,
        cell: 0,
      });
    } else if ((token as Tokens.Generic).tokens) {
      stack.push({
        list: (token as Tokens.Generic).tokens!,
        i: 0,
        rows: emptyRows,
        row: 0,
        cell: 0,
      });
    }
  }
}
