import type { Token, Tokens, TokensList } from './Tokens.ts';
import type { _Parser } from './Parser.ts';
import type { _Lexer } from './Lexer.ts';
import type { _Renderer } from './Renderer.ts';
import type { _Tokenizer } from './Tokenizer.ts';

export interface TokenizerThis {
  lexer: _Lexer;
}

export type TokenizerExtensionFunction = (this: TokenizerThis, src: string, tokens: Token[] | TokensList) => Tokens.Generic | undefined;

export type TokenizerStartFunction = (this: TokenizerThis, src: string) => number | void;

export interface TokenizerExtension {
  name: string;
  level: 'block' | 'inline';
  start?: TokenizerStartFunction;
  tokenizer: TokenizerExtensionFunction;
  childTokens?: string[];
}

export interface RendererThis<ParserOutput = string, RendererOutput = string> {
  parser: _Parser<ParserOutput, RendererOutput>;
}

export type RendererExtensionFunction<ParserOutput = string, RendererOutput = string> = (this: RendererThis<ParserOutput, RendererOutput>, token: Tokens.Generic) => RendererOutput | false | undefined;

export interface RendererExtension<ParserOutput = string, RendererOutput = string> {
  name: string;
  renderer: RendererExtensionFunction<ParserOutput, RendererOutput>;
}

export type TokenizerAndRendererExtension<ParserOutput = string, RendererOutput = string> = TokenizerExtension | RendererExtension<ParserOutput, RendererOutput> | (TokenizerExtension & RendererExtension<ParserOutput, RendererOutput>);

type RendererApi<ParserOutput = string, RendererOutput = string> = Omit<_Renderer<ParserOutput, RendererOutput>, 'constructor' | 'options' | 'parser'>;
type RendererObject<ParserOutput = string, RendererOutput = string> = {
  [K in keyof RendererApi<ParserOutput, RendererOutput>]?: (this: _Renderer<ParserOutput, RendererOutput>, ...args: Parameters<RendererApi<ParserOutput, RendererOutput>[K]>) => ReturnType<RendererApi<ParserOutput, RendererOutput>[K]> | false
};

type TokenizerApi<ParserOutput = string, RendererOutput = string> = Omit<_Tokenizer<ParserOutput, RendererOutput>, 'constructor' | 'options' | 'rules' | 'lexer'>;
type TokenizerObject<ParserOutput = string, RendererOutput = string> = {
  [K in keyof TokenizerApi<ParserOutput, RendererOutput>]?: (this: _Tokenizer<ParserOutput, RendererOutput>, ...args: Parameters<TokenizerApi<ParserOutput, RendererOutput>[K]>) => ReturnType<TokenizerApi<ParserOutput, RendererOutput>[K]> | false
};

export interface MarkedExtension<ParserOutput = string, RendererOutput = string> {
  /**
   * True will tell marked to await any walkTokens functions before parsing the tokens and returning an HTML string.
   */
  async?: boolean;

  /**
   * is discuss
   */
  discuss?: boolean;

  /**
   * The walkTokens function gets called with every token.
   * Child tokens are called before moving on to sibling tokens.
   * Each token is passed by reference so updates are persisted when passed to the parser.
   * The return value of the function is ignored.
   */
  walkTokens?: ((token: Token) => void | Promise<void>) | null;
}

export interface MarkedOptions<ParserOutput = string, RendererOutput = string> extends Omit<MarkedExtension<ParserOutput, RendererOutput>, 'hooks' | 'renderer' | 'tokenizer' | 'extensions' | 'walkTokens'> {
  /**
   * walkTokens function returns array of values for Promise.all
   */
  walkTokens?: null | ((token: Token) => void | Promise<void> | (void | Promise<void>)[]);
}
