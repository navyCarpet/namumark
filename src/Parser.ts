import { _Renderer } from './Renderer.ts';
import { _TextRenderer } from './TextRenderer.ts';
import { _defaults } from './defaults.ts';
import type { MarkedToken, Token, Tokens } from './Tokens.ts';
import type { MarkedOptions } from './MarkedOptions.ts';

/**
 * Parsing & Compiling
 */
export class _Parser<ParserOutput = string, RendererOutput = string> {
  options: MarkedOptions<ParserOutput, RendererOutput>;
  renderer: _Renderer<ParserOutput, RendererOutput>;
  textRenderer: _TextRenderer<RendererOutput>;
  constructor(options?: MarkedOptions<ParserOutput, RendererOutput>) {
    this.options = options || _defaults;
    this.renderer = new _Renderer<ParserOutput, RendererOutput>();
    this.renderer.options = this.options;
    this.renderer.parser = this;
    this.textRenderer = new _TextRenderer<RendererOutput>();
  }

  /**
   * Static Parse Method
   */
  static parse<ParserOutput = string, RendererOutput = string>(tokens: Token[], options?: MarkedOptions<ParserOutput, RendererOutput>) {
    const parser = new _Parser<ParserOutput, RendererOutput>(options);
    return parser.parse(tokens);
  }

  /**
   * Parse Loop
   */
  parse(tokens: Token[], top = true): ParserOutput {
    let out = '';

    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];

      const token = anyToken as MarkedToken;

      switch (token.type) {
        case 'hr': {
          out += this.renderer.hr(token);
          continue;
        }
        case 'heading': {
          out += this.renderer.heading(token);
          continue;
        }
        case 'code': {
          out += this.renderer.code(token);
          continue;
        }
        case 'table': {
          out += this.renderer.table(token);
          continue;
        }
        case 'blockquote': {
          out += this.renderer.blockquote(token);
          continue;
        }
        case 'list': {
          out += this.renderer.list(token);
          continue;
        }
        case 'indent': {
          out += this.renderer.indent(token);
          continue;
        }
        case 'paragraph': {
          out += this.renderer.paragraph(token);
          continue;
        }
        case 'escape': {
          out += this.renderer.escape(token);
          continue;
        }
        case 'comment': {
          out += this.renderer.comment(token);
          continue;
        }
        case 'literal': {
          out += this.renderer.literal(token);
          continue;
        }
        case 'style': {
          out += this.renderer.style(token);
          continue;
        }
        case 'size': {
          out += this.renderer.size(token);
          continue;
        }
        case 'color': {
          out += this.renderer.color(token);
          continue;
        }
        case 'folding': {
          out += this.renderer.folding(token);
          continue;
        }
        case 'space': {
          out += this.renderer.space(token);
          continue;
        }
        case 'link': {
          out += this.renderer.link(token);
          break;
        }
        case 'footnote': {
          out += this.renderer.footnote(token);
          break;
        }
        case 'macro': {
          out += this.renderer.macro(token);
          break;
        }
        case 'sub': {
          out += this.renderer.sub(token);
          break;
        }
        case 'sup': {
          out += this.renderer.sup(token);
          break;
        }
        case 'strong': {
          out += this.renderer.strong(token);
          break;
        }
        case 'em': {
          out += this.renderer.em(token);
          break;
        }
        case 'underline': {
          out += this.renderer.underline(token);
          break;
        }
        case 'codespan': {
          out += this.renderer.codespan(token);
          break;
        }
        case 'br': {
          out += this.renderer.br(token);
          break;
        }
        case 'del': {
          out += this.renderer.del(token);
          break;
        }
        case 'text': {
          out += this.renderer.text(token);
          break;
          // let textToken = token;
          // let body = this.renderer.text(textToken) as string;
          // while (i + 1 < tokens.length && tokens[i + 1].type === 'text') {
          //   textToken = tokens[++i] as Tokens.Text;
          //   body += ('\n' + this.renderer.text(textToken));
          // }
          // if (top) {
          //   out += this.renderer.paragraph({
          //     type: 'paragraph',
          //     raw: body,
          //     text: body,
          //     tokens: [{ type: 'text', raw: body, text: body, escaped: true }],
          //   });
          // } else {
          //   out += body;
          // }
          // continue;
        }

        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          throw new Error(errMsg);
        }
      }
    }

    return out as ParserOutput;
  }

  /**
   * Parse Inline Tokens
   */
  parseInline(tokens: Token[], renderer: _Renderer<ParserOutput, RendererOutput> | _TextRenderer<RendererOutput> = this.renderer): ParserOutput {
    let out = '';

    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];

      const token = anyToken as MarkedToken;

      switch (token.type) {
        case 'escape': {
          out += renderer.escape(token);
          continue;
        }
        case 'comment': {
          out += renderer.comment(token);
          continue;
        }
        case 'literal': {
          out += this.renderer.literal(token);
          continue;
        }
        case 'style': {
          out += this.renderer.style(token);
          continue;
        }
        case 'size': {
          out += this.renderer.size(token);
          continue;
        }
        case 'folding': {
          out += this.renderer.folding(token);
          continue;
        }
        case 'color': {
          out += this.renderer.color(token);
          continue;
        }
        case 'space': {
          out += this.renderer.space(token);
          continue;
        }
        case 'link': {
          out += renderer.link(token);
          break;
        }
        case 'footnote': {
          out += renderer.footnote(token);
          break;
        }
        case 'macro': {
          out += renderer.macro(token);
          break;
        }
        case 'sub': {
          out += renderer.sub(token);
          break;
        }
        case 'sup': {
          out += renderer.sup(token);
          break;
        }
        case 'strong': {
          out += renderer.strong(token);
          break;
        }
        case 'em': {
          out += renderer.em(token);
          break;
        }
        case 'underline': {
          out += renderer.underline(token);
          break;
        }
        case 'codespan': {
          out += renderer.codespan(token);
          break;
        }
        case 'br': {
          out += renderer.br(token);
          break;
        }
        case 'del': {
          out += renderer.del(token);
          break;
        }
        case 'text': {
          out += renderer.text(token);
          break;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          throw new Error(errMsg);
        }
      }
    }
    return out as ParserOutput;
  }
}
