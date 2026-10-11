import { _defaults } from "../defaults.ts";
import {
  findClosingBracket,
  findClosingFootnote,
  isStyledBraceHead,
  scanRowEnds,
} from "./scan.ts";
import { colorToHex, parseColor, namuBgDark, namuFgDark } from "../helpers.ts";
import type { _Lexer } from "./Lexer.ts";
import type { NamumarkOptions } from "../Options.ts";
import type { Rules } from "./rules.ts";
import type { Token, Tokens } from "../Tokens.ts";

export const macroNames: Record<string, string> = Object.create(null);
Object.assign(macroNames, {
  br: "br",
  clearfix: "clearfix",
  date: "date",
  datetime: "date",
  목차: "tableofcontents",
  tableofcontents: "tableofcontents",
  각주: "footnote",
  footnote: "footnote",
  include: "include",
  age: "age",
  dday: "dday",
  pagecount: "pagecount",
  anchor: "anchor",
  ruby: "ruby",
  math: "math",
  youtube: "youtube",
  nicovideo: "nicovideo",
  navertv: "navertv",
  vimeo: "vimeo",
});

const youtubeArguments = new Set(["width", "height", "start", "end"]);
const nicoVideoArguments = new Set(["width", "height"]);

const syntaxLanguages = [
  "basic",
  "cpp",
  "csharp",
  "css",
  "erlang",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lisp",
  "lua",
  "markdown",
  "objectivec",
  "perl",
  "php",
  "powershell",
  "python",
  "ruby",
  "rust",
  "sh",
  "sql",
  "swift",
  "typescript",
  "xml",
  "diff",
  "patch",
  "protobuf",
  "svg",
  "thrift",
  "shell",
];

export class _Tokenizer {
  options: NamumarkOptions;
  lexer!: _Lexer;
  rules!: Rules;

  constructor(options?: NamumarkOptions) {
    this.options = options || _defaults;
  }

  space(src: string): Tokens.Space | undefined {
    const match = this.rules.block.newline.exec(src);
    if (!match) return;
    return { type: "space", raw: match[0] };
  }

  comment(src: string): Tokens.Comment | undefined {
    const match = this.rules.block.comment.exec(src);
    if (!match) return;
    return {
      type: "comment",
      raw: match[0],
      text: match[0].slice(2),
    };
  }

  heading(src: string, sourceOffset = -1): Tokens.Heading | undefined {
    const match = this.rules.block.heading.exec(src);
    if (!match) return;
    const at = match[1].length + match[2].length + 1;
    return {
      type: "heading",
      raw: match[0],
      depth: match[1].length,
      folded: match[2] === "#",
      text: match[3],
      tokens: this.lexer.defer(
        match[3],
        sourceOffset === -1 ? -1 : sourceOffset + at,
      ),
    };
  }

  hr(src: string): Tokens.Hr | undefined {
    const match = this.rules.block.hr.exec(src);
    if (!match) return;
    return { type: "hr", raw: match[0] };
  }

  blockquote(src: string, sourceOffset = -1): Tokens.Blockquote | undefined {
    if (src[0] !== ">") return;
    if (this.lexer.state.quoteDepth >= 8) return;
    const depth = this.lexer.state.quoteDepth;
    const deepest = depth >= 7;
    let position = 0;
    let inner = "";
    let mapped = sourceOffset !== -1;
    const spans: { localStart: number; parentStart: number; length: number }[] =
      [];
    while (position < src.length && src[position] === ">") {
      const end = this.lexer.lineEnd(src, position, sourceOffset);
      const line = src.slice(position + 1, end);
      const content = deepest ? line.replace(/^>+/, "") : line;
      const localStart = inner.length;
      inner += content;
      if (content !== line) mapped = false;
      else if (mapped && line.length)
        spans.push({
          localStart,
          parentStart: sourceOffset + position + 1,
          length: line.length,
        });
      position = end;
      const brace = line.indexOf("{{{");
      if (brace !== -1) {
        const braceEnd = this.lexer.braceEnd(
          src,
          end - line.length + brace,
          sourceOffset,
        );
        if (braceEnd > end) {
          const continued = src.slice(position, braceEnd);
          const continuedStart = inner.length;
          inner += continued;
          if (mapped && continued.length)
            spans.push({
              localStart: continuedStart,
              parentStart: sourceOffset + position,
              length: continued.length,
            });
          position = braceEnd;
          continue;
        }
      }
      const open = this.rules.other.rowOpen.exec(line);
      if (!open) continue;
      if (this.findRowEnd(line, open[0].length) !== -1) continue;
      const rowEnd = this.findRowEnd(src, position, sourceOffset);
      if (rowEnd === -1) continue;
      const continued = src.slice(position, rowEnd);
      const continuedStart = inner.length;
      inner += continued;
      if (mapped && continued.length)
        spans.push({
          localStart: continuedStart,
          parentStart: sourceOffset + position,
          length: continued.length,
        });
      position = rowEnd;
    }
    const raw = src.slice(0, position);
    const tokens = this.lexer.deferBlock(inner, {
      wrapParagraphs: this.lexer.state.wrap,
      allowHeadings: false,
      sourceOffset: -1,
      quoteDepth: depth + 1,
      spans: mapped ? spans : undefined,
    });
    return { type: "blockquote", raw, text: inner, tokens };
  }

  list(src: string, sourceOffset = -1): Tokens.List | undefined {
    const first = this.rules.block.listItem.exec(src);
    if (!first || first[1].length !== 1) return;

    const listStyle: Record<string, string> = {
      "1.": "",
      "a.": "alpha",
      "A.": "upper-alpha",
      "i.": "roman",
      "I.": "upper-roman",
    };

    type Frame = {
      list: Tokens.List;
      start: number;
      itemStart: number;
      parts: (string | Tokens.List)[];
    };
    const listStack: Frame[] = [];
    let position = 0;
    const pendingItems: {
      item: Tokens.ListItem;
      segments: (Token | Token[])[];
    }[] = [];

    const finishItem = (frame: Frame, end: number) => {
      if (frame.itemStart === -1) return;
      const item: Tokens.ListItem = {
        type: "list_item",
        raw: src.slice(frame.itemStart, end),
        text: "",
        loose: false,
        task: false,
        tokens: [],
      };
      const segments: (Token | Token[])[] = [];
      let textPart = "";
      for (const part of frame.parts) {
        if (typeof part === "string") {
          item.text += part;
          textPart += part;
          continue;
        }
        if (textPart) {
          segments.push(
            this.lexer.deferBlock(textPart, {
              wrapParagraphs: true,
              allowHeadings: false,
              sourceOffset: -1,
            }),
          );
        }
        textPart = "";
        segments.push(part);
      }
      if (textPart) {
        segments.push(
          this.lexer.deferBlock(textPart, {
            wrapParagraphs: true,
            allowHeadings: false,
            sourceOffset: -1,
          }),
        );
      }
      pendingItems.push({ item, segments });
      frame.list.items.push(item);
      frame.itemStart = -1;
      frame.parts = [];
    };

    const finishList = (end: number) => {
      const frame = listStack.pop()!;
      finishItem(frame, end);
      frame.list.raw = src.slice(frame.start, end);
    };

    const appendItemText = (
      frame: Frame,
      part: string,
      from: number,
    ): number => {
      frame.parts.push(part);
      const open = this.rules.other.rowOpen.exec(part);
      if (!open) return from;
      if (this.findRowEnd(part, open[0].length) !== -1) return from;
      const rowEnd = this.findRowEnd(src, from, sourceOffset);
      if (rowEnd === -1) return from;
      frame.parts.push(src.slice(from, rowEnd));
      return rowEnd;
    };

    while (position < src.length) {
      const lineTo = this.lexer.lineEnd(src, position, sourceOffset);
      const line = src.slice(position, lineTo);
      const bullet = this.rules.block.listItem.exec(line);

      if (!bullet) {
        if (listStack.length === 0 || line[0] !== " ") break;
        let spaces = 1;
        while (line[spaces] === " ") spaces++;
        while (listStack.length > 1 && listStack.length > spaces)
          finishList(position);
        position = appendItemText(
          listStack[listStack.length - 1],
          line.slice(listStack.length),
          lineTo,
        );
        continue;
      }

      const depth = bullet[1].length;
      const marker = bullet[2];

      while (listStack.length > 1 && listStack.length > depth)
        finishList(position);
      let parent = listStack[listStack.length - 1];

      if (parent && depth > listStack.length + 1) {
        position = appendItemText(parent, line.slice(listStack.length), lineTo);
        continue;
      }

      if (parent && depth === listStack.length) {
        if (
          parent.list.ordered !== (marker !== "*") ||
          (parent.list.ordered && parent.list.style !== listStyle[marker])
        )
          break;

        if (!bullet[3] || marker === "*") {
          finishItem(parent, position);
          parent.itemStart = position;
          position = appendItemText(
            parent,
            line.slice(bullet[0].length),
            lineTo,
          );
          continue;
        }

        if (listStack.length === 1) break;
        finishList(position);
        parent = listStack[listStack.length - 1];
      }

      const frame: Frame = {
        list: {
          type: "list",
          raw: "",
          ordered: marker !== "*",
          start: marker === "*" ? "" : bullet[3] ? Number(bullet[3]) : 1,
          style: listStyle[marker],
          loose: false,
          items: [],
        },
        start: position,
        itemStart: position,
        parts: [],
      };
      if (parent) parent.parts.push(frame.list);
      listStack.push(frame);
      position = appendItemText(frame, line.slice(bullet[0].length), lineTo);
    }

    if (listStack.length === 0) return;
    const root = listStack[0].list;
    while (listStack.length > 0) finishList(position);
    this.lexer.deferAfter(() => {
      for (const { item, segments } of pendingItems) {
        for (const label of segments) {
          if (Array.isArray(label)) {
            for (const token of label) item.tokens.push(token);
          } else {
            item.tokens.push(label);
          }
        }
      }
    });
    return root;
  }

  indent(src: string, sourceOffset = -1): Tokens.Indent | undefined {
    if (src[0] !== " ") return;
    if (this.lexer.state.nestDepth >= 33) return;
    let position = 0;
    let inner = "";
    const spans: { localStart: number; parentStart: number; length: number }[] =
      [];
    while (position < src.length && src[position] === " ") {
      if (position > 0) {
        const bullet = this.rules.block.listItem.exec(src.slice(position));
        if (bullet && bullet[1].length === 1) break;
      }
      const end = this.lexer.lineEnd(src, position, sourceOffset);
      const line = src.slice(position + 1, end);
      const localStart = inner.length;
      inner += line;
      if (sourceOffset !== -1 && line.length)
        spans.push({
          localStart,
          parentStart: sourceOffset + position + 1,
          length: line.length,
        });
      position = end;
      const open = this.rules.other.rowOpen.exec(line);
      if (!open) continue;
      if (this.findRowEnd(line, open[0].length) !== -1) continue;
      const rowEnd = this.findRowEnd(src, position, sourceOffset);
      if (rowEnd === -1) continue;
      const continued = src.slice(position, rowEnd);
      const continuedStart = inner.length;
      inner += continued;
      if (sourceOffset !== -1 && continued.length)
        spans.push({
          localStart: continuedStart,
          parentStart: sourceOffset + position,
          length: continued.length,
        });
      position = rowEnd;
    }
    if (position === 0) return;
    const raw = src.slice(0, position);
    const depth = this.lexer.state.nestDepth;
    const body = depth >= 32 ? inner.replace(/^ +/gm, "") : inner;
    const quote = this.lexer.state.quoteDepth;
    const tokens = this.lexer.deferBlock(body, {
      wrapParagraphs: true,
      allowHeadings: false,
      sourceOffset: -1,
      indentDepth: depth + 1,
      quoteDepth: quote + 1,
      spans: body === inner && sourceOffset !== -1 ? spans : undefined,
    });
    return { type: "indent", raw, text: inner, tokens };
  }

  table(src: string, sourceOffset = -1): Tokens.Table | undefined {
    let caption: { raw: string; tokens: Token[] } | undefined;
    let match: RegExpExecArray | null = null;
    if (!src.startsWith("||")) {
      match = this.rules.block.caption.exec(src);
      if (!match || match[0].length === src.length) return;
    }
    const firstRow = this.tableRow(
      src,
      match ? match[0].length : 2,
      sourceOffset,
    );
    if (!firstRow) return;
    if (match) {
      caption = {
        raw: match[0],
        tokens: this.lexer.defer(
          match[1],
          sourceOffset === -1 ? -1 : sourceOffset + 1,
        ),
      };
    }

    const sourceRows = [firstRow];
    let position = firstRow.end;
    while (position < src.length && src.startsWith("||", position)) {
      const row = this.tableRow(src, position + 2, sourceOffset);
      if (!row) break;
      sourceRows.push(row);
      position = row.end;
    }

    const raw = src.slice(0, position);
    const tableStyle = {
      wrapper: {} as Record<string, string>,
      light: {} as Record<string, string>,
      dark: {} as Record<string, string>,
    };
    const attrs: Record<string, string> = {};
    const colStyle: Record<
      string,
      {
        from: number;
        to: number;
        light: Record<string, string>;
        dark: Record<string, string>;
      }[]
    > = Object.create(null);
    const rowspanState = new RowSpanState();
    const deferredFg: { dark: Record<string, string>; spec: string }[] = [];

    const rows: Tokens.TableCell[][] = [];
    const bodies: Tokens.TableCell[] = [];
    const offsets: number[] = [];
    let allowThead = true;
    for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex++) {
      const sourceRow = sourceRows[rowIndex];
      const parsed = parseCells(
        sourceRow.cells,
        tableStyle,
        colStyle,
        rowspanState,
        rowIndex,
        attrs,
        deferredFg,
        allowThead,
      );
      const row: Tokens.TableCell[] = [];
      let sourceCellIndex = 0;
      for (const parsedCell of parsed) {
        while (sourceRow.cells[sourceCellIndex] === "") sourceCellIndex++;
        const cell: Tokens.TableCell = {
          text: parsedCell.cell,
          tokens: [],
          option: parsedCell.option,
          style: parsedCell.style,
          pre: parsedCell.pre,
          post: parsedCell.post,
        };
        row.push(cell);
        bodies.push(cell);
        const start = sourceRow.starts[sourceCellIndex];
        offsets.push(start === -1 ? -1 : start + parsedCell.pre.length);
        sourceCellIndex++;
      }
      rows.push(row);
      if (!row[0]?.option?.["th"]) allowThead = false;
    }
    this.lexer.deferCells(bodies.reverse(), offsets.reverse());
    const tableBgDark = tableStyle.dark["background-color"];
    if (tableBgDark) resolveDeferredFg(deferredFg, tableBgDark);

    return { type: "table", raw, rows, caption, style: tableStyle, attrs };
  }

  private findRowEnd(src: string, from: number, sourceOffset = -1): number {
    if (sourceOffset !== -1) {
      const index = this.lexer.index;
      if (index.rows === null) {
        index.rows = scanRowEnds(
          index.source,
          index.braces,
          index.argEnds,
          macroNames,
        );
      }
      const rows = index.rows;
      const to = sourceOffset + src.length;
      let lo = 0;
      let hi = rows.at.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (rows.at[mid] < sourceOffset + from) lo = mid + 1;
        else hi = mid;
      }
      if (
        lo < rows.at.length &&
        rows.readTo[lo] <= to &&
        rows.end[lo] <= to &&
        (to === index.source.length || index.source[to - 1] !== "=")
      ) {
        return rows.end[lo] === -1 ? -1 : rows.end[lo] - sourceOffset;
      }
    }

    let i = from;
    while (i < src.length) {
      if (src[i] === "=" && (i === 0 || src[i - 1] === "\n")) {
        this.rules.other.headingScan.lastIndex = i;
        if (this.rules.other.headingScan.test(src)) return -1;
      }
      if (src[i] === "\\" && src[i + 1] !== "\n") {
        i += 2;
        continue;
      }
      if (src.startsWith("{{{", i)) {
        const closingOffset = this.lexer.braceEnd(src, i, sourceOffset);
        if (closingOffset > i) {
          i = closingOffset;
          continue;
        }
        i += 3;
        continue;
      }
      if (src[i] === "[" && !src.startsWith("[[", i) && src[i + 1] !== "*") {
        const mac = this.macro(
          src.slice(i),
          sourceOffset === -1 ? -1 : sourceOffset + i,
        );
        if (mac) {
          i += mac.raw.length;
          continue;
        }
        i++;
        continue;
      }
      if (src[i] === "\n") {
        if (src.startsWith("||", i - 2)) return i + 1;
        i++;
        continue;
      }
      i++;
    }
    if (!src.startsWith("||", i - 2)) return -1;
    return src.length;
  }

  private tableRow(
    src: string,
    from: number,
    sourceOffset = -1,
  ): { cells: string[]; starts: number[]; end: number } | null {
    const rowEnd = this.findRowEnd(src, from, sourceOffset);
    if (rowEnd === -1) return null;
    const bodyEnd = (src[rowEnd - 1] === "\n" ? rowEnd - 1 : rowEnd) - 2;
    if (bodyEnd < from) return null;
    const inner = src.slice(from, bodyEnd);
    const contentOffset = sourceOffset === -1 ? -1 : sourceOffset + from;

    const cells: string[] = [];
    const starts: number[] = [];
    let cellStart = 0;
    for (let j = 0; j <= inner.length - 2; j++) {
      if (inner[j] === "\\") {
        j++;
        continue;
      }
      if (inner.startsWith("{{{", j)) {
        const closingOffset = this.lexer.closingBrace(
          inner,
          j,
          contentOffset,
          false,
        );
        j += closingOffset === -1 ? 2 : closingOffset + 5;
        continue;
      }
      if (inner[j] === "[") {
        if (inner.startsWith("[[", j)) {
          const closingOffset = findClosingBracket(
            inner.slice(j + 2),
            this.lexer,
            contentOffset === -1 ? -1 : contentOffset + j + 2,
          );
          if (closingOffset !== -1) j += 2 + closingOffset + 1;
          continue;
        }
        if (inner[j + 1] === "*") {
          const closingOffset = findClosingFootnote(
            inner.slice(j + 2),
            this.lexer,
            contentOffset === -1 ? -1 : contentOffset + j + 2,
          );
          if (closingOffset !== -1) j += 2 + closingOffset;
          continue;
        }
        const mac = this.macro(
          inner.slice(j),
          contentOffset === -1 ? -1 : contentOffset + j,
        );
        if (mac) j += mac.raw.length - 1;
        continue;
      }
      if (inner.startsWith("||", j)) {
        cells.push(inner.slice(cellStart, j));
        starts.push(contentOffset === -1 ? -1 : contentOffset + cellStart);
        cellStart = j + 2;
        j++;
      }
    }
    cells.push(inner.slice(cellStart));
    starts.push(contentOffset === -1 ? -1 : contentOffset + cellStart);
    return { cells, starts, end: rowEnd };
  }

  escape(src: string): Tokens.Escape | undefined {
    const match = this.rules.inline.escape.exec(src);
    if (!match) return;
    return { type: "escape", raw: match[0], text: match[1] };
  }

  br(src: string): Tokens.Br | undefined {
    const match = this.rules.inline.br.exec(src);
    if (!match) return;
    return { type: "br", raw: match[0] };
  }

  brace(
    src: string,
    sourceOffset = -1,
  ):
    | Tokens.Style
    | Tokens.Folding
    | Tokens.If
    | Tokens.Size
    | Tokens.Color
    | Tokens.Code
    | Tokens.Html
    | Tokens.Latex
    | Tokens.GlobalStyle
    | Tokens.Literal
    | undefined {
    if (!src.startsWith("{{{")) return;
    const rawEnd = this.lexer.closingBrace(src, 0, sourceOffset, false);
    if (rawEnd === -1) return;
    const styled = isStyledBraceHead(src);
    const styledEnd = styled
      ? this.lexer.closingBrace(src, 0, sourceOffset, true)
      : rawEnd;
    if (styledEnd === -1) return;
    const rest = src.slice(3);
    let match;
    let token:
      | Tokens.Style
      | Tokens.Folding
      | Tokens.If
      | Tokens.Size
      | Tokens.Color
      | undefined;

    if ((match = this.rules.inline.wiki.exec(src))) {
      const attrs = match[1].startsWith(" ") ? match[1].slice(1) : match[1];
      token = {
        type: "style",
        raw: "",
        attrs,
        style: this.rules.other.wikiStyle.exec(attrs)?.[1],
        darkStyle: this.rules.other.wikiDarkStyle.exec(attrs)?.[1],
        lang: this.rules.other.wikiLang.exec(attrs)?.[1],
        className: this.rules.other.wikiClass.exec(attrs)?.[1],
        tag: this.rules.other.wikiTag.exec(attrs)?.[1],
        onclick: this.rules.other.wikiOnclick.exec(attrs)?.[1],
        tokens: [],
      };
    } else if ((match = this.rules.inline.folding.exec(src))) {
      token = {
        type: "folding",
        raw: "",
        text: match[1],
        tokens: [],
      };
    } else if ((match = this.rules.inline.if.exec(src))) {
      token = {
        type: "if",
        raw: "",
        expr: match[1].startsWith(" ") ? match[1].slice(1) : match[1],
        show: false,
        tokens: [],
      };
    } else if ((match = this.rules.inline.syntax.exec(src))) {
      const headEnd = Math.min(match[0].length - 1, 3 + rawEnd);
      const headSrc = src.slice(match[0].length - 1 - match[1].length, headEnd);
      const head = headSrc.startsWith(" ") ? headSrc.slice(1) : headSrc;
      let lang = "";
      for (const name of syntaxLanguages) {
        if (name.length > lang.length && head.startsWith(name)) lang = name;
      }
      if (!lang) {
        const raw = src.slice(0, 3 + rawEnd + 3);
        return { type: "literal", raw, text: raw.slice(3, -3) };
      }
      const leftover = head
        .slice(lang.length)
        .replace(this.rules.other.leadingSpaces, "");
      return {
        type: "code",
        raw: src.slice(0, 3 + rawEnd + 3),
        lang,
        text:
          (leftover ? leftover + "\n" : "") +
          src.slice(Math.min(match[0].length, 3 + rawEnd), 3 + rawEnd),
      };
    } else if ((match = this.rules.inline.html.exec(src))) {
      return {
        type: "html",
        raw: src.slice(0, 3 + rawEnd + 3),
        text: src
          .slice(match[0].length, 3 + rawEnd)
          .replace(this.rules.other.surroundingSpaces, ""),
        pre: false,
        block: false,
      };
    } else if ((match = this.rules.inline.latex.exec(src))) {
      return {
        type: "latex",
        raw: src.slice(0, 3 + rawEnd + 3),
        tex: src.slice(match[0].length, 3 + rawEnd),
      };
    } else if ((match = this.rules.inline.globalstyle.exec(src))) {
      return {
        type: "globalstyle",
        raw: src.slice(0, 3 + rawEnd + 3),
        css: src.slice(match[0].length, 3 + rawEnd),
      };
    } else if ((match = this.rules.inline.size.exec(src))) {
      token = {
        type: "size",
        raw: "",
        style: match[1],
        tokens: [],
      };
    } else if ((match = this.rules.inline.color.exec(src))) {
      const parts = match[1].split(",");
      const light = parseColor(parts[0]);
      const dark = parts[1] ? parseColor(parts[1]) : null;
      if (parts.length <= 2 && light && (!parts[1] || dark)) {
        token = {
          type: "color",
          raw: "",
          spec: match[1],
          light,
          dark: dark ?? "",
          tokens: [],
        };
      }
    } else if (this.rules.inline.styledHead.test(rest)) {
      return;
    }

    if (token && match) {
      const end = styledEnd;
      const bodyStart = match[0].length;
      let body = src.slice(bodyStart, 3 + end);
      if (body.endsWith("\n")) body = body.slice(0, -1);
      token.raw = src.slice(0, 3 + end + 3);
      const sameLine =
        (token.type === "size" || token.type === "color") &&
        !/[\r\n]/.test(match[2]) &&
        !match[3];

      token.tokens = this.lexer.deferBlock(body, {
        wrapParagraphs: false,
        allowHeadings: false,
        sourceOffset: sourceOffset === -1 ? -1 : sourceOffset + bodyStart,
        skipFirstBlock: sameLine,
        indentDepth: 0,
        quoteDepth: 0,
      });
      return token;
    }

    const raw = src.slice(0, 3 + rawEnd + 3);
    return { type: "literal", raw, text: raw.slice(3, -3) };
  }

  link(src: string, sourceOffset = -1): Tokens.Link | undefined {
    if (!src.startsWith("[[")) return;
    const innerSrc = src.slice(2);
    const contentOffset = sourceOffset === -1 ? -1 : sourceOffset + 2;
    let close = findClosingBracket(innerSrc, this.lexer, contentOffset);
    if (close === -1) return;

    let pipe = -1;
    for (let i = 0; i < close; i++) {
      if (innerSrc[i] === "\\") {
        i++;
        continue;
      }
      if (innerSrc.startsWith("]]", i)) {
        close = i;
        break;
      }
      if (innerSrc[i] === "|") {
        pipe = i;
        break;
      }
    }
    const content = innerSrc.slice(0, close);
    const raw = src.slice(0, 2 + close + 2);
    const to = pipe === -1 ? content : content.slice(0, pipe);
    const label = pipe === -1 ? undefined : content.slice(pipe + 1);
    const labelOffset = contentOffset === -1 ? -1 : contentOffset + pipe + 1;

    if (this.rules.other.externalLink.test(to)) {
      const anchorAt = to.lastIndexOf("#");
      const shown = anchorAt === -1 ? to : to.slice(0, anchorAt);
      return {
        type: "link",
        raw,
        href: to,
        external: true,
        to,
        pipe: pipe !== -1,
        text: label ?? shown,
        tokens:
          label !== undefined
            ? this.lexer.defer(label, labelOffset)
            : [{ type: "text", raw: to, text: shown }],
      };
    }

    let documentName = "";
    let hashAt = -1;
    for (let i = 0; i < to.length; i++) {
      if (to[i] === "\\" && i + 1 < to.length) {
        documentName += to[++i];
      } else {
        if (to[i] === "#") hashAt = documentName.length;
        documentName += to[i];
      }
    }
    let hash: string | undefined;
    if (hashAt !== -1) {
      if (hashAt !== documentName.length - 1)
        hash = documentName.slice(hashAt + 1);
      documentName = documentName.slice(0, hashAt);
    }
    const display =
      documentName === "" && hash !== undefined ? `#${hash}` : documentName;

    const target = documentName.trim().slice(0, 255);

    const current = this.options.title ?? "";
    const up = this.rules.other.parentLink.exec(target);
    let href = target;
    if (up) {
      const rest = target.slice(up[0].length);
      const slash = current.lastIndexOf("/");
      const parent = slash === -1 ? "" : current.slice(0, slash);
      if (parent) href = rest ? `${parent}/${rest}` : parent;
      else href = rest || current;
    } else if (target.startsWith("/")) {
      href = current + target;
    }

    return {
      type: "link",
      raw,
      href,
      hrefWasEmptyBeforeHost: href === "",
      hash,
      external: false,
      to,
      pipe: pipe !== -1,
      text: label ?? display,
      tokens:
        label !== undefined
          ? this.lexer.defer(label, labelOffset)
          : [{ type: "text", raw: to, text: display }],
    };
  }

  private findFootnoteEnd(str: string, sourceOffset = -1): number {
    if (sourceOffset !== -1) {
      const extent = this.lexer.index.footnoteEnds.get(sourceOffset);
      if (extent && extent.readTo <= sourceOffset + str.length) {
        return extent.end === -1 ? -1 : extent.end - sourceOffset;
      }
    }
    if (sourceOffset !== -1) {
      const ends = this.lexer.index.noteEnds;
      if (ends.next(sourceOffset + 2, sourceOffset + str.length) === -1)
        return -1;
    }
    const match = this.rules.inline.footnoteOpen.exec(str);
    if (!match) return -1;
    let level = 1;
    for (let i = match[0].length; i < str.length; i++) {
      const ch = str[i];
      if (ch === "\n") return -1;
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "{" && str.startsWith("{{{", i)) {
        const end = this.lexer.closingBrace(str, i, sourceOffset, false);
        if (end !== -1) i += 3 + end + 2;
        continue;
      }
      if (ch === "[") {
        if (str.startsWith("[[", i)) {
          const end = findClosingBracket(
            str.slice(i + 2),
            this.lexer,
            sourceOffset === -1 ? -1 : sourceOffset + i + 2,
          );
          if (end !== -1) i += 2 + end + 1;
          continue;
        }
        if (str[i + 1] === "*") {
          level++;
          i++;
          continue;
        }
        const mac = this.macro(
          str.slice(i),
          sourceOffset === -1 ? -1 : sourceOffset + i,
        );
        if (mac) i += mac.raw.length - 1;
        continue;
      }
      if (ch === "]") {
        level--;
        if (level === 0) return i;
      }
    }
    return -1;
  }

  footnote(src: string, sourceOffset = -1): Tokens.Footnote | undefined {
    if (!src.startsWith("[*")) return;
    const close = this.findFootnoteEnd(src, sourceOffset);
    if (close === -1) return;
    const match = this.rules.inline.footnoteOpen.exec(src);
    if (!match) return;
    const bodyOffset =
      sourceOffset === -1 ? -1 : sourceOffset + match[0].length;
    const body = src.slice(match[0].length, close);
    const token: Tokens.Footnote = {
      type: "footnote",
      raw: src.slice(0, close + 1),
      title: match[1],
      text: body,
      tokens: [],
    };
    token.tokens = this.lexer.defer(body, bodyOffset);
    return token;
  }

  macro(src: string, sourceOffset = -1): Tokens.Macro | undefined {
    const match = this.rules.inline.macro.exec(src);
    if (!match) return;
    const name = macroNames[match[1].toLowerCase()];
    if (!name) return;

    let raw = match[0];
    let argsSrc: string | undefined;
    if (match[2] === "(") {
      let close = -1;
      if (sourceOffset === -1) {
        close = src.indexOf(")]", match[0].length);
      } else {
        const ends = this.lexer.index.argEnds;
        const end = ends.next(
          sourceOffset + match[0].length,
          sourceOffset + src.length,
        );
        if (end !== -1 && end + 2 <= sourceOffset + src.length)
          close = end - sourceOffset;
      }
      if (close === -1) return;
      argsSrc = src.slice(match[0].length, close);
      raw = src.slice(0, close + 2);
    }

    const token: Tokens.Macro = { type: "macro", raw, name };
    if (name === "math") {
      token.tex = argsSrc ?? "";
      return token;
    }
    if (argsSrc !== undefined) {
      const argument: Record<string, string> = {};
      let target: string | undefined;

      const accepted =
        name === "youtube"
          ? youtubeArguments
          : name === "nicovideo"
            ? nicoVideoArguments
            : null;
      const parts = argsSrc.split(",");
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        const piece = part.trim();
        if (accepted && !piece) break;
        const source = name === "nicovideo" ? part : piece;
        const eq = source.indexOf("=");
        if (eq === -1) {
          if (target === undefined) target = piece;
        } else {
          const key =
            name === "nicovideo"
              ? source.slice(0, eq).replace(/^ +| +$/g, "")
              : source.slice(0, eq).trim();
          const value = source.slice(eq + 1).trim();
          if (
            !accepted ||
            (accepted.has(key) &&
              !Object.prototype.hasOwnProperty.call(argument, key))
          ) {
            if (name !== "nicovideo" || value || index < parts.length - 1)
              argument[key] = value;
          }
        }
      }
      if (target !== undefined) token.target = target;
      if (Object.keys(argument).length) token.argument = argument;
      if (name === "tableofcontents" && target === "hide") token.hide = true;
    }
    return token;
  }

  includeparam(src: string): Tokens.IncludeParam | undefined {
    const match = this.rules.inline.includeparam.exec(src);
    if (!match) return;
    const eq = match[1].indexOf("=");
    if ((eq === -1 ? match[1] : match[1].slice(0, eq)).includes(" ")) return;
    if (eq !== -1 && eq === match[1].length - 1) return;
    if (eq === 0) return;
    return {
      type: "includeparam",
      raw: match[0],
      name: eq === -1 ? match[1] : match[1].slice(0, eq),
      fallback: eq === -1 ? undefined : match[1].slice(eq + 1),
    };
  }

  private findDelim(str: string, delim: string, sourceOffset = -1): number {
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === "\n") return -1;
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "{" && str.startsWith("{{{", i)) {
        const end = this.lexer.closingBrace(str, i, sourceOffset, false);
        if (end !== -1) i += 3 + end + 2;
        continue;
      }
      if (ch === "[") {
        if (str.startsWith("[[", i)) {
          const end = findClosingBracket(
            str.slice(i + 2),
            this.lexer,
            sourceOffset === -1 ? -1 : sourceOffset + i + 2,
          );
          if (end !== -1) i += 2 + end + 1;
          continue;
        }
        if (str[i + 1] === "*") {
          const end = findClosingFootnote(
            str.slice(i + 2),
            this.lexer,
            sourceOffset === -1 ? -1 : sourceOffset + i + 2,
          );
          if (end !== -1) i += 2 + end;
          continue;
        }
        const mac = this.macro(
          str.slice(i),
          sourceOffset === -1 ? -1 : sourceOffset + i,
        );
        if (mac) i += mac.raw.length - 1;
        continue;
      }
      if (str.startsWith(delim, i)) return i;
    }
    return -1;
  }

  strong(src: string, sourceOffset = -1): Tokens.Strong | undefined {
    if (!src.startsWith("'''")) return;
    const inner = sourceOffset === -1 ? -1 : sourceOffset + 3;
    const at = this.findDelim(src.slice(3), "'''", inner);
    if (at < 0) return;
    const text = src.slice(3, 3 + at);
    return {
      type: "strong",
      raw: src.slice(0, 3 + at + 3),
      text,
      tokens: this.lexer.defer(text, inner),
    };
  }

  em(src: string, sourceOffset = -1): Tokens.Em | undefined {
    if (!src.startsWith("''") || src[2] === "'") return;
    const inner = sourceOffset === -1 ? -1 : sourceOffset + 2;
    const at = this.findDelim(src.slice(2), "''", inner);
    if (at <= 0) return;
    const text = src.slice(2, 2 + at);
    return {
      type: "em",
      raw: src.slice(0, 2 + at + 2),
      text,
      tokens: this.lexer.defer(text, inner),
    };
  }

  del(src: string, sourceOffset = -1): Tokens.Del | undefined {
    const delim = src.startsWith("~~~")
      ? "~~~"
      : src.startsWith("---")
        ? "---"
        : src.startsWith("~~")
          ? "~~"
          : src.startsWith("--")
            ? "--"
            : null;
    if (!delim) return;
    const inner = sourceOffset === -1 ? -1 : sourceOffset + delim.length;
    const at = this.findDelim(src.slice(delim.length), delim, inner);
    if (at < 0) return;
    const text = src.slice(delim.length, delim.length + at);
    return {
      type: "del",
      raw: src.slice(0, delim.length + at + delim.length),
      text,
      tokens: this.lexer.defer(text, inner),
    };
  }

  underline(src: string, sourceOffset = -1): Tokens.Underline | undefined {
    const delim = src.startsWith("___")
      ? "___"
      : src.startsWith("__")
        ? "__"
        : null;
    if (!delim) return;
    const inner = sourceOffset === -1 ? -1 : sourceOffset + delim.length;
    const at = this.findDelim(src.slice(delim.length), delim, inner);
    if (at < 0) return;
    const text = src.slice(delim.length, delim.length + at);
    return {
      type: "underline",
      raw: src.slice(0, delim.length + at + delim.length),
      text,
      tokens: this.lexer.defer(text, inner),
    };
  }

  sup(src: string, sourceOffset = -1): Tokens.Sup | undefined {
    const delim = src.startsWith("^^^")
      ? "^^^"
      : src.startsWith("^^")
        ? "^^"
        : null;
    if (!delim) return;
    const inner = sourceOffset === -1 ? -1 : sourceOffset + delim.length;
    const at = this.findDelim(src.slice(delim.length), delim, inner);
    if (at < 0) return;
    const text = src.slice(delim.length, delim.length + at);
    return {
      type: "sup",
      raw: src.slice(0, delim.length + at + delim.length),
      text,
      tokens: this.lexer.defer(text, inner),
    };
  }

  sub(src: string, sourceOffset = -1): Tokens.Sub | undefined {
    const delim = src.startsWith(",,,")
      ? ",,,"
      : src.startsWith(",,")
        ? ",,"
        : null;
    if (!delim) return;
    const inner = sourceOffset === -1 ? -1 : sourceOffset + delim.length;
    const at = this.findDelim(src.slice(delim.length), delim, inner);
    if (at < 0) return;
    const text = src.slice(delim.length, delim.length + at);
    return {
      type: "sub",
      raw: src.slice(0, delim.length + at + delim.length),
      text,
      tokens: this.lexer.defer(text, inner),
    };
  }

  mathTag(src: string, sourceOffset = -1): Tokens.Macro | undefined {
    if (sourceOffset === -1) {
      const match = this.rules.inline.mathTag.exec(src);
      if (!match) return;
      return { type: "macro", raw: match[0], name: "math", tex: match[1] };
    }
    if (!src.startsWith("<math>")) return;
    const ends = this.lexer.index.mathEnds;
    const end = ends.next(sourceOffset + 6, sourceOffset + src.length);
    if (end === -1 || end + 7 > sourceOffset + src.length) return;
    const close = end - sourceOffset;
    return {
      type: "macro",
      raw: src.slice(0, close + 7),
      name: "math",
      tex: src.slice(6, close),
    };
  }

  inertBrackets(src: string, sourceOffset = -1): Tokens.Text | undefined {
    if (src[0] !== "[") return;
    let stop = -1;
    if (sourceOffset === -1) {
      const scan = this.rules.other.inertLineScan;
      scan.lastIndex = 1;
      if (scan.test(src)) stop = scan.lastIndex - 1;
    } else {
      const stops = this.lexer.index.inertStops;
      const found = stops.next(sourceOffset + 1, sourceOffset + src.length);
      if (found !== -1) stop = found - sourceOffset;
    }
    if (stop !== -1 && src[stop] !== "\n") return;
    const match = this.rules.inline.inertBrackets.exec(src);
    if (!match) return;
    return { type: "text", raw: match[0], text: match[0] };
  }

  commentLink(src: string, before?: string): Tokens.CommentLink | undefined {
    if (
      before !== undefined &&
      before !== "\n" &&
      before !== " " &&
      before !== "\t"
    )
      return;
    const match = this.rules.inline.commentLink.exec(src);
    if (!match) return;
    return { type: "commentlink", raw: match[0], text: match[0] };
  }

  text(src: string): Tokens.Text | undefined {
    const match = this.rules.inline.text.exec(src);
    if (!match) return;
    return { type: "text", raw: match[0], text: match[0] };
  }
}


const colorToCss = (color: string): string => {
  const hex = colorToHex(color);
  if (!/^#[\da-f]{6}$/i.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r},${g},${b})`;
};

function parseColorPair(
  raw: string,
  dark: (color: string) => string,
): [string, string] | null {
  const [rawLight = "", rawDark = ""] = raw.split(",");
  const light = parseColor(rawLight);
  if (!light) return null;
  const user = rawDark ? parseColor(rawDark) : null;
  return [colorToCss(light), colorToCss(user ?? dark(colorToHex(light)))];
}
type ColStyle = {
  from: number;
  to: number;
  light: Record<string, string>;
  dark: Record<string, string>;
  spec?: string;
};
type RowSpanNode = {
  at: number;
  until: number;
  height: number;
  first: number;
  last: number;
  minUntil: number;
  dense: boolean;
  left?: RowSpanNode;
  right?: RowSpanNode;
};

const rowSpanHeight = (node: RowSpanNode | undefined) => node?.height ?? 0;

function refreshRowSpan(node: RowSpanNode): RowSpanNode {
  const { left, right } = node;
  node.height = 1 + Math.max(rowSpanHeight(left), rowSpanHeight(right));
  node.first = left?.first ?? node.at;
  node.last = right?.last ?? node.at;
  node.minUntil = Math.min(
    node.until,
    left?.minUntil ?? Infinity,
    right?.minUntil ?? Infinity,
  );
  node.dense =
    (!left || (left.dense && left.last + 1 === node.at)) &&
    (!right || (right.dense && node.at + 1 === right.first));
  return node;
}

function rotateRowSpanLeft(node: RowSpanNode): RowSpanNode {
  const right = node.right!;
  node.right = right.left;
  right.left = refreshRowSpan(node);
  return refreshRowSpan(right);
}

function rotateRowSpanRight(node: RowSpanNode): RowSpanNode {
  const left = node.left!;
  node.left = left.right;
  left.right = refreshRowSpan(node);
  return refreshRowSpan(left);
}

function setRowSpan(
  node: RowSpanNode | undefined,
  at: number,
  until: number,
): RowSpanNode {
  if (!node)
    return {
      at,
      until,
      height: 1,
      first: at,
      last: at,
      minUntil: until,
      dense: true,
    };

  if (at < node.at) node.left = setRowSpan(node.left, at, until);
  else if (at > node.at) node.right = setRowSpan(node.right, at, until);
  else node.until = until;

  refreshRowSpan(node);
  const balance = rowSpanHeight(node.left) - rowSpanHeight(node.right);
  if (balance > 1) {
    if (at > node.left!.at) node.left = rotateRowSpanLeft(node.left!);
    return rotateRowSpanRight(node);
  }
  if (balance < -1) {
    if (at < node.right!.at) node.right = rotateRowSpanRight(node.right!);
    return rotateRowSpanLeft(node);
  }
  return node;
}

function firstFreeRowSpan(
  node: RowSpanNode | undefined,
  at: number,
  row: number,
): number {
  if (!node || at < node.first || at > node.last) return at;
  if (node.dense && node.minUntil > row) return node.last + 1;

  if (at < node.at) {
    at = firstFreeRowSpan(node.left, at, row);
    if (at < node.at) return at;
  }
  if (at === node.at) {
    if (node.until <= row) return at;
    at = node.at + 1;
  }
  return firstFreeRowSpan(node.right, at, row);
}

export class RowSpanState {
  private root?: RowSpanNode;

  next(at: number, row: number): number {
    return firstFreeRowSpan(this.root, at, row);
  }

  block(at: number, until: number): void {
    if (at + 1 > at) this.root = setRowSpan(this.root, at, until);
  }
}
type DeferredFg = {
  dark: Record<string, string>;
  spec: string;
  after?: () => void;
};

function colAt(
  colStyle: Record<string, ColStyle[]>,
  i: number,
  prop: string,
): ColStyle | undefined {
  const list = colStyle[prop];
  if (!list) return undefined;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].to <= i) lo = mid + 1;
    else hi = mid;
  }
  const c = list[lo];
  return c && i >= c.from ? c : undefined;
}

export function parseCells(
  row: string[],
  tableStyle: {
    wrapper: Record<string, string>;
    light: Record<string, string>;
    dark: Record<string, string>;
  },
  colStyle: Record<string, ColStyle[]>,
  rowspanState: RowSpanState,
  rowIndex: number,
  attrs: Record<string, string>,
  deferredFg: DeferredFg[],
  allowThead = true,
) {
  const cells: (Omit<Tokens.TableCell, "text" | "tokens" | "pre" | "post"> & {
    cell: string;
    pre: string;
    post: string;
  })[] = [];
  let cellIndex = -1;
  let cursor = 0;
  let mergeCell = 0;
  const rowStyle = { light: Object.create(null), dark: Object.create(null) };
  let userRowClass = "";
  let rowClassSeen = false;
  let rowIfSeen = false;
  let rowKeep = "";
  let isHead = false;
  const cellColorSpecs: (string | undefined)[] = [];
  let rowColorSpec = "";
  let tableColorSpec = "";

  for (let cell of row) {
    if (cell === "") {
      mergeCell++;
      continue;
    }

    cellIndex = rowspanState.next(cursor, rowIndex);

    const option: Record<string, string> = Object.create(null);
    const style = { light: Object.create(null), dark: Object.create(null) };
    const colSeen: Record<string, boolean> = Object.create(null);
    const orig = cell;
    let cellColorSpec: string | undefined;

    let cap;
    while (cell) {
      if (cell[0] !== "<") break;

      if (
        !tableStyle.wrapper["width"] &&
        (cap = /^<table\s*width=(["']?)(\d*\.?\d+)(px|%|)\1>/.exec(cell))
      ) {
        tableStyle.wrapper["width"] =
          cap[2] + (cap[3] || (cap[2].includes(".") ? "" : "px"));
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !tableStyle.wrapper["align"] &&
        (cap = /^<table\s*align=(["']?)([A-Za-z]+)\1>/.exec(cell))
      ) {
        const align = cap[2].toLowerCase();
        if (align !== "left" && align !== "center" && align !== "right") break;
        tableStyle.wrapper["align"] = align;
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !tableStyle.light["color"] &&
        (cap = /^<table\s*color=(["']?)([A-Za-z0-9#,]+?)\1>/.exec(cell))
      ) {
        const pair = parseColorPair(cap[2], namuFgDark);
        if (!pair) break;
        [tableStyle.light["color"], tableStyle.dark["color"]] = pair;
        tableColorSpec = cap[2];
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !tableStyle.light["background-color"] &&
        (cap = /^<table\s*bgcolor=(["']?)([A-Za-z0-9#,]+?)\1>/.exec(cell))
      ) {
        const pair = parseColorPair(cap[2], namuBgDark);
        if (!pair) break;
        [
          tableStyle.light["background-color"],
          tableStyle.dark["background-color"],
        ] = pair;
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !tableStyle.light["border"] &&
        (cap = /^<table\s*bordercolor=(["']?)([A-Za-z0-9#,]+?)\1>/.exec(cell))
      ) {
        const [rawLight = "", rawDark = ""] = cap[2].split(",");
        const light = parseColor(rawLight);
        if (!light) break;
        const user = parseColor(rawDark);
        const hex = colorToHex(light);
        tableStyle.light["border"] = "2px solid " + hex;
        tableStyle.dark["border"] =
          "2px solid " + (user ? colorToHex(user) : namuBgDark(hex));
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !attrs["class"] &&
        (cap = /^<tableclass=(["']?)([^>]*)\1>/.exec(cell))
      ) {
        attrs["class"] = cap[2];
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !colSeen["color"] &&
        (cap = /^<col\s*color=(["']?)([A-Za-z0-9#,]+?)\1>/.exec(cell))
      ) {
        const pair = parseColorPair(cap[2], namuFgDark);
        if (!pair) break;
        colSeen["color"] = true;
        const light: Record<string, string> = Object.create(null);
        const dark: Record<string, string> = Object.create(null);
        [light["color"], dark["color"]] = pair;
        const list = (colStyle["color"] ??= []);
        let lo = 0;
        let hi = list.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (list[mid].to <= cellIndex) lo = mid + 1;
          else hi = mid;
        }
        if (!(lo < list.length && list[lo].from <= cellIndex))
          list.splice(lo, 0, {
            from: cellIndex,
            to: cellIndex + 1,
            light,
            dark,
            spec: cap[2],
          });
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !colSeen["background-color"] &&
        (cap = /^<col\s*bgcolor=(["']?)([A-Za-z0-9#,]+?)\1>/.exec(cell))
      ) {
        const pair = parseColorPair(cap[2], namuBgDark);
        if (!pair) break;
        colSeen["background-color"] = true;
        const light: Record<string, string> = Object.create(null);
        const dark: Record<string, string> = Object.create(null);
        [light["background-color"], dark["background-color"]] = pair;
        const list = (colStyle["background-color"] ??= []);
        let lo = 0;
        let hi = list.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (list[mid].to <= cellIndex) lo = mid + 1;
          else hi = mid;
        }
        if (!(lo < list.length && list[lo].from <= cellIndex))
          list.splice(lo, 0, {
            from: cellIndex,
            to: cellIndex + 1,
            light,
            dark,
          });
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !rowStyle.light["color"] &&
        (cap = /^<row\s*color=(["']?)([A-Za-z0-9#,]+?)\1>/.exec(cell))
      ) {
        const pair = parseColorPair(cap[2], namuFgDark);
        if (!pair) break;
        [rowStyle.light["color"], rowStyle.dark["color"]] = pair;
        rowColorSpec = cap[2];
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !rowStyle.light["background-color"] &&
        (cap = /^<row\s*bgcolor=(["']?)([A-Za-z0-9#,]+?)\1>/.exec(cell))
      ) {
        const pair = parseColorPair(cap[2], namuBgDark);
        if (!pair) break;
        [
          rowStyle.light["background-color"],
          rowStyle.dark["background-color"],
        ] = pair;
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (!rowClassSeen && (cap = /^<rowclass=(["']?)([^>]*)\1>/.exec(cell))) {
        rowClassSeen = true;
        userRowClass = cap[2];
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (!rowIfSeen && (cap = /^<rowif=([^>]+)>/.exec(cell))) {
        rowIfSeen = true;
        option["rowif"] = cap[1];
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (!option["colspan"] && (cap = /^<-(\d+)>/.exec(cell))) {
        option["colspan"] = cap[1];
        cell = cell.substring(cap[0].length);
        mergeCell = 0;
        continue;
      }

      if (!option["rowspan"] && (cap = /^<(\^|v)?\|(\d+)>/.exec(cell))) {
        if (cap[1] === "^") style.light["vertical-align"] = "top";
        if (cap[1] === "v") style.light["vertical-align"] = "bottom";
        option["rowspan"] = cap[2];
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !style.light["width"] &&
        (cap = /^<width=(["']?)(\d*\.?\d+)(px|%|)\1>/.exec(cell))
      ) {
        style.light["width"] =
          cap[2] + (cap[3] || (cap[2].includes(".") ? "" : "px"));
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !style.light["height"] &&
        (cap = /^<height=(["']?)(\d*\.?\d+)(px|%|)\1>/.exec(cell))
      ) {
        style.light["height"] =
          cap[2] + (cap[3] || (cap[2].includes(".") ? "" : "px"));
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (!style.light["text-align"] && (cap = /^<(\(|:|\))>/.exec(cell))) {
        const align =
          cap[1] === "(" ? "left" : cap[1] === ":" ? "center" : "right";
        style.light["text-align"] = align;
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !style.light["background-color"] &&
        (cap = /^<bgcolor=(["']?)([a-z0-9#,]+?)\1>/i.exec(cell))
      ) {
        const pair = parseColorPair(cap[2], namuBgDark);
        if (!pair) break;
        [style.light["background-color"], style.dark["background-color"]] =
          pair;
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !style.light["color"] &&
        (cap = /^<color=(["']?)([a-z0-9#,]+?)\1>/i.exec(cell))
      ) {
        const pair = parseColorPair(cap[2], namuFgDark);
        if (!pair) break;
        [style.light["color"], style.dark["color"]] = pair;
        cellColorSpec = cap[2];
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (!option["class"] && (cap = /^<class=(["']?)([^>]*)\1>/.exec(cell))) {
        option["class"] = cap[2];
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (!style.light["padding"] && (cap = /^<nopad>/.exec(cell))) {
        style.light["padding"] = "0px";
        cell = cell.substring(cap[0].length);
        continue;
      }

      if ((cap = /^<colkeepall>/.exec(cell))) {
        const light: Record<string, string> = Object.create(null);
        light["word-break"] = "keep-all";
        const dark: Record<string, string> = Object.create(null);
        const list = (colStyle["word-break"] ??= []);
        let lo = 0;
        let hi = list.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (list[mid].to <= cellIndex) lo = mid + 1;
          else hi = mid;
        }
        if (!(lo < list.length && list[lo].from <= cellIndex))
          list.splice(lo, 0, {
            from: cellIndex,
            to: cellIndex + 1,
            light,
            dark,
          });
        cell = cell.substring(cap[0].length);
        continue;
      }
      if ((cap = /^<rowkeepall>/.exec(cell))) {
        rowKeep = "wiki-table-keepall";
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!style.light["word-break"] && (cap = /^<keepall>/.exec(cell))) {
        style.light["word-break"] = "keep-all";
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (allowThead && (cap = /^<thead>/.exec(cell))) {
        isHead = true;
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (isHead && (cap = /^<sortable>/.exec(cell))) {
        option["sortable"] = "1";
        cell = cell.substring(cap[0].length);
        continue;
      }

      if (
        !style.light["background-color"] &&
        (cap = /^<([a-z0-9#,]+?)>/i.exec(cell))
      ) {
        const pair = parseColorPair(cap[1], namuBgDark);
        if (!pair) break;
        [style.light["background-color"], style.dark["background-color"]] =
          pair;
        cell = cell.substring(cap[0].length);
        continue;
      }

      break;
    }

    const afterOptions = cell;
    let leadCut = 0;
    let trailCut = 0;

    if (!option["colspan"] && mergeCell) {
      option["colspan"] = String(mergeCell + 1);
      mergeCell = 0;
    }

    const colspan = option["colspan"] ? Number(option["colspan"]) : 1;
    const rowspan = option["rowspan"] ? Number(option["rowspan"]) : 1;
    if (rowspan > 1) {
      const until = rowIndex + rowspan;
      rowspanState.block(cellIndex, until);
    }
    cursor = cellIndex + colspan;

    if (!style.light["text-align"]) {
      if (cell.startsWith(" ") && cell.endsWith(" ") && cell.length > 2) {
        style.light["text-align"] = "center";
        cell = cell.slice(1, -1);
        leadCut = 1;
        trailCut = 1;
      } else if (cell.startsWith(" ")) {
        style.light["text-align"] = "right";
        cell = cell.slice(1);
        leadCut = 1;
      } else if (cell.endsWith(" ")) {
        style.light["text-align"] = "left";
        cell = cell.slice(0, -1);
        trailCut = 1;
      }
    }

    const colBg = colAt(colStyle, cellIndex, "background-color");
    if (!style.light["background-color"] && colBg) {
      style.light["background-color"] = colBg.light["background-color"];
      style.dark["background-color"] = colBg.dark["background-color"];
    }

    const colFg = colAt(colStyle, cellIndex, "color");
    if (!style.light["color"] && colFg) {
      style.light["color"] = colFg.light["color"];
      style.dark["color"] = colFg.dark["color"];
      cellColorSpec = colFg.spec;
    }

    const colKeep = colAt(colStyle, cellIndex, "word-break");
    if (!style.light["word-break"] && colKeep) {
      style.light["word-break"] = colKeep.light["word-break"];
    }

    const addSemClass = (name: string) => {
      option["sem"] = option["sem"] ? `${option["sem"]} ${name}` : name;
    };
    if (style.light["padding"] === "0px") {
      delete style.light["padding"];
      addSemClass("wiki-table-nopadding");
    }
    if (style.light["word-break"] === "keep-all") {
      delete style.light["word-break"];
      addSemClass("wiki-table-keepall");
    }

    const pre = orig.slice(0, orig.length - afterOptions.length + leadCut);
    const post = trailCut ? orig.slice(orig.length - trailCut) : "";
    cells.push({ cell, option, style, pre, post });
    cellColorSpecs.push(cellColorSpec);
  }

  const tableBgDark = tableStyle.dark["background-color"];
  const rowBgDark = rowStyle.dark["background-color"] ?? tableBgDark;
  for (let i = 0; i < cells.length; i++) {
    const spec = cellColorSpecs[i];
    if (!spec) continue;
    const bgDark = cells[i].style.dark["background-color"] ?? rowBgDark;
    if (!bgDark) {
      deferredFg.push({ dark: cells[i].style.dark, spec });
      continue;
    }
    const pair = parseColorPair(spec, (c) => namuFgDark(c, bgDark));
    if (pair) cells[i].style.dark["color"] = pair[1];
  }
  if (rowColorSpec && rowBgDark) {
    const pair = parseColorPair(rowColorSpec, (c) => namuFgDark(c, rowBgDark));
    if (pair) rowStyle.dark["color"] = pair[1];
  }
  if (tableColorSpec && !tableBgDark) {
    deferredFg.push({ dark: tableStyle.dark, spec: tableColorSpec });
  }
  if (tableColorSpec && tableBgDark) {
    const pair = parseColorPair(tableColorSpec, (c) =>
      namuFgDark(c, tableBgDark),
    );
    if (pair) tableStyle.dark["color"] = pair[1];
  }

  if (cells[0]) {
    if (userRowClass) cells[0].option["rowClass"] = userRowClass;
    if (rowKeep) cells[0].option["rowKeep"] = rowKeep;
    if (rowStyle.dark["background-color"])
      cells[0].option["rowDarkBg"] = rowStyle.dark["background-color"];
    const rowLightDecls: [string, string][] = [];
    if (rowStyle.light["background-color"])
      rowLightDecls.push([
        "background-color",
        rowStyle.light["background-color"],
      ]);
    if (rowStyle.light["color"])
      rowLightDecls.push(["color", rowStyle.light["color"]]);
    const rowLight = rowLightDecls
      .map(([k, v], i) =>
        i === 0 && v.startsWith("rgb(") ? `${k}: ${v};` : `${k}:${v};`,
      )
      .join(" ");

    const writeRowDark = () => {
      const decls: [string, string][] = [];
      if (rowStyle.dark["background-color"])
        decls.push(["background-color", rowStyle.dark["background-color"]]);
      if (rowStyle.dark["color"]) decls.push(["color", rowStyle.dark["color"]]);
      const rowDark = decls
        .map(([k, v], i) =>
          i === 0 && v.startsWith("rgb(") ? `${k}: ${v};` : `${k}:${v};`,
        )
        .join(" ");
      if (rowDark) cells[0].option["rowDarkStyle"] = rowDark;
    };
    if (rowColorSpec && !rowBgDark)
      deferredFg.push({
        dark: rowStyle.dark,
        spec: rowColorSpec,
        after: writeRowDark,
      });
    if (rowLight) cells[0].option["rowStyle"] = rowLight;
    writeRowDark();
  }
  if (isHead) for (const c of cells) c.option["th"] = "1";

  return cells;
}

export function resolveDeferredFg(
  deferredFg: DeferredFg[],
  tableBgDark: string,
): void {
  for (const { dark, spec, after } of deferredFg) {
    const pair = parseColorPair(spec, (c) => namuFgDark(c, tableBgDark));
    if (pair) dark["color"] = pair[1];
    after?.();
  }
}
