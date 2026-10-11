import type { NamumarkOptions } from "./Options.ts";

export function _getDefaults(): NamumarkOptions {
  return {
    async: false,
    silent: false,
    discuss: false,
    walkTokens: null,
  };
}

export let _defaults: NamumarkOptions = _getDefaults();

export function changeDefaults(newDefaults: NamumarkOptions) {
  _defaults = newDefaults;
}
