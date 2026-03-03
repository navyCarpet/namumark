import { _getDefaults } from './defaults.ts';
import { _Lexer } from './Lexer.ts';
import { _Parser } from './Parser.ts';
import { _Renderer } from './Renderer.ts';
import { _Tokenizer } from './Tokenizer.ts';
import { _TextRenderer } from './TextRenderer.ts';
import { escape } from './helpers.ts';
import type { MarkedExtension, MarkedOptions } from './MarkedOptions.ts';
import type { Token, Tokens, TokensList } from './Tokens.ts';

export type MaybePromise = void | Promise<void>;

type UnknownFunction = (...args: unknown[]) => unknown;
type GenericRendererFunction = (...args: unknown[]) => string | false;

export class Marked<ParserOutput = string, RendererOutput = string> {
  defaults = _getDefaults<ParserOutput, RendererOutput>();
  options = this.setOptions;

  parse = this.parseNamumark();

  Parser = _Parser<ParserOutput, RendererOutput>;
  Renderer = _Renderer<ParserOutput, RendererOutput>;
  TextRenderer = _TextRenderer<RendererOutput>;
  Lexer = _Lexer;
  Tokenizer = _Tokenizer<ParserOutput, RendererOutput>;

  constructor(...args: MarkedExtension<ParserOutput, RendererOutput>[]) {
    this.use(...args);
  }

  /**
   * Run callback for every token
   */
  walkTokens(tokens: Token[] | TokensList, callback: (token: Token) => MaybePromise | MaybePromise[]) {
    let values: MaybePromise[] = [];
    for (const token of tokens) {
      values = values.concat(callback.call(this, token));
      switch (token.type) {
        case 'table': {
          const tableToken = token as Tokens.Table;
          for (const row of tableToken.rows) {
            for (const cell of row) {
              values = values.concat(this.walkTokens(cell.tokens, callback));
            }
          }
          break;
        }
        case 'list': {
          const listToken = token as Tokens.List;
          values = values.concat(this.walkTokens(listToken.items, callback));
          break;
        }
        default: {
          const genericToken = token as Tokens.Generic;
          if (genericToken.tokens) {
            values = values.concat(this.walkTokens(genericToken.tokens, callback));
          }
        }
      }
    }
    return values;
  }

  use(...args: MarkedExtension<ParserOutput, RendererOutput>[]) {
    args.forEach((pack) => {
      // copy options to new object
      const opts = { ...pack } as MarkedOptions<ParserOutput, RendererOutput>;

      // set async to true if it was set to true before
      opts.async = this.defaults.async || opts.async || false;

      // ==-- Parse WalkTokens extensions --== //
      if (pack.walkTokens) {
        const walkTokens = this.defaults.walkTokens;
        const packWalktokens = pack.walkTokens;
        opts.walkTokens = function (token) {
          let values: MaybePromise[] = [];
          values.push(packWalktokens.call(this, token));
          if (walkTokens) {
            values = values.concat(walkTokens.call(this, token));
          }
          return values;
        };
      }

      this.defaults = { ...this.defaults, ...opts };
    });

    return this;
  }

  setOptions(opt: MarkedOptions<ParserOutput, RendererOutput>) {
    this.defaults = { ...this.defaults, ...opt };
    return this;
  }

  lexer(src: string, options?: MarkedOptions<ParserOutput, RendererOutput>) {
    return _Lexer.lex(src, options ?? this.defaults);
  }

  parser(tokens: Token[], options?: MarkedOptions<ParserOutput, RendererOutput>) {
    return _Parser.parse<ParserOutput, RendererOutput>(tokens, options ?? this.defaults);
  }

  private parseNamumark() {
    type overloadedParse = {
      (src: string, options: MarkedOptions<ParserOutput, RendererOutput> & { async: true }): Promise<ParserOutput>;
      (src: string, options: MarkedOptions<ParserOutput, RendererOutput> & { async: false }): ParserOutput;
      (src: string, options?: MarkedOptions<ParserOutput, RendererOutput> | null): ParserOutput | Promise<ParserOutput>;
    };

    const parse: overloadedParse = (src: string, options?: MarkedOptions<ParserOutput, RendererOutput> | null): any => {
      const origOpt = { ...options };
      const opt = { ...this.defaults, ...origOpt };

      const throwError = this.onError();

      // throw error if an extension set async to true but parse was called with async: false
      if (this.defaults.async === true && origOpt.async === false) {
        return throwError(new Error('marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise.'));
      }

      // throw error in case of non string input
      if (typeof src === 'undefined' || src === null) {
        return throwError(new Error('marked(): input parameter is undefined or null'));
      }
      if (typeof src !== 'string') {
        return throwError(new Error('marked(): input parameter is of type '
          + Object.prototype.toString.call(src) + ', string expected'));
      }

      if (opt.async) {
        return (async () => {
          const lexer = _Lexer.lex;
          const tokens = await lexer(src, opt);
          if (opt.walkTokens) {
            await Promise.all(this.walkTokens(tokens, opt.walkTokens));
          }
          const parser = _Parser.parse;
          const html = await parser(tokens, opt);
          return html;
        })().catch(throwError);
      }

      try {
        const lexer = _Lexer.lex;
        let tokens = lexer(src, opt);
        if (opt.walkTokens) {
          this.walkTokens(tokens, opt.walkTokens);
        }
        const parser = _Parser.parse;
        let html = parser(tokens, opt);
        return html;
      } catch (e) {
        return throwError(e as Error);
      }
    };

    return parse;
  }

  private onError() {
    return (e: Error): string | Promise<string> => {
      return Promise.reject(e);
    };
  }
}
