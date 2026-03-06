import { _Tokenizer } from './Tokenizer.ts';
import { _defaults } from './defaults.ts';
import { other, block, inline } from './rules.ts';
import type { Token, TokensList, Tokens, Headings, Footnotes } from './Tokens.ts';
import type { MarkedOptions } from './MarkedOptions.ts';

/**
 * Block Lexer
 */
export class _Lexer<ParserOutput = string, RendererOutput = string> {
  tokens: TokensList;
  options: MarkedOptions<ParserOutput, RendererOutput>;
  state: {
    inParagraph: boolean;
    top: boolean;
    endInline: boolean;
    inLiteral: boolean;
  };

  private tokenizer: _Tokenizer<ParserOutput, RendererOutput>;

  constructor(options?: MarkedOptions<ParserOutput, RendererOutput>) {
    // TokenList cannot be created in one go
    this.tokens = [] as unknown as TokensList;
    this.tokens.headings = [] as Headings;
    this.tokens.footnotes = [] as Footnotes;
    this.options = options || _defaults;
    this.tokenizer = new _Tokenizer<ParserOutput, RendererOutput>();
    this.tokenizer.options = this.options;
    this.tokenizer.lexer = this;
    this.state = {
      inParagraph: false,
      top: true,
      endInline: false,
      inLiteral: false,
    };

    this.tokenizer.rules = {
      other,
      block,
      inline,
    };
  }

  /**
   * Expose Rules
   */
  static get rules() {
    return {
      block,
      inline,
    };
  }

  /**
   * Static Lex Method
   */
  static lex<ParserOutput = string, RendererOutput = string>(src: string, options?: MarkedOptions<ParserOutput, RendererOutput>) {
    const lexer = new _Lexer<ParserOutput, RendererOutput>(options);
    return lexer.lex(src);
  }

  /**
   * Preprocessing
   */
  lex(src: string) {
    src = src.replace(other.carriageReturn, '\n');

    this.blockTokens(src, this.tokens);

    return this.tokens;
  }

  /**
   * Lexing
   */
  blockTokens(src: string, tokens?: Token[], skip?: boolean): Token[];
  blockTokens(src: string, tokens?: TokensList, skip?: boolean): TokensList;
  blockTokens(src: string, tokens: Token[] = [], skip?: boolean) {
    const prevTop = this.state.top;
    try {
      while (src) {
        let token: Tokens.Generic | undefined;

        if (!skip) {
          // heading
          if (this.state.top && (token = this.tokenizer.heading(src))) {
            src = src.substring(token.raw.length);
            this.tokens.headings.push(token as Tokens.Heading);
            tokens.push(token);
            continue;
          }

          // hr
          if (token = this.tokenizer.hr(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }

          // blockquote
          if (token = this.tokenizer.blockquote(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }

          // list
          if (token = this.tokenizer.list(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }

          // table
          if (token = this.tokenizer.table(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }

          // indent
          if (token = this.tokenizer.indent(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
        }

        // paragraph
        if (token = this.tokenizer.paragraph(src)) {
          const lastToken = tokens.at(-1);
          if (lastToken?.type === token.type) {
            if (lastToken.type === 'paragraph') {
              lastToken.raw += token.raw;
              lastToken.text += token.text;
              lastToken.tokens = [...lastToken.tokens!, ...token.tokens!];
            } else if (lastToken.type === 'text') {
              lastToken.raw += token.raw;
              lastToken.text += token.text;
            }
          } else {
            tokens.push(token);
          }
          src = src.substring(token.raw.length);
          skip = false;
          continue;
        }

        if (src) {
          const errMsg = 'Infinite loop on byte: ' + src.charCodeAt(0);
          throw new Error(errMsg);
        }
      }
    } finally {
      this.state.top = prevTop;
    }

    return tokens;
  }

  /**
   * Lexing/Compiling
   */
  inlineTokens(src: string, end: RegExp = /^\n/, tokens: Token[] = []): { raw: string, tokens: Token[] } {
    let raw = src;

    while (src) {
      let token: Tokens.Generic | undefined;

      if (end.test(src)) {
        this.state.endInline = true;
        break;
      }

      // literal
      if (token = this.tokenizer.braces(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }

      if (!this.state.inLiteral) {
        // escape
        if (token = this.tokenizer.escape(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // comment
        if (token = this.tokenizer.comment(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // newline
        if (token = this.tokenizer.newline(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // link
        if (token = this.tokenizer.link(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // footnote
        if (token = this.tokenizer.footnote(src)) {
          src = src.substring(token.raw.length);
          this.tokens.footnotes.push(token as Tokens.Footnote);
          tokens.push(token);
          continue;
        }

        // macro
        if (token = this.tokenizer.macro(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // sub
        if (token = this.tokenizer.sub(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // sup
        if (token = this.tokenizer.sup(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // strong
        if (token = this.tokenizer.strong(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // em
        if (token = this.tokenizer.em(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // del
        if (token = this.tokenizer.del(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }

        // underline
        if (token = this.tokenizer.underline(src)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          continue;
        }
      }

      // text
      if (token = this.tokenizer.inlineText(src, end)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (lastToken?.type === 'text') {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }

      if (src) {
        const errMsg = 'Infinite loop on byte: ' + src.charCodeAt(0);
        throw new Error(errMsg);
      }
    }

    raw = raw.slice(0, raw.length - src.length);

    return { raw, tokens };
  }
}
