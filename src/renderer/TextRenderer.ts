import { headingText } from "../prepare/metadata.ts";
import type { Tokens } from "../Tokens.ts";

export class _TextRenderer<RendererOutput = string> {
  escape({ text }: Tokens.Escape): RendererOutput {
    return text as RendererOutput;
  }

  comment(_token: Tokens.Comment): RendererOutput {
    return "" as RendererOutput;
  }

  literal(_token: Tokens.Literal): RendererOutput {
    return "" as RendererOutput;
  }

  latex(_token: Tokens.Latex): RendererOutput {
    return "" as RendererOutput;
  }

  html(_token: Tokens.Html): RendererOutput {
    return "" as RendererOutput;
  }

  code(_token: Tokens.Code): RendererOutput {
    return "" as RendererOutput;
  }

  globalstyle(_token: Tokens.GlobalStyle): RendererOutput {
    return "" as RendererOutput;
  }

  style({ tokens }: Tokens.Style): RendererOutput {
    return headingText(tokens) as RendererOutput;
  }

  space(_token: Tokens.Space): RendererOutput {
    return "" as RendererOutput;
  }

  size({ raw }: Tokens.Size): RendererOutput {
    return raw as RendererOutput;
  }

  color({ raw }: Tokens.Color): RendererOutput {
    return raw as RendererOutput;
  }

  folding({ text }: Tokens.Folding): RendererOutput {
    return text as RendererOutput;
  }

  if({ show, tokens }: Tokens.If): RendererOutput {
    return (show ? headingText(tokens) : "") as RendererOutput;
  }

  sub({ text }: Tokens.Sub): RendererOutput {
    return text as RendererOutput;
  }

  sup({ text }: Tokens.Sup): RendererOutput {
    return text as RendererOutput;
  }

  macro(): RendererOutput {
    return "" as RendererOutput;
  }

  includeparam({ fallback, resolved }: Tokens.IncludeParam): RendererOutput {
    if (resolved !== undefined) return resolved as RendererOutput;
    return (fallback ?? "") as RendererOutput;
  }

  strong({ text }: Tokens.Strong): RendererOutput {
    return text as RendererOutput;
  }

  em({ text }: Tokens.Em): RendererOutput {
    return text as RendererOutput;
  }

  del({ text }: Tokens.Del): RendererOutput {
    return text as RendererOutput;
  }

  underline({ text }: Tokens.Underline): RendererOutput {
    return text as RendererOutput;
  }

  text({ text }: Tokens.Text | Tokens.Escape): RendererOutput {
    return text as RendererOutput;
  }

  link({ text }: Tokens.Link): RendererOutput {
    return ("" + text) as RendererOutput;
  }

  commentlink({ text }: Tokens.CommentLink): RendererOutput {
    return text as RendererOutput;
  }

  footnote({ text }: Tokens.Footnote): RendererOutput {
    return ("" + text) as RendererOutput;
  }

  br(): RendererOutput {
    return "" as RendererOutput;
  }
}
