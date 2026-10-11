import { _defaults, _getDefaults, changeDefaults } from "./defaults.ts";
import type { MaybePromise } from "./Instance.ts";
import { Namumark } from "./Instance.ts";
import { _Lexer } from "./lexer/Lexer.ts";
import type { NamumarkExtension, NamumarkOptions } from "./Options.ts";
import { _Parser } from "./renderer/Parser.ts";
import { _Renderer } from "./renderer/Renderer.ts";
import { _prepare, stripRaw } from "./prepare/prepare.ts";
import { _serialize } from "./edit/Serializer.ts";
import { _TextRenderer } from "./renderer/TextRenderer.ts";
import { _Tokenizer } from "./lexer/Tokenizer.ts";
import type { Token, TokensList } from "./Tokens.ts";

const namumarkInstance = new Namumark();

/**
 * 나무마크를 비동기로 HTML로 컴파일합니다.
 *
 * @param src 컴파일할 나무마크 원문
 * @param options async: true가 포함된 옵션
 * @return 컴파일된 HTML 문자열의 Promise
 */
export function namumark(
  src: string,
  options: NamumarkOptions & { async: true },
): Promise<string>;

/**
 * 나무마크를 HTML로 컴파일합니다.
 *
 * @param src 컴파일할 나무마크 원문
 * @param options async: false를 포함한 옵션
 * @return 컴파일된 HTML 문자열. 비동기를 요구하는 확장이 등록되어 있으면 이 호출은 오류가 됩니다.
 */
export function namumark(
  src: string,
  options: NamumarkOptions & { async: false },
): string;
export function namumark(
  src: string,
  options?: NamumarkOptions | null,
): string | Promise<string>;
export function namumark(
  src: string,
  opt?: NamumarkOptions | null,
): string | Promise<string> {
  return namumarkInstance.parse(src, opt);
}

/**
 * 기본 옵션을 지정합니다. 인스턴스와 모듈 전역 `_defaults`를 함께 갱신하므로,
 * 이후 옵션 없이 호출한 모든 API가 이 값을 따릅니다.
 *
 * @param options 옵션 묶음
 */
namumark.options = namumark.setOptions = function (options: NamumarkOptions) {
  namumarkInstance.setOptions(options);
  namumark.defaults = namumarkInstance.defaults;
  changeDefaults(namumark.defaults);
  return namumark;
};

/**
 * 손대지 않은 원래 기본 옵션을 돌려줍니다.
 */
namumark.getDefaults = _getDefaults;

namumark.defaults = _defaults;

/**
 * 확장 등록
 *
 * 확장을 등록합니다. 넘긴 설정들이 기본 옵션에 병합되고, walkTokens는 덮어쓰지
 * 않고 차례로 쌓입니다.
 */

namumark.use = function (...args: NamumarkExtension[]) {
  namumarkInstance.use(...args);
  namumark.defaults = namumarkInstance.defaults;
  changeDefaults(namumark.defaults);
  return namumark;
};

/**
 * 토큰마다 방문 함수 실행
 *
 * 토큰 트리를 깊이 우선으로 훑으며 모든 토큰마다 콜백을 실행합니다.
 */

namumark.walkTokens = function (
  tokens: Token[] | TokensList,
  callback: (token: Token) => MaybePromise | MaybePromise[],
) {
  return namumarkInstance.walkTokens(tokens, callback);
};

/**
 * Expose
 *
 * 내부 구성요소를 함수 객체에 그대로 얹어 밖에서 갈아끼우거나 직접 쓸 수 있게
 * 합니다.
 */
namumark.Parser = _Parser;
namumark.parser = _Parser.parse;
namumark.Renderer = _Renderer;
namumark.TextRenderer = _TextRenderer;
namumark.Lexer = _Lexer;
namumark.lexer = _Lexer.lex;
namumark.Tokenizer = _Tokenizer;
namumark.parse = namumark;

/**
 * 토큰 트리를 다시 나무마크 원문으로 직렬화합니다. `{ reformat: true }`를 주면
 * 모든 토큰을 표준형으로 새로 만들고, 그렇지 않으면 손대지 않은 토큰은 원문
 * 그대로 내보내므로 편집 결과의 diff가 최소로 남습니다.
 */
namumark.serialize = _serialize;

/**
 * `src`를 렉싱한 뒤 표준형으로 다시 직렬화합니다 — 즉 문법 포매터입니다.
 */
namumark.format = function (src: string): string {
  return _serialize(_Lexer.lex(src), { reformat: true });
};

/**
 * 파싱 직전 단계입니다. 문단·각주 번호를 매기고, `#!if` 엔진을 돌리고, `@param@`
 * 참조를 풉니다. 토큰 트리를 그 자리에서 고쳐 돌려주며 `raw`는 남겨 둡니다.
 */
namumark.prepare = _prepare;

/**
 * 렉싱 + prepare 후 `raw`를 떼어 내, 프런트엔드(예: Vue)가 원문을 드러내지 않고
 * 바로 그릴 수 있는 렌더링 준비된 토큰 배열을 돌려줍니다.
 */
namumark.tokens = function (
  src: string,
  options?: NamumarkOptions | null,
): TokensList {
  const opt = { ..._defaults, ...options };
  const tokens = _Lexer.lex(src, opt);
  const prepared = _prepare(tokens, opt);
  stripRaw(prepared);
  return prepared;
};

export const options = namumark.options;
export const setOptions = namumark.setOptions;
export const use = namumark.use;
export const walkTokens = namumark.walkTokens;
export const parse = namumark;
export const parser = _Parser.parse;
export const lexer = _Lexer.lex;
export const format = namumark.format;
export const tokens = namumark.tokens;
export { _serialize as serialize } from "./edit/Serializer.ts";
export {
  evaluateIfs,
  _prepare as prepare,
  stripRaw,
} from "./prepare/prepare.ts";
export { evaluate, Scope } from "./prepare/Expression.ts";
export type { Value } from "./prepare/Expression.ts";
export {
  transform,
  update,
  createText,
  createLink,
  createMacro,
  renameLink,
  replaceText,
} from "./edit/edit.ts";
export type { EditContext } from "./edit/edit.ts";
export {
  _defaults as defaults,
  _getDefaults as getDefaults,
} from "./defaults.ts";
export { Namumark } from "./Instance.ts";
export { _Lexer as Lexer } from "./lexer/Lexer.ts";
export type * from "./Options.ts";
export { _Parser as Parser } from "./renderer/Parser.ts";
export { _Renderer as Renderer } from "./renderer/Renderer.ts";
export { _TextRenderer as TextRenderer } from "./renderer/TextRenderer.ts";
export { _Tokenizer as Tokenizer } from "./lexer/Tokenizer.ts";
export type * from "./Tokens.ts";
