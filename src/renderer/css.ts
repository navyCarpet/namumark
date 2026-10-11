import { other } from "../lexer/rules.ts";

export function hashClassName(name: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(name)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return "_" + hash.toString(16).padStart(16, "0");
}

const cssAllowedProperties = new Set([
  "align-items",
  "aspect-ratio",
  "background",
  "background-attachment",
  "background-clip",
  "background-color",
  "background-image",
  "background-origin",
  "background-position",
  "background-repeat",
  "background-size",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-collapse",
  "border-color",
  "border-image",
  "border-image-outset",
  "border-image-repeat",
  "border-image-slice",
  "border-image-source",
  "border-image-width",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-spacing",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "box-decoration-break",
  "box-shadow",
  "box-sizing",
  "break-after",
  "break-before",
  "break-inside",
  "clear",
  "color",
  "color-interpolation-filters",
  "cursor",
  "display",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "float",
  "font",
  "font-family",
  "font-feature-settings",
  "font-kerning",
  "font-language-override",
  "font-size",
  "font-size-adjust",
  "font-stretch",
  "font-style",
  "font-synthesis",
  "font-variant",
  "font-variant-alternates",
  "font-variant-caps",
  "font-variant-east-asian",
  "font-variant-ligatures",
  "font-variant-numeric",
  "font-variant-position",
  "font-weight",
  "gap",
  "grid-template-columns",
  "height",
  "justify-content",
  "letter-spacing",
  "lighting-color",
  "list-style",
  "list-style-image",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "overflow",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-align-last",
  "text-combine-upright",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-skip",
  "text-decoration-style",
  "text-emphasis",
  "text-emphasis-color",
  "text-emphasis-position",
  "text-emphasis-style",
  "text-indent",
  "text-orientation",
  "text-overflow",
  "text-shadow",
  "text-transform",
  "text-underline-position",
  "text-wrap",
  "vertical-align",
  "white-space",
  "width",
  "word-break",
  "word-spacing",
  "word-wrap",
  "writing-mode",
]);

const cssValueMaxLength: Record<string, number> = {
  color: 64,
  border: 128,
  font: 128,
  "font-family": 128,
  "background-image": 512,
  "text-shadow": 512,
  background: 1024,
};

const cssAllowedValues: Record<string, Set<string>> = {
  "align-items": new Set([
    "normal",
    "stretch",
    "center",
    "start",
    "end",
    "flex-start",
    "flex-end",
    "self-start",
    "self-end",
    "baseline",
    "first baseline",
    "last baseline",
  ]),
  cursor: new Set([
    "auto",
    "default",
    "none",
    "context-menu",
    "help",
    "pointer",
    "progress",
    "wait",
    "cell",
    "crosshair",
    "text",
    "vertical-text",
    "alias",
    "copy",
    "move",
    "no-drop",
    "not-allowed",
    "grab",
    "grabbing",
    "all-scroll",
    "col-resize",
    "row-resize",
    "n-resize",
    "e-resize",
    "s-resize",
    "w-resize",
    "ne-resize",
    "nw-resize",
    "se-resize",
    "sw-resize",
    "ew-resize",
    "ns-resize",
    "nesw-resize",
    "nwse-resize",
    "zoom-in",
    "zoom-out",
  ]),
  display: new Set([
    "block",
    "flex",
    "inline",
    "inline-block",
    "inline-flex",
    "inline-table",
    "list-item",
    "none",
    "table",
    "table-caption",
    "table-cell",
    "table-row",
    "table-column",
    "table-column-group",
    "table-footer-group",
    "table-header-group",
    "table-row-group",
  ]),
  "flex-direction": new Set(["row", "row-reverse", "column", "column-reverse"]),
  "flex-wrap": new Set(["nowrap", "wrap", "wrap-reverse"]),
  "justify-content": new Set([
    "center",
    "start",
    "end",
    "flex-start",
    "left",
    "right",
    "normal",
    "space-between",
    "space-around",
    "space-evenly",
    "stretch",
  ]),
  overflow: new Set(["visible", "hidden", "scroll", "auto", "overlay"]),
  "overflow-x": new Set(["visible", "hidden", "scroll", "auto", "overlay"]),
  "overflow-y": new Set(["visible", "hidden", "scroll", "auto", "overlay"]),
  "text-align": new Set(["left", "right", "center", "justify"]),
  "white-space": new Set([
    "normal",
    "nowrap",
    "pre",
    "pre-wrap",
    "pre-line",
    "break-spaces",
    "initial",
    "inherit",
    "unset",
    "revert",
    "revert-layer",
    "collapse",
    "wrap",
    "preserve nowrap",
  ]),
  "writing-mode": new Set(["horizontal-tb", "vertical-rl", "vertical-lr"]),
};

const cssSelectorTags = new Set([
  "a",
  "div",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
]);

const cssImageEmbedProperties = new Set([
  "object-fit",
  "border-radius",
  "image-rendering",
  "background-color",
]);

function cssDeclarations(css: string, imagePropertiesOnly: boolean): string[] {
  const kept: string[] = [];

  const declarations: string[] = [];
  let start = 0;
  for (let p = 0; p < css.length; p++) {
    const ch = css[p];
    if (ch === "/" && css[p + 1] === "*") {
      const close = css.indexOf("*/", p + 2);
      if (close < 0) continue;
      p = close + 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      p++;
      while (p < css.length) {
        const inner = css[p];
        if (inner === ch) break;
        if (inner === "\n" || inner === "\r" || inner === "\f") break;
        if (inner === "\\") p++;
        p++;
      }
      if (p >= css.length) return [];
      continue;
    }
    if (ch !== ";") continue;
    declarations.push(css.slice(start, p));
    start = p + 1;
  }
  declarations.push(css.slice(start));

  for (const declaration of declarations) {
    const comments: number[][] = [];
    for (let q = 0; q < declaration.length; q++) {
      if (declaration[q] !== "/" || declaration[q + 1] !== "*") continue;
      const close = declaration.indexOf("*/", q + 2);
      if (close < 0) break;
      comments.push([q, close + 2]);
      q = close + 1;
    }
    const trimEnds = (lo: number, hi: number) => {
      let left = 0;
      let right = comments.length - 1;
      while (lo < hi) {
        while (lo < hi && /\s/.test(declaration[lo])) lo++;
        while (left <= right && comments[left][1] <= lo) left++;
        const comment = comments[left];
        if (!comment || comment[0] !== lo || comment[1] > hi) break;
        lo = comment[1];
        left++;
      }
      while (hi > lo) {
        while (hi > lo && /\s/.test(declaration[hi - 1])) hi--;
        while (right >= left && comments[right][0] >= hi) right--;
        const comment = comments[right];
        if (!comment || comment[1] !== hi || comment[0] < lo) break;
        hi = comment[0];
        right--;
      }
      return declaration.slice(lo, hi);
    };
    let colon = -1;
    let commentIndex = 0;
    for (let q = 0; q < declaration.length; q++) {
      while (commentIndex < comments.length && comments[commentIndex][1] <= q)
        commentIndex++;
      const comment = comments[commentIndex];
      if (comment && comment[0] <= q && q < comment[1]) {
        q = comment[1] - 1;
        commentIndex++;
        continue;
      }
      if (declaration[q] === ":") {
        colon = q;
        break;
      }
    }
    if (colon < 0) continue;
    const property = trimEnds(0, colon).toLowerCase();
    const value = trimEnds(colon + 1, declaration.length);
    if (!property || !value) continue;
    if (other.cssDanglingEscape.test(value)) continue;
    if (imagePropertiesOnly && !cssImageEmbedProperties.has(property)) continue;
    if (!imagePropertiesOnly && !cssAllowedProperties.has(property)) continue;

    const bareSource = stripCssImportant(value).trim();
    const bare = bareSource.toLowerCase();
    const checked = property === "white-space" ? bareSource : bare;
    if (cssAllowedValues[property] && !cssAllowedValues[property].has(checked))
      continue;
    if (property === "flex-grow" && !other.cssNumber.test(bare)) continue;
    if (property === "flex-shrink" && !other.cssNumber.test(bare)) continue;

    if (bare.length > (cssValueMaxLength[property] ?? 32)) continue;
    kept.push(`${property}:${value}`);
  }
  return kept;
}

function hasUnclosedComment(css: string): boolean {
  for (let p = 0; (p = css.indexOf("/*", p)) >= 0; ) {
    const close = css.indexOf("*/", p + 2);
    if (close < 0) return true;
    p = close + 2;
  }
  return false;
}

function decodeCssEscapes(css: string): string {
  return css.replace(other.cssEscape, (_m, hex: string, ch: string) => {
    if (ch !== undefined) return ch;
    if (hex === undefined) return "";
    const code = parseInt(hex, 16);
    if (code === 0 || code > 0x10ffff) return "\ufffd";
    return String.fromCodePoint(code);
  });
}

function stripCssImportant(value: string): string {
  const importantLength = 9;
  if (
    value.length < importantLength ||
    value.slice(-importantLength).toLowerCase() !== "important"
  )
    return value;

  let bang = value.length - importantLength - 1;
  while (bang >= 0 && /\s/.test(value[bang])) bang--;
  if (value[bang] !== "!") return value;

  let start = bang;
  while (start > 0 && /\s/.test(value[start - 1])) start--;
  return value.slice(0, start);
}

export function filterInlineCss(
  css: string,
  imagePropertiesOnly = false,
): string {
  if (hasUnclosedComment(css)) return "";

  const style = cssDeclarations(css, imagePropertiesOnly).join(";");
  const decoded = decodeCssEscapes(style);
  if (other.cssBannedFunction.test(decoded)) return "";
  return style;
}

export function filterGlobalCss(css: string): string {
  const styles: string[] = [];
  let output = "";

  const scopeSelector = (raw: string, darkPrefix: string): string => {
    const groups: string[] = [];
    const masked = raw.replace(other.cssSelectorGroup, (g) => {
      groups.push(g);
      return `\x01${groups.length - 1}\x01`;
    });
    const unmask = (s: string) =>
      s.replace(other.cssSelectorMask, (_m, i: string) => groups[Number(i)]);

    const selectors: string[] = [];
    for (const one of masked.split(",")) {
      const chunks = one.trim().split(other.cssCombinator);
      let selector = "";
      for (let k = 0; k < chunks.length; k += 2) {
        let compound = "";
        for (const [simple] of chunks[k].matchAll(other.cssSimpleSelector)) {
          if (simple.startsWith("::")) compound += unmask(simple);
          else if (simple.startsWith(":not\x01")) continue;
          else if (simple.startsWith(":")) compound += unmask(simple);
          else if (simple.startsWith("\x01")) continue;
          else if (simple.startsWith("."))
            compound += "." + hashClassName(simple.slice(1));
          else if (simple.startsWith("#")) compound += simple;
          else if (simple === "*") continue;
          else if (cssSelectorTags.has(simple.toLowerCase()))
            compound += simple;
        }
        if (!compound) continue;
        if (!selector) {
          selector = compound;
          continue;
        }
        const combinator = (chunks[k - 1] ?? " ").trim();
        selector += combinator ? ` ${combinator} ${compound}` : ` ${compound}`;
      }
      if (selector) selectors.push(`${darkPrefix}.wiki[class] ${selector}`);
    }
    return selectors.join(",");
  };

  if (hasUnclosedComment(css)) return "";
  const source = css.replace(other.cssComment, "");

  const closeOf = new Int32Array(source.length).fill(-1);
  const openAt: number[] = [];
  for (let p = 0; p < source.length; p++) {
    const ch = source[p];
    if (ch === "'" || ch === '"') {
      p++;
      while (p < source.length) {
        const inner = source[p];
        if (inner === ch) break;
        if (inner === "\n" || inner === "\r" || inner === "\f") break;
        if (inner === "\\") p++;
        p++;
      }
      if (source[p] !== ch) return "";
      continue;
    }
    if (ch === "{") openAt.push(p);
    else if (ch === "}" && openAt.length) closeOf[openAt.pop()!] = p;
  }
  if (openAt.length) return "";

  const stack: { limit: number; resume: number; darkPrefix: string }[] = [];
  let darkPrefix = "";
  let limit = source.length;
  let head = 0;
  let i = 0;
  while (i < limit || stack.length) {
    if (i >= limit) {
      const frame = stack.pop()!;
      limit = frame.limit;
      darkPrefix = frame.darkPrefix;
      i = frame.resume;
      head = i;
      continue;
    }

    if (source[i] === "'" || source[i] === '"') {
      const quote = source[i];
      i++;
      while (i < limit) {
        const ch = source[i];
        if (ch === quote) break;
        if (ch === "\n" || ch === "\r" || ch === "\f") break;
        if (ch === "\\") i++;
        i++;
      }
      i++;
      continue;
    }

    if (source[i] === ";") {
      i++;
      head = i;
      continue;
    }
    if (source[i] !== "{") {
      i++;
      continue;
    }
    const prelude = source.slice(head, i).trim();
    const innerStart = i + 1;
    const innerEnd = closeOf[i] < 0 ? limit : closeOf[i];
    const end = closeOf[i] < 0 ? limit : closeOf[i] + 1;

    if (prelude === "@theseed-dark-mode") {
      stack.push({ limit, resume: end, darkPrefix });
      limit = innerEnd;
      darkPrefix = ".theseed-dark-mode ";
      i = innerStart;
      head = i;
      continue;
    }
    if (prelude.startsWith("@")) {
      stack.push({ limit, resume: end, darkPrefix });
      limit = innerEnd;
      i = innerStart;
      head = i;
      continue;
    }

    i = end;
    head = i;
    const inner = source.slice(innerStart, innerEnd);
    const declarations = cssDeclarations(inner, false);
    if (!declarations.length) continue;
    const selector = scopeSelector(prelude, darkPrefix);
    if (!selector) continue;
    const style = declarations.join(";");
    styles.push(style);
    output += `${selector}{${style};}`;
  }

  const decoded = decodeCssEscapes(styles.join(";"));
  if (other.cssBannedFunction.test(decoded)) return "";

  return output;
}
