import { _defaults } from "../defaults.ts";
import {
  type ChunkList,
  appendChunk,
  chunk,
  flattenChunk,
} from "../helpers.ts";
import type { NamumarkOptions } from "../Options.ts";
import { _Renderer, type ParagraphRun } from "./Renderer.ts";
import { _TextRenderer } from "./TextRenderer.ts";
import type { NamumarkToken, Token, Tokens, TokensList } from "../Tokens.ts";

interface FrameState {
  closingHtml: string;
  restoreDarkOnPage: boolean | null;
}

interface TokenFrame extends FrameState {
  kind: "document" | "block" | "inline";
  tokens: Token[];
  nextTokenIndex: number;
}

interface ListFrame extends FrameState {
  kind: "list";
  items: Tokens.ListItem[];
  nextItemIndex: number;
}

interface ParagraphFrame extends FrameState {
  kind: "paragraph";
  runs: ParagraphRun[];
  nextRunIndex: number;
}

interface FootnoteFrame extends FrameState {
  kind: "footnotes";
  groups: Tokens.FootnoteGroup[];
  nextGroupIndex: number;
}

interface TableFrame extends FrameState {
  kind: "table";
  restoreDarkOnPage: boolean;
  table: TableState;
}

type RenderFrame =
  | TokenFrame
  | ListFrame
  | ParagraphFrame
  | FootnoteFrame
  | TableFrame;

interface TableState {
  phase: "openRow" | "openCell" | "closeCell" | "closeTable";
  rows: Tokens.TableCell[][];
  headerRowCount: number;
  hadHeaderRows: boolean;
  hadBodyRows: boolean;
  rowIndex: number;
  cellIndex: number;
  caption: Token[] | null;
  rowClosingHtml: string;
  cellClosingHtml: string;
  cellContentStart: number;
  backgroundBeforeTable?: string;
  backgroundBeforeRow?: string;
  backgroundBeforeCell?: string;
  captionOutput: ChunkList;
  parentOutput: ChunkList;
}

function pushTokenFrame(
  stack: RenderFrame[],
  kind: TokenFrame["kind"],
  tokens: Token[],
  closingHtml: string,
): TokenFrame {
  const frame: TokenFrame = {
    kind,
    tokens,
    nextTokenIndex: 0,
    closingHtml,
    restoreDarkOnPage: null,
  };
  stack.push(frame);
  return frame;
}

export class _Parser<ParserOutput = string, RendererOutput = string> {
  options: NamumarkOptions;
  renderer: _Renderer<ParserOutput, RendererOutput>;
  textRenderer: _TextRenderer<RendererOutput>;
  tokens?: TokensList;

  constructor(options?: NamumarkOptions) {
    this.options = options || _defaults;
    this.renderer = new _Renderer<ParserOutput, RendererOutput>();
    this.renderer.options = this.options;
    this.renderer.parser = this;
    this.textRenderer = new _TextRenderer<RendererOutput>();
  }

  static parse<ParserOutput = string, RendererOutput = string>(
    tokens: Token[],
    options?: NamumarkOptions,
  ) {
    const parser = new _Parser<ParserOutput, RendererOutput>(options);
    return parser.parse(tokens);
  }

  parse(tokens: Token[], top = true): ParserOutput {
    if (top) {
      this.tokens = tokens as TokensList;
      this.renderer.beginDocument();
    }

    if (!top) {
      return this.parseTokens(tokens) as ParserOutput;
    }

    return this.renderTokens(tokens, "document") as ParserOutput;
  }

  parseTokens(tokens: Token[]): string {
    return this.renderTokens(tokens, "block");
  }

  parseInline(
    tokens: Token[],
    renderer:
      | _Renderer<ParserOutput, RendererOutput>
      | _TextRenderer<RendererOutput> = this.renderer,
  ): ParserOutput {
    if (renderer === this.renderer)
      return this.renderTokens(tokens, "inline") as ParserOutput;

    return this.renderWithAlternateRenderer(tokens, renderer);
  }

  private renderWithAlternateRenderer(
    tokens: Token[],
    renderer:
      | _Renderer<ParserOutput, RendererOutput>
      | _TextRenderer<RendererOutput>,
  ): ParserOutput {
    let output = "";

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i] as NamumarkToken;

      switch (token.type) {
        case "escape": {
          output += renderer.escape(token);
          continue;
        }
        case "comment": {
          output += renderer.comment(token);
          continue;
        }
        case "literal": {
          output += renderer.literal(token);
          continue;
        }
        case "style": {
          output += renderer.style(token);
          continue;
        }
        case "globalstyle": {
          output += renderer.globalstyle(token);
          continue;
        }
        case "latex": {
          output += renderer.latex(token);
          continue;
        }
        case "size": {
          output += renderer.size(token);
          continue;
        }
        case "folding": {
          output += renderer.folding(token);
          continue;
        }
        case "if": {
          output += renderer.if(token);
          continue;
        }
        case "color": {
          output += renderer.color(token);
          continue;
        }
        case "html": {
          output += renderer.html(token);
          continue;
        }
        case "code": {
          output += renderer.code(token);
          continue;
        }
        case "space": {
          output += renderer.space(token);
          continue;
        }
        case "link": {
          output += renderer.link(token);
          break;
        }
        case "commentlink": {
          output += renderer.commentlink(token);
          break;
        }
        case "footnote": {
          output += renderer.footnote(token);
          break;
        }
        case "macro": {
          output += renderer.macro(token);
          break;
        }
        case "includeparam": {
          output += renderer.includeparam(token);
          break;
        }
        case "sub": {
          output += renderer.sub(token);
          break;
        }
        case "sup": {
          output += renderer.sup(token);
          break;
        }
        case "strong": {
          output += renderer.strong(token);
          break;
        }
        case "em": {
          output += renderer.em(token);
          break;
        }
        case "underline": {
          output += renderer.underline(token);
          break;
        }
        case "br": {
          const prev = tokens[i - 1] as Tokens.Link | undefined;
          if (prev?.type === "link" && prev.kind === "category") break;
          output += renderer.br(token);
          break;
        }
        case "del": {
          output += renderer.del(token);
          break;
        }
        case "text": {
          output += renderer.text(token);
          break;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          throw new Error(errMsg);
        }
      }
    }
    return output as ParserOutput;
  }

  private renderTokens(tokens: Token[], kind: TokenFrame["kind"]): string {
    const renderer = this.renderer;
    const root = chunk();
    let output = root;
    const stack: RenderFrame[] = [
      {
        kind,
        tokens,
        nextTokenIndex: 0,
        closingHtml: "",
        restoreDarkOnPage: null,
      },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.kind === "list") {
        const items = frame.items;
        if (frame.nextItemIndex === items.length) {
          appendChunk(output, frame.closingHtml);
          stack.pop();
          continue;
        }
        const item = items[frame.nextItemIndex++];
        const closingHtml = renderer.openListItem(output, item);
        pushTokenFrame(stack, "block", item.tokens, closingHtml);
        continue;
      }

      if (frame.kind === "paragraph") {
        const runs = frame.runs;
        if (frame.nextRunIndex === runs.length) {
          appendChunk(output, frame.closingHtml);
          stack.pop();
          continue;
        }
        const run = runs[frame.nextRunIndex++];
        if ("inc" in run) {
          appendChunk(output, renderer.macro(run.inc) as string);
          continue;
        }
        if (run.p.length === 0) continue;
        const closingHtml = renderer.openParagraphRun(output);
        pushTokenFrame(stack, "inline", run.p, closingHtml);
        continue;
      }

      if (frame.kind === "table") {
        const table = frame.table;

        if (table.phase === "openRow") {
          if (table.rowIndex === 0 && table.hadHeaderRows)
            appendChunk(output, "<thead>");
          if (table.rowIndex === table.headerRowCount) {
            if (table.hadHeaderRows) appendChunk(output, "</thead>");
            if (table.hadBodyRows) appendChunk(output, "<tbody>");
          }
          if (table.rowIndex === table.rows.length) {
            if (table.hadBodyRows) appendChunk(output, "</tbody>");
            table.phase = "closeTable";
            if (table.caption !== null) {
              output = table.captionOutput;
              const closingHtml = renderer.openTableCaption(output);
              pushTokenFrame(stack, "inline", table.caption, closingHtml);
            }
            continue;
          }
          const row = table.rows[table.rowIndex];
          table.backgroundBeforeRow = renderer.darkBg;
          const rowDarkBg = row[0]?.option?.["rowDarkBg"];
          if (rowDarkBg) renderer.darkBg = rowDarkBg;
          table.rowClosingHtml = renderer.openTableRow(output, row);
          table.cellIndex = 0;
          table.phase = "openCell";
          continue;
        }

        if (table.phase === "openCell") {
          const row = table.rows[table.rowIndex];
          if (table.cellIndex === row.length) {
            appendChunk(output, table.rowClosingHtml);
            renderer.darkBg = table.backgroundBeforeRow;
            table.rowIndex++;
            table.phase = "openRow";
            continue;
          }
          const cell = row[table.cellIndex];
          table.backgroundBeforeCell = renderer.darkBg;
          if (cell.style.dark["background-color"])
            renderer.darkBg = cell.style.dark["background-color"];
          table.cellClosingHtml = renderer.openTableCell(output, cell);
          table.cellContentStart = output.length;
          table.phase = "closeCell";
          pushTokenFrame(stack, "block", cell.tokens, "");
          continue;
        }

        if (table.phase === "closeCell") {
          if (output.length === table.cellContentStart)
            appendChunk(output, '<div class="wiki-paragraph"></div>');
          appendChunk(output, table.cellClosingHtml);
          renderer.darkBg = table.backgroundBeforeCell;
          table.cellIndex++;
          table.phase = "openCell";
          continue;
        }

        output = table.parentOutput;
        if (table.caption !== null) output.length += table.captionOutput.length;
        renderer.darkBg = table.backgroundBeforeTable;
        renderer.darkOnPage = frame.restoreDarkOnPage;
        appendChunk(output, frame.closingHtml);
        stack.pop();
        continue;
      }

      if (frame.kind === "footnotes") {
        const groups = frame.groups;
        if (frame.nextGroupIndex === groups.length) {
          appendChunk(output, frame.closingHtml);
          stack.pop();
          continue;
        }
        const group = groups[frame.nextGroupIndex++];
        const closingHtml = renderer.openFootnoteItem(output, group);
        pushTokenFrame(stack, "inline", group.tokens, closingHtml);
        continue;
      }

      if (frame.nextTokenIndex === frame.tokens.length) {
        if (frame.closingHtml !== "") appendChunk(output, frame.closingHtml);
        if (frame.restoreDarkOnPage !== null)
          renderer.darkOnPage = frame.restoreDarkOnPage;
        stack.pop();
        if (frame.kind === "document") {
          const finalGroups = this.tokens?.footnoteFinalGroups ?? [];
          if (finalGroups.length > 0)
            stack.push({
              kind: "footnotes",
              groups: finalGroups,
              nextGroupIndex: 0,
              closingHtml: renderer.openFootnoteList(output),
              restoreDarkOnPage: null,
            });
        }
        continue;
      }

      const token = frame.tokens[frame.nextTokenIndex++] as NamumarkToken;

      if (frame.kind !== "inline") {
        switch (token.type) {
          case "hr": {
            appendChunk(output, renderer.hr(token) as string);
            continue;
          }
          case "heading": {
            if (frame.kind === "document") {
              if (frame.closingHtml !== "")
                appendChunk(output, frame.closingHtml);
              frame.closingHtml = "</div>";
              const cls =
                "wiki-heading-content" +
                (token.folded ? " wiki-heading-content-folded" : "");
              const closingHtml = renderer.openHeading(output, token);
              pushTokenFrame(
                stack,
                "inline",
                token.tokens,
                closingHtml + `<div class="${cls}">`,
              );
              continue;
            }
            const closingHtml = renderer.openHeading(output, token);
            pushTokenFrame(stack, "inline", token.tokens, closingHtml);
            continue;
          }
          case "table": {
            let headerRowCount = 0;
            for (const r of token.rows)
              if (r[0]?.option?.["th"]) headerRowCount++;
            const state: TableState = {
              phase: "openRow",
              rows:
                headerRowCount === 0
                  ? token.rows
                  : token.rows
                      .filter((r) => r[0]?.option?.["th"])
                      .concat(token.rows.filter((r) => !r[0]?.option?.["th"])),
              headerRowCount,
              hadHeaderRows: token.hadHeadRowsBeforeIf ?? headerRowCount > 0,
              hadBodyRows:
                token.hadBodyRowsBeforeIf ?? token.rows.length > headerRowCount,
              rowIndex: 0,
              cellIndex: 0,
              caption: token.caption ? token.caption.tokens : null,
              rowClosingHtml: "",
              cellClosingHtml: "",
              cellContentStart: 0,
              backgroundBeforeTable: renderer.darkBg,
              backgroundBeforeRow: undefined,
              backgroundBeforeCell: undefined,
              captionOutput: chunk(),
              parentOutput: output,
            };
            const closingHtml = renderer.openTable(output, token);
            if (state.caption !== null)
              appendChunk(output, state.captionOutput);
            stack.push({
              kind: "table",
              table: state,
              closingHtml: closingHtml,
              restoreDarkOnPage: renderer.darkOnPage,
            });
            if (token.style.dark["background-color"])
              renderer.darkBg = token.style.dark["background-color"];
            renderer.darkOnPage = false;
            continue;
          }
          case "blockquote": {
            const closingHtml = renderer.openBlockquote(output);
            pushTokenFrame(
              stack,
              "block",
              token.tokens,
              closingHtml,
            ).restoreDarkOnPage = renderer.darkOnPage;
            renderer.darkOnPage = false;
            continue;
          }
          case "list": {
            const closingHtml = renderer.openList(output, token);
            stack.push({
              kind: "list",
              items: token.items,
              nextItemIndex: 0,
              closingHtml: closingHtml,
              restoreDarkOnPage: null,
            });
            continue;
          }
          case "indent": {
            const closingHtml = renderer.openIndent(output);
            pushTokenFrame(stack, "block", token.tokens, closingHtml);
            continue;
          }
          case "paragraph": {
            const runs = renderer.paragraphRuns(token.tokens);
            if (runs === null) {
              const closingHtml = renderer.openParagraph(output);
              pushTokenFrame(
                stack,
                "inline",
                renderer.paragraphInner(token.tokens),
                closingHtml,
              );
              continue;
            }
            stack.push({
              kind: "paragraph",
              runs,
              nextRunIndex: 0,
              closingHtml: "",
              restoreDarkOnPage: null,
            });
            continue;
          }
          case "html":
          case "includeparam": {
            const errMsg =
              'Token with "' + token.type + '" type was not found.';
            throw new Error(errMsg);
          }
        }
      }

      switch (token.type) {
        case "escape": {
          appendChunk(output, renderer.escape(token) as string);
          continue;
        }
        case "comment": {
          appendChunk(output, renderer.comment(token) as string);
          continue;
        }
        case "literal": {
          appendChunk(output, renderer.literal(token) as string);
          continue;
        }
        case "style": {
          const closingHtml = renderer.openStyle(output, token);
          pushTokenFrame(stack, "block", token.tokens, closingHtml);
          continue;
        }
        case "globalstyle": {
          appendChunk(output, renderer.globalstyle(token) as string);
          continue;
        }
        case "latex": {
          appendChunk(output, renderer.latex(token) as string);
          continue;
        }
        case "size": {
          const closingHtml = renderer.openSize(output, token);
          pushTokenFrame(stack, "block", token.tokens, closingHtml);
          continue;
        }
        case "folding": {
          const closingHtml = renderer.openFolding(output, token);
          pushTokenFrame(stack, "block", token.tokens, closingHtml);
          continue;
        }
        case "if": {
          if (!token.show) continue;
          pushTokenFrame(stack, "block", token.tokens, "");
          continue;
        }
        case "color": {
          const closingHtml = renderer.openColor(output, token);
          pushTokenFrame(stack, "block", token.tokens, closingHtml);
          continue;
        }
        case "html": {
          appendChunk(output, renderer.html(token) as string);
          continue;
        }
        case "code": {
          appendChunk(output, renderer.code(token) as string);
          continue;
        }
        case "space": {
          appendChunk(output, renderer.space(token) as string);
          continue;
        }
        case "link": {
          if (
            token.kind === "file" ||
            (token.kind === "category" && !this.options.discuss)
          ) {
            appendChunk(output, renderer.link(token) as string);
            continue;
          }
          const closingHtml = renderer.openLink(output, token);
          pushTokenFrame(stack, "inline", token.tokens, closingHtml);
          continue;
        }
        case "commentlink": {
          appendChunk(output, renderer.commentlink(token) as string);
          continue;
        }
        case "footnote": {
          appendChunk(output, renderer.footnote(token) as string);
          continue;
        }
        case "macro": {
          if (token.name === "footnote") {
            const groups = token.shownGroups ?? [];
            if (groups.length > 0)
              stack.push({
                kind: "footnotes",
                groups,
                nextGroupIndex: 0,
                closingHtml: renderer.openFootnoteList(output),
                restoreDarkOnPage: null,
              });
            continue;
          }
          appendChunk(output, renderer.macro(token) as string);
          continue;
        }
        case "includeparam": {
          appendChunk(output, renderer.includeparam(token) as string);
          continue;
        }
        case "sub": {
          const closingHtml = renderer.openSub(output);
          pushTokenFrame(stack, "inline", token.tokens, closingHtml);
          continue;
        }
        case "sup": {
          const closingHtml = renderer.openSup(output);
          pushTokenFrame(stack, "inline", token.tokens, closingHtml);
          continue;
        }
        case "strong": {
          const closingHtml = renderer.openStrong(output);
          pushTokenFrame(stack, "inline", token.tokens, closingHtml);
          continue;
        }
        case "em": {
          const closingHtml = renderer.openEm(output);
          pushTokenFrame(stack, "inline", token.tokens, closingHtml);
          continue;
        }
        case "underline": {
          const closingHtml = renderer.openUnderline(output);
          pushTokenFrame(stack, "inline", token.tokens, closingHtml);
          continue;
        }
        case "br": {
          const prev = frame.tokens[frame.nextTokenIndex - 2] as
            | Tokens.Link
            | undefined;
          if (
            frame.kind === "inline" &&
            prev?.type === "link" &&
            prev.kind === "category"
          )
            continue;
          appendChunk(output, renderer.br(token) as string);
          continue;
        }
        case "del": {
          const closingHtml = renderer.openDel(output);
          pushTokenFrame(stack, "inline", token.tokens, closingHtml);
          continue;
        }
        case "text": {
          if (token.tokens) {
            const closingHtml = renderer.openText(output, token);
            pushTokenFrame(
              stack,
              "inline",
              renderer.textInner(token),
              closingHtml,
            );
            continue;
          }
          appendChunk(output, renderer.text(token) as string);
          continue;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          throw new Error(errMsg);
        }
      }
    }

    return flattenChunk(root);
  }
}
