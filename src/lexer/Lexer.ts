import { _defaults } from "../defaults.ts";
import { findClosingBrace, isStyledBraceHead } from "./scan.ts";
import {
  createSourceIndex,
  emptySourceIndex,
  mapSourceIndex,
  type SourceIndex,
  type SourceSpan,
} from "./SourceIndex.ts";
import type { NamumarkOptions } from "../Options.ts";
import { block, inline, other } from "./rules.ts";
import { macroNames, _Tokenizer } from "./Tokenizer.ts";
import type { NamumarkToken, Token } from "../Tokens.ts";

interface BlockOptions {
  wrapParagraphs: boolean;
  allowHeadings: boolean;
  sourceOffset: number;
  skipFirstBlock?: boolean;
  spans?: SourceSpan[];
  indentDepth?: number;
  quoteDepth?: number;
}

interface LexFrame {
  mode: "block" | "inline";
  source: string;
  position: number;
  tokens: Token[];

  sourceOffset: number;
  sourceIndex: SourceIndex | null;

  wrapParagraphs: boolean;
  allowHeadings: boolean;
  skipFirstBlock: boolean;
  indentDepth: number;
  quoteDepth: number;

  pendingCells: {
    cells: { text: string; tokens: Token[] }[];
    offsets: number[];
  } | null;
  onComplete: (() => void) | null;
}

export class _Lexer {
  tokens: Token[];
  options: NamumarkOptions;
  tokenizer: _Tokenizer;
  index: SourceIndex = emptySourceIndex;
  private pendingFrames: LexFrame[] = [];
  state: {
    nestDepth: number;
    quoteDepth: number;
    wrap: boolean;
  };

  constructor(options?: NamumarkOptions) {
    this.tokens = [];
    this.options = options || _defaults;
    this.tokenizer = new _Tokenizer();
    this.tokenizer.options = this.options;
    this.tokenizer.lexer = this;
    this.state = {
      nestDepth: 0,
      quoteDepth: 0,
      wrap: true,
    };
    this.tokenizer.rules = {
      other,
      block: this.options.discuss ? block.discuss : block.normal,
      inline: this.options.discuss ? inline.discuss : inline.normal,
    };
  }

  static lex(src: string, options?: NamumarkOptions) {
    const lexer = new _Lexer(options);
    return lexer.lex(src);
  }

  lex(src: string): Token[] {
    src = src.replace(this.tokenizer.rules.other.carriageReturn, "\n");

    const documentTokens = this.tokens;
    const previousIndex = this.index;
    const previousWrap = this.state.wrap;
    const frameStack: LexFrame[] = [
      {
        mode: "block",
        source: src,
        position: 0,
        tokens: documentTokens,
        sourceOffset: 0,
        sourceIndex: null,
        wrapParagraphs: true,
        allowHeadings: true,
        skipFirstBlock: false,
        indentDepth: this.state.nestDepth,
        quoteDepth: this.state.quoteDepth,
        pendingCells: null,
        onComplete: null,
      },
    ];
    const appendText = (tokens: Token[], raw: string, text: string) => {
      const previousToken = tokens[tokens.length - 1];
      if (previousToken?.type === "text" && !previousToken.tokens) {
        previousToken.raw += raw;
        previousToken.text += text;
      } else {
        tokens.push({ type: "text", raw, text });
      }
    };

    while (frameStack.length > 0) {
      while (this.pendingFrames.length > 0) {
        const childFrame = this.pendingFrames.pop()!;
        const parentFrame = frameStack[frameStack.length - 1];
        if (
          childFrame.sourceIndex === null &&
          parentFrame &&
          parentFrame.position >= parentFrame.source.length &&
          parentFrame.pendingCells === null &&
          parentFrame.onComplete === null
        ) {
          parentFrame.sourceIndex = null;
        }
        frameStack.push(childFrame);
      }

      const frame = frameStack[frameStack.length - 1];
      let sourceIndex = frame.sourceIndex;
      const needsIndex =
        frame.position < frame.source.length || frame.pendingCells !== null;
      if (sourceIndex === null && needsIndex) {
        sourceIndex = createSourceIndex(frame.source, macroNames);
        frame.sourceIndex = sourceIndex;
      }
      if (sourceIndex !== null) this.index = sourceIndex;
      this.state.wrap = frame.wrapParagraphs;
      this.state.nestDepth = frame.indentDepth;
      this.state.quoteDepth = frame.quoteDepth;

      if (frame.position >= frame.source.length) {
        if (frame.pendingCells !== null) {
          const cell = frame.pendingCells.cells.pop();
          const cellOffset = frame.pendingCells.offsets.pop() ?? -1;
          if (cell) {
            this.pendingFrames.push({
              mode: "block",
              source: cell.text,
              position: 0,
              tokens: cell.tokens,
              sourceOffset: cellOffset === -1 ? 0 : cellOffset,
              sourceIndex: cellOffset === -1 ? null : sourceIndex!,
              wrapParagraphs: true,
              allowHeadings: false,
              skipFirstBlock: true,
              indentDepth: frame.indentDepth,
              quoteDepth: frame.quoteDepth,
              pendingCells: null,
              onComplete: null,
            });
            continue;
          }
          frame.pendingCells = null;
        }
        frameStack.pop();
        if (frame.mode === "block" && !frame.wrapParagraphs) {
          const childTokens = frame.tokens;
          for (
            let tokenIndex = 0;
            tokenIndex < childTokens.length;
            tokenIndex++
          ) {
            const textToken = childTokens[tokenIndex];
            if (textToken.type !== "text" || !textToken.tokens) continue;
            const previousType = childTokens[tokenIndex - 1]?.type;
            const nextType = childTokens[tokenIndex + 1]?.type;
            textToken.blockBefore =
              previousType === "table" ||
              previousType === "list" ||
              previousType === "indent" ||
              previousType === "blockquote" ||
              previousType === "hr";
            textToken.blockAfter =
              nextType === "table" ||
              nextType === "list" ||
              nextType === "indent" ||
              nextType === "blockquote" ||
              nextType === "hr";
          }
        }
        if (frame.onComplete) {
          frame.onComplete();
        }
        continue;
      }

      const remainingSource = frame.source.slice(frame.position);
      const sourceOffset =
        frame.sourceOffset === -1 ? -1 : frame.sourceOffset + frame.position;

      let token: NamumarkToken | undefined;

      if (frame.mode === "block" && !frame.skipFirstBlock) {
        token = this.tokenizer.comment(remainingSource);
        if (token) {
          frame.position += token.raw.length;
          frame.tokens.push(token);
          continue;
        }

        if (frame.allowHeadings) {
          token = this.tokenizer.heading(remainingSource, sourceOffset);
          if (token) {
            frame.position += token.raw.length;
            frame.tokens.push(token);
            this.state.quoteDepth = 1;
            frame.quoteDepth = 1;
            continue;
          }
        }

        token = this.tokenizer.hr(remainingSource);
        if (token) {
          frame.position += token.raw.length;
          frame.tokens.push(token);
          continue;
        }

        token = this.tokenizer.blockquote(remainingSource, sourceOffset);
        if (token) {
          frame.position += token.raw.length;
          frame.tokens.push(token);
          continue;
        }

        token = this.tokenizer.list(remainingSource, sourceOffset);
        if (token) {
          frame.position += token.raw.length;
          frame.tokens.push(token);
          continue;
        }

        token = this.tokenizer.indent(remainingSource, sourceOffset);
        if (token) {
          frame.position += token.raw.length;
          frame.tokens.push(token);
          continue;
        }

        token = this.tokenizer.table(remainingSource, sourceOffset);
        if (token) {
          frame.position += token.raw.length;
          frame.tokens.push(token);
          continue;
        }
      }

      if (frame.mode === "block") {
        frame.skipFirstBlock = false;

        const rules = this.tokenizer.rules;
        let textEnd = this.lineEnd(remainingSource, 0, sourceOffset);
        while (textEnd < remainingSource.length) {
          const character = remainingSource[textEnd];
          if (character === "\n") {
            textEnd++;
            continue;
          }
          if (character === ">" || character === "|" || character === " ") {
            break;
          }
          if (
            character === "=" &&
            frame.allowHeadings &&
            rules.block.heading.test(remainingSource.slice(textEnd))
          ) {
            break;
          }
          if (
            character === "-" &&
            rules.block.hr.test(remainingSource.slice(textEnd))
          ) {
            break;
          }
          textEnd = this.lineEnd(remainingSource, textEnd, sourceOffset);
        }
        const textSource = remainingSource.slice(0, textEnd);
        frame.position += textSource.length;
        const tokens = frame.tokens;
        const previousToken = tokens[tokens.length - 1];
        const wrapperType = frame.wrapParagraphs ? "paragraph" : "text";
        if (
          previousToken?.type === wrapperType &&
          (frame.wrapParagraphs || previousToken.tokens)
        ) {
          previousToken.raw += textSource;
          previousToken.text += textSource;
          this.defer(textSource, sourceOffset, previousToken.tokens);
        } else {
          tokens.push({
            type: wrapperType,
            raw: textSource,
            text: textSource,
            tokens: this.defer(textSource, sourceOffset),
          });
        }
        continue;
      }


      const previousToken = frame.tokens[frame.tokens.length - 1];
      const atLineStart =
        !previousToken ||
        previousToken.type === "br" ||
        previousToken.type === "comment";
      if (atLineStart) {
        token = this.tokenizer.comment(remainingSource);
        if (token) {
          frame.position += token.raw.length;
          frame.tokens.push(token);
          continue;
        }
      }

      const previousCharacter = frame.source[frame.position - 1];
      token = this.tokenizer.commentLink(remainingSource, previousCharacter);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.escape(remainingSource);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.brace(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.inertBrackets(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        appendText(frame.tokens, token.raw, token.text);
        continue;
      }

      token = this.tokenizer.link(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.footnote(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.macro(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.mathTag(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.includeparam(remainingSource);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.strong(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.em(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.del(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.underline(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.sup(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.sub(remainingSource, sourceOffset);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.br(remainingSource);
      if (token) {
        frame.position += token.raw.length;
        frame.tokens.push(token);
        continue;
      }

      token = this.tokenizer.text(remainingSource);
      if (token) {
        frame.position += token.raw.length;
        appendText(frame.tokens, token.raw, token.text);
        continue;
      }

      appendText(frame.tokens, remainingSource[0], remainingSource[0]);
      frame.position++;
    }

    this.index = previousIndex;
    this.state.wrap = previousWrap;
    return this.tokens;
  }

  defer(src: string, offset: number, tokens: Token[] = []): Token[] {
    this.pendingFrames.push({
      mode: "inline",
      source: src,
      position: 0,
      tokens,
      sourceOffset: offset,
      sourceIndex: this.index,
      wrapParagraphs: this.state.wrap,
      allowHeadings: false,
      skipFirstBlock: false,
      indentDepth: this.state.nestDepth,
      quoteDepth: this.state.quoteDepth,
      pendingCells: null,
      onComplete: null,
    });
    return tokens;
  }

  deferBlock(src: string, options: BlockOptions): Token[];
  deferBlock(
    src: string,
    wrap: boolean,
    top: boolean,
    offset: number,
    skip?: boolean,
    spans?: SourceSpan[],
  ): Token[];
  deferBlock(
    src: string,
    optionsOrWrap: BlockOptions | boolean,
    top?: boolean,
    offset?: number,
    skip = false,
    spans?: SourceSpan[],
  ): Token[] {
    const options: BlockOptions =
      typeof optionsOrWrap === "boolean"
        ? {
            wrapParagraphs: optionsOrWrap,
            allowHeadings: top!,
            sourceOffset: offset!,
            skipFirstBlock: skip,
            spans,
          }
        : optionsOrWrap;
    const tokens: Token[] = [];
    const sourceIndex = options.spans
      ? mapSourceIndex(this.index, src, options.spans)
      : options.sourceOffset === -1
        ? null
        : this.index;
    this.pendingFrames.push({
      mode: "block",
      source: src,
      position: 0,
      tokens,
      sourceOffset:
        options.spans || options.sourceOffset === -1 ? 0 : options.sourceOffset,
      sourceIndex,
      wrapParagraphs: options.wrapParagraphs,
      allowHeadings: options.allowHeadings,
      skipFirstBlock: options.skipFirstBlock ?? false,
      indentDepth: options.indentDepth ?? this.state.nestDepth,
      quoteDepth: options.quoteDepth ?? this.state.quoteDepth,
      pendingCells: null,
      onComplete: null,
    });
    return tokens;
  }

  deferCells(
    cells: { text: string; tokens: Token[] }[],
    offsets: number[],
  ): void {
    this.pendingFrames.push({
      mode: "block",
      source: "",
      position: 0,
      tokens: [],
      sourceOffset: 0,
      sourceIndex: this.index,
      wrapParagraphs: true,
      allowHeadings: false,
      skipFirstBlock: false,
      indentDepth: this.state.nestDepth,
      quoteDepth: this.state.quoteDepth,
      pendingCells: { cells, offsets },
      onComplete: null,
    });
  }

  deferAfter(done: () => void): void {
    this.pendingFrames.push({
      mode: "block",
      source: "",
      position: 0,
      tokens: [],
      sourceOffset: 0,
      sourceIndex: this.index,
      wrapParagraphs: true,
      allowHeadings: false,
      skipFirstBlock: false,
      indentDepth: this.state.nestDepth,
      quoteDepth: this.state.quoteDepth,
      pendingCells: null,
      onComplete: done,
    });
  }

  lineEnd(src: string, start: number, offset = -1): number {
    const hasNewline =
      offset === -1
        ? src.indexOf("\n", start) !== -1
        : this.index.newlines.next(offset + start, offset + src.length) !== -1;
    if (!hasNewline) return src.length;
    let position = start;
    while (position < src.length) {
      const character = src[position];
      if (character === "\n") return position + 1;

      if (character === "\\" && src[position + 1] !== "\n") {
        position += 2;
        continue;
      }
      if (character === "{" && src.startsWith("{{{", position)) {
        const braceEnd = this.braceEnd(src, position, offset);
        if (braceEnd > position) {
          position = braceEnd;
          continue;
        }
        position += 3;
        continue;
      }
      if (
        character === "[" &&
        !src.startsWith("[[", position) &&
        src[position + 1] !== "*"
      ) {
        const macro = this.tokenizer.macro(
          src.slice(position),
          offset === -1 ? -1 : offset + position,
        );
        if (macro) {
          position += macro.raw.length;
          continue;
        }
      }
      position++;
    }
    return position;
  }

  braceEnd(src: string, at: number, offset = -1): number {
    const rawBodyLength = this.closingBrace(src, at, offset, false);
    if (rawBodyLength === -1) return -1;
    if (!isStyledBraceHead(src, at)) return at + 3 + rawBodyLength + 3;

    const styledBodyLength = this.closingBrace(src, at, offset, true);
    if (styledBodyLength === -1) return -1;
    return at + 3 + styledBodyLength + 3;
  }

  closingBrace(
    src: string,
    at: number,
    offset: number,
    abortOnHeading: boolean,
  ): number {
    const sourceIndex = this.index;
    const extent =
      offset === -1 ? undefined : sourceIndex.braces.get(offset + at);
    if (!extent) return findClosingBrace(src.slice(at + 3), abortOnHeading);

    const sourceEnd = offset + src.length;
    if (
      abortOnHeading &&
      sourceEnd < sourceIndex.source.length &&
      (extent.headingEnd > sourceEnd ||
        sourceIndex.source[sourceEnd - 1] === "=")
    ) {
      return findClosingBrace(src.slice(at + 3), abortOnHeading);
    }

    const closingPosition = extent.end;
    const closesWithinSource =
      closingPosition !== -1 && closingPosition + 3 <= sourceEnd;
    if (!closesWithinSource) return -1;
    if (
      abortOnHeading &&
      extent.headingAt !== -1 &&
      extent.headingAt < closingPosition
    ) {
      return -1;
    }
    return closingPosition - (offset + at + 3);
  }
}
