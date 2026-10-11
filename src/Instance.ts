import { _getDefaults } from "./defaults.ts";
import { escapeHtmlEntities, walkTokens } from "./helpers.ts";
import { _Lexer } from "./lexer/Lexer.ts";
import type { NamumarkExtension, NamumarkOptions } from "./Options.ts";
import { _Parser } from "./renderer/Parser.ts";
import { _prepare } from "./prepare/prepare.ts";
import { _Renderer } from "./renderer/Renderer.ts";
import { _TextRenderer } from "./renderer/TextRenderer.ts";
import { _Tokenizer } from "./lexer/Tokenizer.ts";
import type { Token, TokensList } from "./Tokens.ts";

export type MaybePromise = void | Promise<void>;

export class Namumark<ParserOutput = string, RendererOutput = string> {
  defaults = _getDefaults();
  private asyncByExtension = false;
  options = this.setOptions;

  /**
   * Compiles namumark to HTML.
   *
   * To configure hooks, a renderer, or a tokenizer, create a separate `Namumark`
   * instance and use `Namumark#use` instead of passing them on each call.
   */
  parse = this.parseNamumark();

  Parser = _Parser<ParserOutput, RendererOutput>;
  Renderer = _Renderer<ParserOutput, RendererOutput>;
  TextRenderer = _TextRenderer<RendererOutput>;
  Lexer = _Lexer;
  Tokenizer = _Tokenizer;

  constructor(...args: NamumarkExtension[]) {
    this.use(...args);
  }

  walkTokens(
    tokens: Token[] | TokensList,
    callback: (token: Token) => MaybePromise | MaybePromise[],
  ) {
    const values: MaybePromise[] = [];
    walkTokens(tokens, (token) => {
      const value = callback.call(this, token);
      if (Array.isArray(value)) {
        for (const v of value) {
          values.push(v);
        }
      } else {
        values.push(value);
      }
    });
    return values;
  }

  /**
   * Registers extensions with this Namumark instance.
   *
   * The `renderer`, `tokenizer`, and `hooks` objects may each contain only the
   * methods that should be overridden. Their methods are merged with built-in
   * behavior and extensions registered by earlier calls.
   *
   * Use this method when supplying only some hook methods.
   */
  use(...args: NamumarkExtension[]) {
    args.forEach((pack) => {
      // copy options to new object
      const opts = { ...pack } as NamumarkOptions;

      // set async to true if it was set to true before
      opts.async = this.defaults.async || opts.async || false;
      if (pack.async === true) this.asyncByExtension = true;

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

  setOptions(opt: NamumarkOptions) {
    this.defaults = { ...this.defaults, ...opt };
    return this;
  }

  lexer(src: string, options?: NamumarkOptions) {
    return _Lexer.lex(src, options ?? this.defaults);
  }

  parser(tokens: Token[], options?: NamumarkOptions) {
    return _Parser.parse<ParserOutput, RendererOutput>(
      tokens,
      options ?? this.defaults,
    );
  }

  private parseNamumark() {
    type overloadedParse = {
      (
        src: string,
        options: NamumarkOptions & { async: true },
      ): Promise<ParserOutput>;
      (src: string, options: NamumarkOptions & { async: false }): ParserOutput;
      (
        src: string,
        options?: NamumarkOptions | null,
      ): ParserOutput | Promise<ParserOutput>;
    };

    const parse: overloadedParse = (
      src: string,
      options?: NamumarkOptions | null,
    ): any => {
      const opt = { ...this.defaults, ...options };

      const throwError = this.onError(!!opt.silent, !!opt.async);

      if (this.asyncByExtension && !opt.async) {
        return throwError(
          new Error(
            "namumark(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise.",
          ),
        );
      }

      if (typeof src === "undefined" || src === null) {
        return throwError(
          new Error("namumark(): input parameter is undefined or null"),
        );
      }
      if (typeof src !== "string") {
        return throwError(
          new Error(
            "namumark(): input parameter is of type " +
              Object.prototype.toString.call(src) +
              ", string expected",
          ),
        );
      }

      if (opt.async) {
        return (async () => {
          const lexer = _Lexer.lex;
          const tokens = await lexer(src, opt);
          _prepare(tokens, opt);
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
        const tokens = lexer(src, opt);
        _prepare(tokens, opt);
        if (opt.walkTokens) {
          this.walkTokens(tokens, opt.walkTokens);
        }
        const parser = _Parser.parse;
        return parser(tokens, opt);
      } catch (e) {
        return throwError(e);
      }
    };

    return parse;
  }

  private onError(silent: boolean, async: boolean) {
    return (cause: unknown): string | Promise<string> => {
      const message =
        (cause instanceof Error ? cause.message : String(cause)) +
        "\nPlease report this to https://github.com/navyCarpet/namumark.";
      const error = new Error(message, { cause });

      if (silent) {
        const msg =
          "<p>An error occurred:</p><pre>" +
          escapeHtmlEntities(message, true) +
          "</pre>";
        if (async) {
          return Promise.resolve(msg);
        }
        return msg;
      }

      if (async) {
        return Promise.reject(error);
      }
      throw error;
    };
  }
}
