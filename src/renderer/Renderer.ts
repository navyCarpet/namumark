import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import basic from "highlight.js/lib/languages/basic";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import erlang from "highlight.js/lib/languages/erlang";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import lisp from "highlight.js/lib/languages/lisp";
import lua from "highlight.js/lib/languages/lua";
import markdown from "highlight.js/lib/languages/markdown";
import objectivec from "highlight.js/lib/languages/objectivec";
import perl from "highlight.js/lib/languages/perl";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import protobuf from "highlight.js/lib/languages/protobuf";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import thrift from "highlight.js/lib/languages/thrift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import katex from "katex";
import "katex/contrib/mhchem";
import sanitizeHtml from "sanitize-html";
import { _defaults } from "../defaults.ts";
import {
  type ChunkList,
  appendChunk,
  chunk,
  colorToHex,
  namuFgDark,
  isRubyColor,
  escapeHtmlEntities,
  flattenChunk,
  percentEncodeLower,
} from "../helpers.ts";
import { filterGlobalCss, filterInlineCss } from "./css.ts";
import { headingText } from "../prepare/metadata.ts";
import type { NamumarkOptions } from "../Options.ts";
import type { _Parser } from "./Parser.ts";
import { other } from "../lexer/rules.ts";
import type { Token, Tokens } from "../Tokens.ts";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("basic", basic);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("erlang", erlang);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("lisp", lisp);
hljs.registerLanguage("lua", lua);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("objectivec", objectivec);
hljs.registerLanguage("perl", perl);
hljs.registerLanguage("php", php);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("protobuf", protobuf);
hljs.registerLanguage("python", python);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("thrift", thrift);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

export type ParagraphRun = { p: Token[] } | { inc: Tokens.Macro };

const htmlSanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "iframe",
    "video",
    "a",
    "div",
    "p",
    "pre",
    "blockquote",
    "span",
    "b",
    "i",
    "u",
    "s",
    "sup",
    "sub",
    "br",
    "ruby",
    "rt",
    "rp",
    "strong",
    "em",
    "ins",
    "del",
    "center",
    "font",
    "ul",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "class"],
    iframe: [
      "src",
      "width",
      "height",
      "allowfullscreen",
      "frameborder",
      "loading",
      "class",
    ],
    video: ["src", "width", "height", "loop", "controls", "preload"],
    font: ["color"],
    "*": ["style"],
  },
  nonTextTags: ["script", "style", "textarea", "option"],
  disallowedTagsMode: "discard",
  allowedSchemes: ["http", "https", "ftp", "mailto", "tel"],
  allowedSchemesByTag: { a: ["http", "https"] },
  transformTags: {
    "*": (tagName, attribs) => {
      if (!attribs.style) return { tagName, attribs };
      const style = filterInlineCss(attribs.style);
      const { style: _dropped, ...rest } = attribs;
      return { tagName, attribs: style ? { ...rest, style } : rest };
    },
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs.href ? { href: attribs.href } : {}),
        target: "_blank",
        rel: "nofollow noopener ugc",
        class: "wiki-link-external",
      },
    }),
    iframe: (tagName, attribs) => {
      const raw = attribs.src ?? "undefined";
      const target = raw.startsWith("http://") ? raw.slice(5) : raw;
      return {
        tagName,
        attribs: {
          ...attribs,
          src:
            "/redirect/" +
            encodeURIComponent(
              target.replace(other.unpairedSurrogate, "\ufffd"),
            ),
          loading: "lazy",
          class: "wiki-media",
        },
      };
    },
  },
};

const cssOf = (styles: Record<string, string>, order: string[]) => {
  let css = "";
  for (const name of order) {
    const value = styles[name];
    if (!value) continue;
    const afterColon = css === "" && value.startsWith("rgb(") ? " " : "";
    if (css) css += " ";
    css += `${name}:${afterColon}${value};`;
  }
  return css;
};

const attr = (name: string, value: string) =>
  value ? ` ${name}="${value}"` : "";

const encodeDocPath = (name: string) => {
  const segs = name.replace(other.unpairedSurrogate, "�").split("/");
  let encoded = "";
  for (let i = 0; i < segs.length; i++) {
    if (i > 0) encoded += segs[i - 1].endsWith(".") ? "%2F" : "/";
    encoded += encodeURIComponent(segs[i]).replace(/%3A/g, ":");
  }
  return { encoded, dotted: segs.some((s) => s === "." || s === "..") };
};

const imageCssLen = (v?: string, encodedSemicolon = false) => {
  if (v == null) return undefined;
  const literalCut = v.indexOf(";");
  if (literalCut !== -1) {
    const numeric = v.slice(0, literalCut);
    return /^\d+(?:\.\d+)?$/.test(numeric) ? `${numeric}px` : undefined;
  }
  if (encodedSemicolon) {
    const encodedCut = v.search(/%3b/i);
    const numeric = encodedCut === -1 ? "" : v.slice(0, encodedCut);
    if (/^\d+(?:\.\d+)?$/.test(numeric)) return `${numeric}px`;
  }
  return /^\d+(?:\.\d+)?$/.test(v) ? `${v}px` : v;
};

const videoPercentLength = /^-?(?:\d+(?:\.\d+)?|\.\d+)%$/;
const videoNumericPrefix = /^-?(?:\d+(?:\.\d+)?|\.\d+)/;

const videoIframeLen = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  if (videoPercentLength.test(value)) return value;
  if (value.includes(";"))
    return videoNumericPrefix.exec(value)?.[0] ?? fallback;
  return value;
};

export class _Renderer<ParserOutput = string, RendererOutput = string> {
  options: NamumarkOptions;
  parser!: _Parser<ParserOutput, RendererOutput>;
  private prefixRaw?: string;
  private prefixSafe = "";
  darkBg?: string;
  darkOnPage = true;
  constructor(options?: NamumarkOptions) {
    this.options = options || _defaults;
  }

  beginDocument(): void {
  }

  space(_token: Tokens.Space): RendererOutput {
    return "<br>" as RendererOutput;
  }

  indent({ tokens }: Tokens.Indent): RendererOutput {
    const output = chunk();
    const closingHtml = this.openIndent(output);
    appendChunk(output, this.parser.parseTokens(tokens));
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openIndent(output: ChunkList): string {
    appendChunk(output, '<div class="wiki-indent">');
    return "</div>";
  }

  code({ text, lang }: Tokens.Code): RendererOutput {
    const stripped = text.replace(other.endingNewline, "");
    const language = lang ?? "";
    const body = hljs.highlight(stripped, { language }).value;
    const cls = ` class="hljs" data-language="${escapeHtmlEntities(language)}"`;
    return `<pre><code${cls}>${body}</code></pre>` as RendererOutput;
  }

  blockquote({ tokens }: Tokens.Blockquote): RendererOutput {
    const output = chunk();
    const closingHtml = this.openBlockquote(output);
    const outerOnPage = this.darkOnPage;
    this.darkOnPage = false;
    appendChunk(output, this.parser.parseTokens(tokens));
    this.darkOnPage = outerOnPage;
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openBlockquote(output: ChunkList): string {
    appendChunk(output, '<blockquote class="wiki-quote">');
    return "</blockquote>";
  }

  private idp(name: string): string {
    const raw = this.options.prefix ?? "";
    if (raw !== this.prefixRaw) {
      this.prefixRaw = raw;
      this.prefixSafe = escapeHtmlEntities(
        raw.replace(other.unpairedSurrogate, "\ufffd"),
        true,
      );
    }
    return this.prefixSafe + name.replace(other.unpairedSurrogate, "\ufffd");
  }

  heading(token: Tokens.Heading): RendererOutput {
    const output = chunk();
    const closingHtml = this.openHeading(output, token);
    appendChunk(output, this.parser.parseInline(token.tokens) as string);
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openHeading(
    output: ChunkList,
    { depth, folded, number, anchor, section }: Tokens.Heading,
  ): string {
    const cls = "wiki-heading" + (folded ? " wiki-heading-folded" : "");
    const num = number ?? "";
    const doc = this.options.title;
    let edit = "";
    if (doc) {
      const { encoded, dotted } = encodeDocPath(doc);
      const at = section ?? 0;
      const target = dotted
        ? `/edit?doc=${encoded}&amp;section=${at}`
        : `/edit/${encoded}?section=${at}`;
      edit = `<span class="wiki-edit-section"><a href="${target}" rel="nofollow">&#91;편집&#93;</a></span>`;
    }
    appendChunk(
      output,
      `<h${depth} class="${cls}">` +
        `<a id="${this.idp("s-" + num.slice(0, -1))}" href="#${this.idp("toc")}">${num}</a> ` +
        `<span id="${this.idp(escapeHtmlEntities(anchor ?? ""))}">`,
    );
    return `${edit}</span></h${depth}>`;
  }

  hr(_token: Tokens.Hr): RendererOutput {
    return "<hr>" as RendererOutput;
  }

  list(token: Tokens.List): RendererOutput {
    const output = chunk();
    const closingHtml = this.openList(output, token);
    for (const item of token.items) {
      const itemClosingHtml = this.openListItem(output, item);
      appendChunk(output, this.parser.parseTokens(item.tokens));
      appendChunk(output, itemClosingHtml);
    }
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openList(output: ChunkList, { ordered, start, style }: Tokens.List): string {
    const tag = ordered ? "ol" : "ul";
    const startAttr = ordered ? ` start=${start}` : "";
    const cls = ordered
      ? `wiki-list wiki-list${style ? `-${style}` : ""}`
      : "wiki-list";
    appendChunk(output, `<${tag} class="${cls}"${startAttr}>`);
    return `</${tag}>`;
  }

  listitem(item: Tokens.ListItem): RendererOutput {
    const output = chunk();
    const closingHtml = this.openListItem(output, item);
    appendChunk(output, this.parser.parseTokens(item.tokens));
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openListItem(output: ChunkList, _item: Tokens.ListItem): string {
    appendChunk(output, "<li>");
    return "</li>";
  }

  paragraphRuns(tokens: Token[]): ParagraphRun[] | null {
    let runs: ParagraphRun[] | null = null;
    let start = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i] as Tokens.Macro;
      if (
        token?.type !== "macro" ||
        token.name !== "include" ||
        (i > 0 && tokens[i - 1].type !== "br") ||
        (i < tokens.length - 1 && tokens[i + 1].type !== "br")
      )
        continue;

      runs ??= [];
      const end = tokens[i - 1]?.type === "br" ? i - 1 : i;
      runs.push({ p: tokens.slice(start, end) }, { inc: token });
      if (tokens[i + 1]?.type === "br") i++;
      start = i + 1;
    }
    if (runs === null) return null;

    const end =
      tokens.at(-1)?.type === "br" ? tokens.length - 1 : tokens.length;
    runs.push({ p: tokens.slice(start, end) });
    return runs;
  }

  paragraphInner(tokens: Token[]): Token[] {
    return tokens.at(-1)?.type === "br" ? tokens.slice(0, -1) : tokens;
  }

  paragraph({ tokens }: Tokens.Paragraph): RendererOutput {
    const runs = this.paragraphRuns(tokens);
    const output = chunk();
    if (runs === null) {
      const closingHtml = this.openParagraph(output);
      appendChunk(
        output,
        this.parser.parseInline(this.paragraphInner(tokens)) as string,
      );
      appendChunk(output, closingHtml);
      return flattenChunk(output) as RendererOutput;
    }

    for (const r of runs) {
      if ("inc" in r) appendChunk(output, this.macro(r.inc) as string);
      else if (r.p.length) {
        const closingHtml = this.openParagraphRun(output);
        appendChunk(output, this.parser.parseInline(r.p) as string);
        appendChunk(output, closingHtml);
      }
    }
    return flattenChunk(output) as RendererOutput;
  }

  openParagraph(output: ChunkList): string {
    appendChunk(output, '<div class="wiki-paragraph">');
    return "</div>";
  }

  openParagraphRun(output: ChunkList): string {
    return this.openParagraph(output);
  }

  table(token: Tokens.Table): RendererOutput {
    return this.parser.parseTokens([token]) as RendererOutput;
  }

  openTable(output: ChunkList, token: Tokens.Table): string {
    const { wrapper, light, dark } = token.style;
    const wrapClass =
      "wiki-table-wrap" + (wrapper.align ? ` table-${wrapper.align}` : "");
    const wrapStyle = wrapper.width ? `width:${wrapper.width}` : "";
    const tableLight = wrapper.width ? { ...light, width: "100%" } : light;
    const tableStyle = cssOf(tableLight, [
      "background-color",
      "color",
      "width",
      "border",
    ]);
    const tableClass = escapeHtmlEntities(
      "wiki-table" + (token.attrs.class ? ` ${token.attrs.class}` : ""),
    );

    appendChunk(
      output,
      `<div class="${wrapClass}"${attr("style", wrapStyle)}>` +
        `<table class="${tableClass}"${attr("style", tableStyle)}${attr("data-dark-style", cssOf(dark, ["background-color", "color", "border"]))}>`,
    );
    return "</table></div>";
  }

  openTableCaption(output: ChunkList): string {
    appendChunk(output, "<caption>");
    return "</caption>";
  }

  openTableRow(output: ChunkList, row: Tokens.TableCell[]): string {
    const cls = [
      "wiki-table-tr",
      row[0]?.option?.["rowClass"],
      row[0]?.option?.["rowKeep"],
    ]
      .filter(Boolean)
      .join(" ");
    appendChunk(
      output,
      `<tr${attr("class", escapeHtmlEntities(cls))}${attr("style", row[0]?.option?.["rowStyle"] ?? "")}${attr("data-dark-style", row[0]?.option?.["rowDarkStyle"] ?? "")}>`,
    );
    return "</tr>";
  }

  tablerow({
    text,
    class: cls,
    style,
    darkStyle,
  }: Tokens.TableRow<ParserOutput>): RendererOutput {
    return `<tr${attr("class", escapeHtmlEntities(cls ?? ""))}${attr("style", style ?? "")}${attr("data-dark-style", darkStyle ?? "")}>${text}</tr>` as RendererOutput;
  }

  tablecell(cell: Tokens.TableCell): RendererOutput {
    const output = chunk();
    const rowDarkBg = this.darkBg;
    if (cell.style.dark["background-color"])
      this.darkBg = cell.style.dark["background-color"];
    const closingHtml = this.openTableCell(output, cell);
    appendChunk(
      output,
      (this.parser.parseTokens(cell.tokens) as string) ||
        '<div class="wiki-paragraph"></div>',
    );
    this.darkBg = rowDarkBg;
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openTableCell(
    output: ChunkList,
    { option, style }: Tokens.TableCell,
  ): string {
    const tag = option.th ? "th" : "td";
    const colspan = option.colspan ? ` colspan="${option.colspan}"` : "";
    const rowspan = option.rowspan ? ` rowspan="${option.rowspan}"` : "";
    const classList = [
      ...(option.class ? [option.class] : []),
      ...(option.sem ? [option.sem] : []),
      ...(option.sortable ? ["sortable-table-head-cell"] : []),
    ].join(" ");
    const cls = classList ? ` class="${escapeHtmlEntities(classList)}"` : "";
    appendChunk(
      output,
      `<${tag}${cls}${colspan}${rowspan}${attr("style", cssOf(style.light, ["color", "background-color", "width", "height", "text-align", "vertical-align"]))}${attr("data-dark-style", cssOf(style.dark, ["background-color", "color"]))}>`,
    );
    return `</${tag}>`;
  }

  escape({ text }: Tokens.Escape): RendererOutput {
    return escapeHtmlEntities(text) as RendererOutput;
  }

  comment(_token: Tokens.Comment): RendererOutput {
    return "" as RendererOutput;
  }

  literal({ raw, text }: Tokens.Literal): RendererOutput {
    return (
      raw.includes("\n")
        ? `<pre><code>${escapeHtmlEntities(text, true)}</code></pre>`
        : `<code>${escapeHtmlEntities(text, true)}</code>`
    ) as RendererOutput;
  }

  style(token: Tokens.Style): RendererOutput {
    const output = chunk();
    const closingHtml = this.openStyle(output, token);
    appendChunk(output, this.parser.parseTokens(token.tokens));
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openStyle(
    output: ChunkList,
    { style, darkStyle, lang, className, tag, onclick }: Tokens.Style,
  ): string {
    const el = tag === "span" || tag === "a" ? tag : "div";
    const cls = className ? ` class="${className}"` : "";
    const oc = onclick ? ` data-onclick="${onclick}"` : "";
    const css =
      style === undefined
        ? ""
        : ` style="${escapeHtmlEntities(filterInlineCss(style), true)}"`;
    appendChunk(
      output,
      `<${el}${cls}${css}${attr("data-dark-style", escapeHtmlEntities(filterInlineCss(darkStyle ?? ""), true))}${attr("lang", escapeHtmlEntities(lang ?? "", true))}${oc}>`,
    );
    return `</${el}>`;
  }

  globalstyle({ css }: Tokens.GlobalStyle): RendererOutput {
    const body = filterGlobalCss(css).replace(other.lessThan, "\\x3C");
    return (body ? `<style>${body}</style>` : "") as RendererOutput;
  }

  size(token: Tokens.Size): RendererOutput {
    const output = chunk();
    const closingHtml = this.openSize(output, token);
    appendChunk(output, this.parser.parseTokens(token.tokens));
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openSize(output: ChunkList, { style }: Tokens.Size): string {
    const dir = style.startsWith("+") ? "up" : "down";
    appendChunk(output, `<span class="wiki-size-${dir}-${style.slice(1)}">`);
    return "</span>";
  }

  folding(token: Tokens.Folding): RendererOutput {
    const output = chunk();
    const closingHtml = this.openFolding(output, token);
    appendChunk(output, this.parser.parseTokens(token.tokens));
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openFolding(output: ChunkList, { text }: Tokens.Folding): string {
    const summary = text ? escapeHtmlEntities(text) : "More";
    appendChunk(
      output,
      `<details class="wiki-folding"><summary>${summary}</summary><div>`,
    );
    return "</div></details>";
  }

  if({ show, tokens }: Tokens.If): RendererOutput {
    return (show ? this.parser.parseTokens(tokens) : "") as RendererOutput;
  }

  color(token: Tokens.Color): RendererOutput {
    const output = chunk();
    const closingHtml = this.openColor(output, token);
    appendChunk(output, this.parser.parseTokens(token.tokens));
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openColor(output: ChunkList, { light, dark }: Tokens.Color): string {
    const l = colorToHex(light);
    const d = dark
      ? colorToHex(dark)
      : namuFgDark(l, this.darkBg, this.darkOnPage);
    appendChunk(
      output,
      `<span style="color:${l}" data-dark-style="color:${d};">`,
    );
    return "</span>";
  }

  html({ text }: Tokens.Html): RendererOutput {
    return sanitizeHtml(text, htmlSanitizeOptions) as RendererOutput;
  }

  latex({ tex }: Tokens.Latex): RendererOutput {
    try {
      return katex.renderToString(tex, {
        displayMode: true,
        throwOnError: true,
        strict: "ignore",
      }) as RendererOutput;
    } catch {
      return `<span style='color: red;'>${escapeHtmlEntities(tex)}</span>` as RendererOutput;
    }
  }

  strong({ tokens }: Tokens.Strong): RendererOutput {
    const output = chunk();
    const closingHtml = this.openStrong(output);
    appendChunk(output, this.parser.parseInline(tokens) as string);
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openStrong(output: ChunkList): string {
    appendChunk(output, "<strong>");
    return "</strong>";
  }

  em({ tokens }: Tokens.Em): RendererOutput {
    const output = chunk();
    const closingHtml = this.openEm(output);
    appendChunk(output, this.parser.parseInline(tokens) as string);
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openEm(output: ChunkList): string {
    appendChunk(output, "<em>");
    return "</em>";
  }

  br(_token: Tokens.Br): RendererOutput {
    return "<br>" as RendererOutput;
  }

  macro(token: Tokens.Macro): RendererOutput {
    switch (token.name) {
      case "tableofcontents":
        return this.renderToc(token.hide) as RendererOutput;
      case "footnote":
        return this.renderFootnoteList(
          token.shownGroups ?? [],
        ) as RendererOutput;
      case "br":
        return "<br>" as RendererOutput;
      case "clearfix":
        return '<div class="wiki-clearfix"></div>' as RendererOutput;
      case "anchor":
        return `<a id="${this.idp(escapeHtmlEntities(token.target ?? ""))}"></a>` as RendererOutput;
      case "include":
        return (
          this.options.discuss ? "" : (token.html ?? "")
        ) as RendererOutput;
      case "pagecount":
        return (
          token.count != null ? String(token.count) : ""
        ) as RendererOutput;
      case "date": {
        const now = new Date();
        return `<time date-format='Y-m-d H:i:sO' datetime='${now.toISOString()}'>${now.toISOString().replace("T", " ").slice(0, 19)}</time>` as RendererOutput;
      }
      case "youtube":
        if (!token.target) return "" as RendererOutput;
        return this.videoIframe(
          `//www.youtube.com/embed/${escapeHtmlEntities(token.target)}`,
          token.argument,
          "youtube",
        ) as RendererOutput;
      case "nicovideo": {
        const target = token.target ?? "";
        const digits = /\d+/.exec(target);
        if (!digits) return "" as RendererOutput;
        const prefix = target.slice(
          Math.max(0, digits.index - 2),
          digits.index,
        );
        const id = `${prefix === "nm" ? "nm" : "sm"}${digits[0]}`;
        return this.videoIframe(
          `//embed.nicovideo.jp/watch/${escapeHtmlEntities(id)}`,
          token.argument,
          "nicovideo",
          "720",
          "480",
        ) as RendererOutput;
      }
      case "navertv":
        return this.videoIframe(
          `//tv.naver.com/embed/${escapeHtmlEntities(token.target ?? "")}`,
          token.argument,
        ) as RendererOutput;
      case "vimeo":
        return this.videoIframe(
          `//player.vimeo.com/video/${escapeHtmlEntities(token.target ?? "")}`,
          token.argument,
        ) as RendererOutput;
      case "age": {
        const date = new Date(token.target ?? "");
        if (isNaN(+date)) return "invalid date" as RendererOutput;
        const now = new Date();
        let age = now.getUTCFullYear() - date.getUTCFullYear();
        const month = now.getUTCMonth() - date.getUTCMonth();
        if (month < 0 || (month === 0 && now.getUTCDate() < date.getUTCDate()))
          age--;
        return String(age) as RendererOutput;
      }
      case "dday": {
        const date = new Date(token.target ?? "");
        if (isNaN(+date)) return "invalid date" as RendererOutput;
        const now = new Date();
        const today = Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
        );
        const days = Math.round((today - +date) / 86400000);
        return (
          days > 0 ? `+${days}` : days < 0 ? `${days}` : "0"
        ) as RendererOutput;
      }
      case "ruby": {
        const rt = token.argument?.ruby;
        const c = token.argument?.color;
        const body =
          c && isRubyColor(c)
            ? `<span style="color:${c}">${escapeHtmlEntities(rt ?? "")}</span>`
            : escapeHtmlEntities(rt ?? "");
        return (`<ruby>${escapeHtmlEntities(token.target ?? "")}<rp>(</rp>` +
          `${rt ? `<rt>${body}</rt>` : ""}` +
          `<rp>)</rp></ruby>`) as RendererOutput;
      }
      case "math": {
        const tex = token.tex ?? "";
        try {
          return katex.renderToString(tex, {
            displayMode: false,
            throwOnError: true,
            strict: "ignore",
          }) as RendererOutput;
        } catch {
          return `<span style='color: red;'>${escapeHtmlEntities(tex)}</span>` as RendererOutput;
        }
      }
      default:
        return "" as RendererOutput;
    }
  }

  private videoIframe(
    src: string,
    argument?: Record<string, string>,
    provider: "youtube" | "nicovideo" | "other" = "other",
    defaultWidth = "640",
    defaultHeight = "360",
  ): string {
    const a = argument ?? {};
    let widthAttr: string;
    let heightAttr: string;
    let style = "";
    if (provider === "youtube") {
      widthAttr = escapeHtmlEntities(videoIframeLen(a.width, defaultWidth));
      heightAttr = escapeHtmlEntities(videoIframeLen(a.height, defaultHeight));
    } else if (provider === "nicovideo") {
      const width = a.width;
      const height = a.height;
      widthAttr = escapeHtmlEntities(
        width === undefined || width.includes(";") ? defaultWidth : width,
      );
      heightAttr = escapeHtmlEntities(
        height === undefined || height.includes(";") ? defaultHeight : height,
      );
    } else {
      const w = a.width;
      const h = a.height;
      const width = w && !w.endsWith("%") ? escapeHtmlEntities(w) : "";
      const height = h && !h.endsWith("%") ? escapeHtmlEntities(h) : "";
      widthAttr = width && !width.includes(";") ? width : defaultWidth;
      heightAttr = height && !height.includes(";") ? height : defaultHeight;
      const styleWidth = w?.endsWith("%") ? escapeHtmlEntities(w) : "";
      if (styleWidth && !styleWidth.includes(";"))
        style = ` style="width:${styleWidth}"`;
    }
    let url = src;
    if (provider === "youtube") {
      const params: string[] = [];
      if (a.start) params.push(`start=${escapeHtmlEntities(a.start)}`);
      if (a.end) params.push(`end=${escapeHtmlEntities(a.end)}`);
      if (params.length) url += `?${params.join("&")}`;
    }
    return `<iframe class="wiki-media" allowfullscreen="" width="${widthAttr}" height="${heightAttr}" frameborder="0"${style} src="${url}" loading="lazy"></iframe>`;
  }

  private renderToc(hide?: boolean): string {
    const headings = this.parser.tokens?.headings;
    const head = `<div class="wiki-macro-toc" id="${this.idp("toc")}"><details${hide ? "" : " open"}><summary></summary>`;
    if (!headings?.length) return `${head}</details></div>`;

    let minDepth = headings[0].depth;
    for (const h of headings) if (h.depth < minDepth) minDepth = h.depth;
    let output = head;
    let open = 0;
    let last = minDepth - 1;
    for (const h of headings) {
      while (last < h.depth) {
        output += `<div class="toc-indent">`;
        open++;
        last++;
      }
      while (last > h.depth) {
        output += `</div>`;
        open--;
        last--;
      }
      const num = (h.number ?? "").replace(/\.$/, "");
      output += `<span class="toc-item"><a href="#${this.idp("s-" + num)}">${num}</a>. ${this.tocText(h.tokens)}</span>`;
    }
    output += "</div>".repeat(open);
    return output + `</details></div>`;
  }

  private tocText(tokens: Token[]): string {
    let output = "";
    const lists: Token[][] = [tokens];
    const at: number[] = [0];
    while (lists.length > 0) {
      const list = lists[lists.length - 1];
      const i = at[at.length - 1]++;
      if (i === list.length) {
        lists.pop();
        at.pop();
        continue;
      }
      const t = list[i];
      switch (t.type) {
        case "text":
          output += escapeHtmlEntities((t as Tokens.Text).text);
          break;
        case "escape":
          output += escapeHtmlEntities((t as Tokens.Escape).text);
          break;
        case "link":
          output += this.link(t as Tokens.Link) as string;
          break;
        case "strong":
        case "em":
        case "del":
        case "underline":
        case "sup":
        case "sub":
        case "color":
        case "size":
          lists.push((t as Tokens.Generic).tokens ?? []);
          at.push(0);
          break;
      }
    }
    return output;
  }

  renderFootnoteList(groups: Tokens.FootnoteGroup[]): string {
    if (groups.length === 0) return "";
    const output = chunk();
    const closingHtml = this.openFootnoteList(output);
    for (const g of groups) {
      const itemClosingHtml = this.openFootnoteItem(output, g);
      appendChunk(output, this.parser.parseInline(g.tokens) as string);
      appendChunk(output, itemClosingHtml);
    }
    appendChunk(output, closingHtml);
    return flattenChunk(output);
  }

  openFootnoteList(output: ChunkList): string {
    appendChunk(output, '<div class="wiki-macro-footnote">');
    return "</div>";
  }

  openFootnoteItem(output: ChunkList, g: Tokens.FootnoteGroup): string {
    const label = escapeHtmlEntities(g.label);
    const refs =
      g.refIndices.length === 1
        ? `<a href="#${this.idp("rfn-" + g.refIndices[0])}">&#91;${label}&#93;</a>`
        : `&#91;${label}&#93;` +
          g.refIndices
            .map(
              (ref, i) =>
                ` <a href="#${this.idp("rfn-" + ref)}"><sup>${g.refIndices[0]}.${i + 1}</sup></a>`,
            )
            .join("");
    appendChunk(
      output,
      `<span class="footnote-list"><span id="${this.idp("fn-" + escapeHtmlEntities(g.id))}"></span>${refs}${g.text ? "" : " "}`,
    );
    return "</span>";
  }

  del({ tokens }: Tokens.Del): RendererOutput {
    const output = chunk();
    const closingHtml = this.openDel(output);
    appendChunk(output, this.parser.parseInline(tokens) as string);
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openDel(output: ChunkList): string {
    appendChunk(output, "<del>");
    return "</del>";
  }

  sup({ tokens }: Tokens.Sup): RendererOutput {
    const output = chunk();
    const closingHtml = this.openSup(output);
    appendChunk(output, this.parser.parseInline(tokens) as string);
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openSup(output: ChunkList): string {
    appendChunk(output, "<sup>");
    return "</sup>";
  }

  sub({ tokens }: Tokens.Sub): RendererOutput {
    const output = chunk();
    const closingHtml = this.openSub(output);
    appendChunk(output, this.parser.parseInline(tokens) as string);
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openSub(output: ChunkList): string {
    appendChunk(output, "<sub>");
    return "</sub>";
  }

  underline({ tokens }: Tokens.Underline): RendererOutput {
    const output = chunk();
    const closingHtml = this.openUnderline(output);
    appendChunk(output, this.parser.parseInline(tokens) as string);
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openUnderline(output: ChunkList): string {
    appendChunk(output, "<u>");
    return "</u>";
  }

  commentlink({ text }: Tokens.CommentLink): RendererOutput {
    const label = escapeHtmlEntities(text);
    return `<a class="wiki-self-link" href="${label}" title="">${label}</a>` as RendererOutput;
  }

  link(token: Tokens.Link): RendererOutput {
    if (token.kind === "file" && !this.options.discuss && token.exists)
      return this.renderFileLink(token) as RendererOutput;
    if (token.kind === "category" && !this.options.discuss)
      return "" as RendererOutput;
    if (token.kind === "file")
      token = {
        ...token,
        tokens: [{ type: "text", raw: token.href, text: token.href }],
      };

    const output = chunk();
    const closingHtml = this.openLink(output, token);
    appendChunk(output, this.parser.parseInline(token.tokens) as string);
    appendChunk(output, closingHtml);
    return flattenChunk(output) as RendererOutput;
  }

  openLink(output: ChunkList, token: Tokens.Link): string {
    const { href, external, hash, exists } = token;
    if (external) {
      const anchorAt = href.lastIndexOf("#");
      const titleHref = anchorAt === -1 ? href : href.slice(0, anchorAt);
      appendChunk(
        output,
        `<a class="wiki-link-external" href="${escapeHtmlEntities(href)}" target="_blank" rel="nofollow noopener ugc" title="${escapeHtmlEntities(titleHref)}">`,
      );
      return "</a>";
    }

    let hashPart = "";
    if (hash) {
      const encodedHash = encodeURIComponent(
        hash.replace(other.unpairedSurrogate, "\ufffd"),
      )
        .replace(/%2F/g, "/")
        .replace(/%3A/g, ":");
      hashPart = `#${encodedHash}`;
    }
    const hostMadeEmpty =
      hash === undefined &&
      token.kind === "link" &&
      token.hrefWasEmptyBeforeHost === false;
    if (!href && !hostMadeEmpty) {
      const cls = hash === undefined ? "wiki-self-link" : "wiki-link-internal";
      appendChunk(
        output,
        `<a class="${cls}" href="${escapeHtmlEntities(hashPart)}" title="">`,
      );
      return "</a>";
    }

    if (!href) {
      const notExist = exists ? "" : " not-exist";
      const rel = exists ? "" : ' rel="nofollow"';
      appendChunk(
        output,
        `<a class="wiki-link-internal${notExist}" href="/w/" title=""${rel}>`,
      );
      return "</a>";
    }

    const { encoded: encodedHref, dotted } = encodeDocPath(href);
    const target = dotted
      ? `/w?doc=${encodedHref}${hashPart}`
      : `/w/${encodedHref}${hashPart}`;
    if (hash === undefined && href === this.options.title) {
      appendChunk(
        output,
        `<a class="wiki-self-link" href="${escapeHtmlEntities(target)}" title="${escapeHtmlEntities(href)}">`,
      );
      return "</a>";
    }
    const notExist = exists ? "" : " not-exist";
    const rel = exists ? "" : ' rel="nofollow"';
    appendChunk(
      output,
      `<a class="wiki-link-internal${notExist}" href="${escapeHtmlEntities(target)}" title="${escapeHtmlEntities(href)}"${rel}>`,
    );
    return "</a>";
  }

  private renderFileLink(token: Tokens.Link): string {
    const name = token.href;
    const p: Record<string, string> = Object.create(null);
    for (const part of (token.text ?? "").split("&")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      p[part.slice(0, eq)] = part.slice(eq + 1).trim();
    }
    const esc = (v?: string) => {
      if (v == null) return undefined;
      const escaped = escapeHtmlEntities(v);
      if (escaped.includes(";")) return undefined;
      return escaped;
    };
    const align = esc(p.align) ?? "normal";
    const theme = esc(p.theme);
    const alignClass =
      `wiki-image-align-${align}` + (theme ? ` wiki-theme-${theme}` : "");
    const w = esc(imageCssLen(p.width, true));
    const h = esc(imageCssLen(p.height));
    const outer = (w ? `width:${w};` : "") + (h ? `height:${h};` : "");
    const imgSize = (w ? ` width="100%"` : "") + (h ? ` height="100%"` : "");
    const bgcolor = esc(p.bgcolor);
    const bg = bgcolor
      ? filterInlineCss(`background-color:${bgcolor}`, true)
      : "";
    const inner =
      (w ? "width: 100%;" : "") +
      (h ? "height: 100%;" : "") +
      (bg ? `${bg};` : "");
    const borderRadius = esc(imageCssLen(p["border-radius"]));
    const rendering = esc(p.rendering);
    const objectFit = esc(p["object-fit"]);
    const imgCss = filterInlineCss(
      [
        ...(borderRadius ? [`border-radius:${borderRadius}`] : []),
        ...(rendering ? [`image-rendering:${rendering}`] : []),
        ...(objectFit ? [`object-fit:${objectFit}`] : []),
      ].join(";"),
      true,
    );
    return (
      `<span class="${alignClass}"${outer ? ` style="${outer}"` : ""}>` +
      `<span class="wiki-image-wrapper"${inner ? ` style="${inner}"` : ""}>` +
      `<img${imgSize}${imgCss ? ` style="${imgCss}"` : ""}` +
      ` src="${escapeHtmlEntities(token.src ?? "")}"` +
      ` alt="${escapeHtmlEntities(name)}">` +
      `</span></span>`
    );
  }

  footnote({
    index,
    text,
    tokens,
    displayLabel,
    groupId,
    groupIndex,
  }: Tokens.Footnote): RendererOutput {
    const href = `#${this.idp("fn-" + percentEncodeLower(groupId ?? ""))}`;
    const group = this.parser.tokens?.footnoteGroups?.[(groupIndex ?? 1) - 1];
    const body = text ? tokens : (group?.tokens ?? []);
    const title = escapeHtmlEntities(
      headingText(body).replace(other.leadingSpace, ""),
    );
    return (`<a class="wiki-fn-content" title="${title}" href="${href}">` +
      `<span id="${this.idp("rfn-" + (index ?? 0))}"></span>` +
      `&#91;${escapeHtmlEntities(displayLabel ?? "")}&#93;` +
      `</a>`) as RendererOutput;
  }

  includeparam({ fallback, resolved }: Tokens.IncludeParam): RendererOutput {
    if (resolved !== undefined)
      return escapeHtmlEntities(resolved, true) as RendererOutput;
    return escapeHtmlEntities(fallback ?? "", true) as RendererOutput;
  }

  textInner(token: Tokens.Text): Token[] {
    return token.blockAfter && token.tokens!.at(-1)?.type === "br"
      ? token.tokens!.slice(0, -1)
      : token.tokens!;
  }

  text(token: Tokens.Text | Tokens.Escape): RendererOutput {
    if ("tokens" in token && token.tokens) {
      const output = chunk();
      const closingHtml = this.openText(output, token);
      appendChunk(
        output,
        this.parser.parseInline(this.textInner(token)) as unknown as string,
      );
      appendChunk(output, closingHtml);
      return flattenChunk(output) as unknown as RendererOutput;
    }
    if ("escaped" in token && token.escaped)
      return token.text as RendererOutput;
    return escapeHtmlEntities(token.text, true) as RendererOutput;
  }

  openText(output: ChunkList, token: Tokens.Text): string {
    if (token.blockBefore) appendChunk(output, "<br>");
    return "";
  }
}
