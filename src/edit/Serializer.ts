import {
  type ChunkList,
  appendChunk,
  chunk,
  flattenChunk,
} from "../helpers.ts";
import { inline } from "../lexer/rules.ts";
import type { Token, Tokens } from "../Tokens.ts";

export const dirty = new WeakSet<Token>();

export function markDirty(token: Token) {
  dirty.add(token);
}

const decorationDelimiters: Record<string, string> = {
  strong: "'''",
  em: "''",
  del: "--",
  underline: "__",
  sup: "^^",
  sub: ",,",
};

interface DirtyFrame {
  token: Token | null;
  children: Token[];
  nextChildIndex: number;
  hasDirtyToken: boolean;
}

interface WrapperFrame {
  kind: "wrapper";
  tokens: Token[];
  nextTokenIndex: number;
  output: ChunkList;
  closing: string;
}

interface PrefixedFrame {
  kind: "prefixed";
  tokens: Token[];
  nextTokenIndex: number;
  output: ChunkList;
  linePrefix: string;
}

interface ListFrame {
  kind: "list";
  items: Tokens.ListItem[];
  itemIndex: number;
  nextTokenIndex: number;
  bullet: string;
  indent: string;
  isFirstLine: boolean;
  pendingText: ChunkList;
  output: ChunkList;
  childIsList: boolean;
}

interface TableFrame {
  kind: "table";
  table: Tokens.Table;
  rowIndex: number;
  cellIndex: number;
  nextTokenIndex: number;
  rowOutput: ChunkList;
  rowsOutput: ChunkList;
  captionOutput: string | ChunkList;
  phase: "cells" | "caption" | "complete";
}

type SerializeFrame = WrapperFrame | PrefixedFrame | ListFrame | TableFrame;

const openWrapper = (
  stack: SerializeFrame[],
  tokens: Token[],
  opening: string,
  closing: string,
): null => {
  const output = chunk();
  appendChunk(output, opening);
  stack.push({ kind: "wrapper", tokens, nextTokenIndex: 0, output, closing });
  return null;
};

export class _Serializer {
  reformat = false;
  private dirtySubtree = new WeakSet<Token>();

  serialize(tokens: Token[], options?: { reformat?: boolean }): string {
    this.reformat = options?.reformat ?? false;
    this.markDirtySubtrees(tokens);
    return this.serializeFrames(tokens);
  }

  private markDirtySubtrees(tokens: Token[]) {
    const stack: DirtyFrame[] = [
      {
        token: null,
        children: tokens,
        nextChildIndex: 0,
        hasDirtyToken: false,
      },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.nextChildIndex === frame.children.length) {
        stack.pop();
        if (frame.token !== null && frame.hasDirtyToken) {
          this.dirtySubtree.add(frame.token);
          if (stack.length > 0) stack[stack.length - 1].hasDirtyToken = true;
        }
        continue;
      }

      const token = frame.children[frame.nextChildIndex++];
      const tokenIsDirty =
        dirty.has(token) || (token as Tokens.Generic).raw === undefined;
      let children: Token[] | null;
      if (token.type === "table") {
        const table = token as Tokens.Table;
        children = [
          ...(table.caption?.tokens ?? []),
          ...table.rows.flatMap((row) => row.flatMap((cell) => cell.tokens)),
        ];
      } else if (token.type === "list") {
        children = (token as Tokens.List).items;
      } else {
        children = (token as Tokens.Generic).tokens ?? null;
      }
      if (children !== null && children.length > 0) {
        stack.push({
          token,
          children,
          nextChildIndex: 0,
          hasDirtyToken: tokenIsDirty,
        });
        continue;
      }
      if (tokenIsDirty) {
        this.dirtySubtree.add(token);
        frame.hasDirtyToken = true;
      }
    }
  }

  private serializeFrames(tokens: Token[]): string {
    const stack: SerializeFrame[] = [
      {
        kind: "wrapper",
        tokens,
        nextTokenIndex: 0,
        output: chunk(),
        closing: "",
      },
    ];

    while (true) {
      const frame = stack[stack.length - 1];
      let completed: string | ChunkList;

      if (frame.kind === "list") {
        if (frame.itemIndex < frame.items.length) {
          const item = frame.items[frame.itemIndex];

          if (frame.nextTokenIndex === -1) {
            const rawNewline = item.raw.indexOf("\n");
            const textNewline = item.text.indexOf("\n");
            const rawFirstLineLength =
              rawNewline === -1 ? item.raw.length : rawNewline;
            const textFirstLineLength =
              textNewline === -1 ? item.text.length : textNewline;
            frame.bullet = item.raw.slice(
              0,
              rawFirstLineLength - textFirstLineLength,
            );
            frame.indent = /^ */.exec(frame.bullet)![0];
            frame.isFirstLine = true;
            frame.pendingText = chunk();
            frame.nextTokenIndex = 0;
            continue;
          }

          if (frame.nextTokenIndex === item.tokens.length) {
            this.flushListItemText(frame);
            if (frame.isFirstLine) appendChunk(frame.output, frame.bullet);
            frame.itemIndex++;
            frame.nextTokenIndex = -1;
            continue;
          }

          const token = item.tokens[frame.nextTokenIndex++];
          if (token.type === "list") {
            this.flushListItemText(frame);
            frame.isFirstLine = false;
            frame.childIsList = true;
            const serialized = this.serializeToken(stack, token);
            if (serialized !== null) appendChunk(frame.output, serialized);
            continue;
          }

          frame.childIsList = false;
          const serialized = this.serializeToken(stack, token);
          if (serialized !== null) appendChunk(frame.pendingText, serialized);
          continue;
        }

        completed =
          frame.output.parts.length === 0 ? frame.output.tail : frame.output;
      } else if (frame.kind === "table") {
        if (frame.phase === "cells") {
          if (frame.rowIndex === frame.table.rows.length) {
            if (frame.table.caption && frame.table.rows.length) {
              frame.phase = "caption";
              openWrapper(stack, frame.table.caption.tokens, "", "");
            } else {
              frame.phase = "complete";
            }
            continue;
          }
          const row = frame.table.rows[frame.rowIndex];
          if (frame.cellIndex === row.length) {
            if (frame.rowIndex > 0) appendChunk(frame.rowsOutput, "\n||");
            if (frame.rowOutput.parts.length === 0) {
              appendChunk(frame.rowsOutput, frame.rowOutput.tail);
              frame.rowOutput.tail = "";
              frame.rowOutput.length = 0;
            } else {
              appendChunk(frame.rowsOutput, frame.rowOutput);
              frame.rowOutput = chunk();
            }
            appendChunk(frame.rowsOutput, "||");
            frame.cellIndex = 0;
            frame.rowIndex++;
            continue;
          }
          const cell = row[frame.cellIndex];
          if (frame.nextTokenIndex === -1) {
            if (frame.cellIndex > 0) appendChunk(frame.rowOutput, "||");
            appendChunk(frame.rowOutput, cell.pre ?? "");
            frame.nextTokenIndex = 0;
            continue;
          }
          if (frame.nextTokenIndex === cell.tokens.length) {
            appendChunk(frame.rowOutput, cell.post ?? "");
            frame.cellIndex++;
            frame.nextTokenIndex = -1;
            continue;
          }
          const serialized = this.serializeToken(
            stack,
            cell.tokens[frame.nextTokenIndex++],
          );
          if (serialized !== null) appendChunk(frame.rowOutput, serialized);
          continue;
        }

        const body = chunk();
        if (frame.table.rows.length) {
          if (frame.table.caption) {
            appendChunk(body, "|");
            appendChunk(body, frame.captionOutput);
            appendChunk(body, "|");
          } else {
            appendChunk(body, "||");
          }
        }
        const lines = frame.rowsOutput;
        appendChunk(body, lines.parts.length === 0 ? lines.tail : lines);
        if (frame.table.raw.endsWith("\n")) appendChunk(body, "\n");
        completed = body.parts.length === 0 ? body.tail : body;
      } else {
        if (frame.nextTokenIndex < frame.tokens.length) {
          const serialized = this.serializeToken(
            stack,
            frame.tokens[frame.nextTokenIndex++],
          );
          if (serialized !== null) appendChunk(frame.output, serialized);
          continue;
        }

        if (frame.kind === "prefixed") {
          const content = flattenChunk(frame.output);
          const trailingNewline = content.endsWith("\n") ? "\n" : "";
          const body = trailingNewline ? content.slice(0, -1) : content;
          completed =
            body
              .split("\n")
              .map((line) => frame.linePrefix + line)
              .join("\n") + trailingNewline;
        } else {
          appendChunk(frame.output, frame.closing);
          completed =
            frame.output.parts.length === 0 ? frame.output.tail : frame.output;
        }
      }

      stack.pop();
      if (stack.length === 0)
        return typeof completed === "string"
          ? completed
          : flattenChunk(completed);

      const parent = stack[stack.length - 1];
      if (parent.kind === "list") {
        if (parent.childIsList) appendChunk(parent.output, completed);
        else appendChunk(parent.pendingText, completed);
        continue;
      }
      if (parent.kind === "table") {
        if (parent.phase === "caption") {
          parent.captionOutput = completed;
          parent.phase = "complete";
        } else {
          appendChunk(parent.rowOutput, completed);
        }
        continue;
      }
      appendChunk(parent.output, completed);
    }
  }

  private flushListItemText(frame: ListFrame) {
    if (frame.pendingText.length === 0) return;
    const content = flattenChunk(frame.pendingText);
    const trailingNewline = content.endsWith("\n") ? "\n" : "";
    const body = trailingNewline ? content.slice(0, -1) : content;
    appendChunk(
      frame.output,
      body
        .split("\n")
        .map((line) => {
          if (!frame.isFirstLine) return frame.indent + line;
          frame.isFirstLine = false;
          return frame.bullet + line;
        })
        .join("\n") + trailingNewline,
    );
    frame.pendingText = chunk();
  }

  private static structural = new Set([
    "heading",
    "paragraph",
    "text",
    "blockquote",
    "indent",
    "list",
    "table",
    "style",
    "folding",
    "if",
  ]);

  private serializeToken(stack: SerializeFrame[], token: Token): string | null {
    const touched = this.dirtySubtree.has(token);
    if (this.reformat) {
      if (!touched && !_Serializer.structural.has(token.type)) {
        const raw = token.raw;
        if (raw != null) return raw;
      }
    } else if (!touched) return token.raw ?? "";

    switch (token.type) {
      case "heading": {
        const heading = token as Tokens.Heading;
        const marker = "=".repeat(heading.depth);
        const foldMarker = heading.folded ? "#" : "";
        const trailingNewline = heading.raw.endsWith("\n") ? "\n" : "";
        return openWrapper(
          stack,
          heading.tokens,
          `${marker}${foldMarker} `,
          ` ${foldMarker}${marker}${trailingNewline}`,
        );
      }
      case "paragraph":
        return openWrapper(stack, (token as Tokens.Paragraph).tokens, "", "");
      case "text": {
        const text = token as Tokens.Text;
        return text.tokens
          ? openWrapper(stack, text.tokens, "", "")
          : text.text;
      }
      case "blockquote":
      case "indent":
        stack.push({
          kind: "prefixed",
          tokens: (token as Tokens.Blockquote | Tokens.Indent).tokens,
          nextTokenIndex: 0,
          output: chunk(),
          linePrefix: token.type === "blockquote" ? ">" : " ",
        });
        return null;
      case "list": {
        const list = token as Tokens.List;
        stack.push({
          kind: "list",
          items: list.items,
          itemIndex: 0,
          nextTokenIndex: -1,
          bullet: "",
          indent: "",
          isFirstLine: true,
          pendingText: chunk(),
          output: chunk(),
          childIsList: false,
        });
        return null;
      }
      case "table": {
        const table = token as Tokens.Table;
        stack.push({
          kind: "table",
          table,
          rowIndex: 0,
          cellIndex: 0,
          nextTokenIndex: -1,
          rowOutput: chunk(),
          rowsOutput: chunk(),
          captionOutput: "",
          phase: "cells",
        });
        return null;
      }
      case "literal":
        return "{{{" + (token as Tokens.Literal).text + "}}}";
      case "html":
        return "{{{#!html" + (token as Tokens.Html).text + "}}}";
      case "code": {
        const code = token as Tokens.Code;
        return "{{{#!syntax " + (code.lang ?? "") + "\n" + code.text + "}}}";
      }
      case "globalstyle":
        return "{{{#!style\n" + (token as Tokens.GlobalStyle).css + "}}}";
      case "latex":
        return "{{{#!latex\n" + (token as Tokens.Latex).tex + "}}}";
      case "style": {
        const style = token as Tokens.Style;
        let attrs = style.attrs;
        if (attrs === undefined) {
          const parts: string[] = [];
          if (style.className) parts.push(`class="${style.className}"`);
          if (style.style) parts.push(`style="${style.style}"`);
          if (style.darkStyle) parts.push(`dark-style="${style.darkStyle}"`);
          if (style.lang) parts.push(`lang="${style.lang}"`);
          if (style.tag) parts.push(`tag="${style.tag}"`);
          if (style.onclick) parts.push(`onclick="${style.onclick}"`);
          attrs = parts.join(" ");
        }
        const head = attrs ? "#!wiki " + attrs : "#!wiki";
        const rawBody = style.raw?.slice(style.raw.indexOf("\n") + 1, -3);
        const trailingNewline = rawBody?.endsWith("\n") ? "\n" : "";
        return openWrapper(
          stack,
          style.tokens,
          "{{{" + head + "\n",
          trailingNewline + "}}}",
        );
      }
      case "size": {
        const size = token as Tokens.Size;
        const trailingNewline = size.raw?.endsWith("\n}}}") ? "\n" : "";
        return openWrapper(
          stack,
          size.tokens,
          "{{{" + size.style + " ",
          trailingNewline + "}}}",
        );
      }
      case "color": {
        const color = token as Tokens.Color;
        let spec = color.spec;
        if (spec === undefined) {
          const light = color.light.startsWith("#")
            ? color.light
            : "#" + color.light;
          const dark = color.dark.startsWith("#")
            ? color.dark
            : "#" + color.dark;
          spec = light + (color.dark ? "," + dark : "");
        }
        const trailingNewline = color.raw?.endsWith("\n}}}") ? "\n" : "";
        return openWrapper(
          stack,
          color.tokens,
          "{{{" + spec + " ",
          trailingNewline + "}}}",
        );
      }
      case "folding": {
        const folding = token as Tokens.Folding;
        const rawBody = folding.raw?.slice(folding.raw.indexOf("\n") + 1, -3);
        const trailingNewline = rawBody?.endsWith("\n") ? "\n" : "";
        return openWrapper(
          stack,
          folding.tokens,
          "{{{#!folding" + folding.text + "\n",
          trailingNewline + "}}}",
        );
      }
      case "if": {
        const conditional = token as Tokens.If;
        const rawBody = conditional.raw?.slice(
          conditional.raw.indexOf("\n") + 1,
          -3,
        );
        const trailingNewline = rawBody?.endsWith("\n") ? "\n" : "";
        return openWrapper(
          stack,
          conditional.tokens,
          "{{{#!if " + conditional.expr + "\n",
          trailingNewline + "}}}",
        );
      }
      case "strong":
      case "em":
      case "del":
      case "underline":
      case "sup":
      case "sub": {
        let delimiter = decorationDelimiters[token.type] ?? "";
        if (token.raw) {
          const regex =
            inline.normal.decoration[
              token.type as keyof typeof inline.normal.decoration
            ];
          regex.lastIndex = 0;
          const match = regex.exec(token.raw);
          if (match) delimiter = match[0];
        }
        return openWrapper(
          stack,
          (token as Tokens.Generic).tokens ?? [],
          delimiter,
          delimiter,
        );
      }
      case "link": {
        const link = token as Tokens.Link;
        const target =
          link.to ?? link.href + (link.hash ? "#" + link.hash : "");
        if (!link.pipe) return `[[${target}]]`;
        return openWrapper(stack, link.tokens, `[[${target}|`, "]]");
      }
      case "footnote":
        return openWrapper(
          stack,
          (token as Tokens.Footnote).tokens,
          "[*" + (token as Tokens.Footnote).title,
          "]",
        );
      case "macro": {
        const macro = token as Tokens.Macro;
        const args: string[] = [];
        if (macro.target) args.push(macro.target);
        for (const [name, value] of Object.entries(macro.argument ?? {})) {
          args.push(`${name}=${value}`);
        }
        return (
          "[" +
          macro.name +
          (args.length ? "(" + args.join(", ") + ")" : "") +
          "]"
        );
      }
      case "includeparam": {
        const param = token as Tokens.IncludeParam;
        return (
          "@" +
          param.name +
          (param.fallback !== undefined ? "=" + param.fallback : "") +
          "@"
        );
      }
      case "escape":
        return "\\" + (token as Tokens.Escape).text;
      case "comment":
        return "##" + (token as Tokens.Comment).text;
      default:
        return token.raw ?? "";
    }
  }
}

export function _serialize(
  tokens: Token[],
  options?: { reformat?: boolean },
): string {
  return new _Serializer().serialize(tokens, options);
}
