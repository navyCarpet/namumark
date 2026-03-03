import type { MarkedOptions } from './MarkedOptions.ts';

/**
 * Gets the original marked default options.
 */
export function _getDefaults<ParserOutput = string, RendererOutput = string>(): MarkedOptions<ParserOutput, RendererOutput> {
  return {
    async: true,
    discuss: false,
    walkTokens: null,
  };
}

export let _defaults: MarkedOptions<any, any> = _getDefaults();

export function changeDefaults<ParserOutput = string, RendererOutput = string>(newDefaults: MarkedOptions<ParserOutput, RendererOutput>) {
  _defaults = newDefaults;
}
