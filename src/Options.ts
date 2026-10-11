import type { Token } from "./Tokens.ts";

export interface NamumarkExtension {
  async?: boolean;
  silent?: boolean;
  discuss?: boolean;
  walkTokens?: ((token: Token) => void | Promise<void>) | null;
  parameters?: Record<string, string>;
  prefix?: string;
  title?: string;
}

export interface NamumarkOptions extends Omit<NamumarkExtension, "walkTokens"> {
  walkTokens?:
    | null
    | ((token: Token) => void | Promise<void> | (void | Promise<void>)[]);
}
