import type { Tokens } from './Tokens.ts';

/**
 * TextRenderer
 * returns only the textual part of the token
 */
export class _TextRenderer<RendererOutput = string> {
  // no need for block level renderers
  escape({ text }: Tokens.Escape): RendererOutput {
    return text as RendererOutput;
  }

  comment({ }: Tokens.Comment): RendererOutput {
    return '' as RendererOutput;
  }

  size({ raw }: Tokens.Size): RendererOutput {
    return raw as RendererOutput;
  }

  color({ raw }: Tokens.Color): RendererOutput {
    return raw as RendererOutput;
  }

  sub({ text }: Tokens.Sub): RendererOutput {
    return text as RendererOutput;
  }

  sup({ text }: Tokens.Sup): RendererOutput {
    return text as RendererOutput;
  }

  macro(): RendererOutput {
    return '' as RendererOutput;
  }

  strong({ text }: Tokens.Strong): RendererOutput {
    return text as RendererOutput;
  }

  em({ text }: Tokens.Em): RendererOutput {
    return text as RendererOutput;
  }

  codespan({ text }: Tokens.Codespan): RendererOutput {
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
    return '' + text as RendererOutput;
  }

  footnote({ text }: Tokens.Footnote): RendererOutput {
    return '' + text as RendererOutput;
  }

  br(): RendererOutput {
    return '' as RendererOutput;
  }
}
