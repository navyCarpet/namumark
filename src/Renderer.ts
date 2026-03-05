import { _defaults } from './defaults.ts';
import {
  cleanUrl,
  escape,
} from './helpers.ts';
import { other } from './rules.ts';
import type { MarkedOptions } from './MarkedOptions.ts';
import type { Tokens } from './Tokens.ts';
import type { _Parser } from './Parser.ts';

/**
 * Renderer
 */
export class _Renderer<ParserOutput = string, RendererOutput = string> {
  options: MarkedOptions<ParserOutput, RendererOutput>;
  parser!: _Parser<ParserOutput, RendererOutput>; // set by the parser
  constructor(options?: MarkedOptions<ParserOutput, RendererOutput>) {
    this.options = options || _defaults;
  }

  space(token: Tokens.Space): RendererOutput {
    return '<br>' as RendererOutput;
  }

  indent({ tokens }: Tokens.Indent): RendererOutput {
    const body = this.parser.parse(tokens);
    return `<div class="wiki-indent">${body}</div>` as RendererOutput;
  }

  code({ text, lang, escaped }: Tokens.Code): RendererOutput {
    const langString = (lang || '').match(other.notSpaceStart)?.[0];

    const code = text.replace(other.endingNewline, '') + '\n';

    if (!langString) {
      return '<pre><code>'
        + (escaped ? code : escape(code, true))
        + '</code></pre>\n' as RendererOutput;
    }

    return '<pre><code class="language-'
      + escape(langString)
      + '">'
      + (escaped ? code : escape(code, true))
      + '</code></pre>\n' as RendererOutput;
  }

  blockquote({ tokens }: Tokens.Blockquote): RendererOutput {
    const body = this.parser.parse(tokens);
    return `<blockquote class="wiki-quote">\n${body}</blockquote>\n` as RendererOutput;
  }

  heading({ tokens, depth, folded }: Tokens.Heading): RendererOutput {
    const classList = ['wiki-heading', ...(folded ? ['wiki-heading-folded'] : [])];
    return `<h${depth} class="${classList.join(' ')}">${this.parser.parseInline(tokens)}</h${depth}>\n` as RendererOutput;
  }

  hr(token: Tokens.Hr): RendererOutput {
    return '<hr>\n' as RendererOutput;
  }

  list(token: Tokens.List): RendererOutput {
    const ordered = token.ordered;
    const start = token.start;
    const style = token.style;

    let body = '';
    for (let j = 0; j < token.items.length; j++) {
      const item = token.items[j];
      body += this.listitem(item);
    }

    const type = ordered ? 'ol' : 'ul';
    const startAttr = (ordered && start !== 1) ? (' start="' + start + '"') : '';
    const classList = ['wiki-list', ...(style ? ['wiki-list-' + style] : [])];
    return `<${type}${startAttr} class="${classList.join(' ')}">${body}</${type}>` as RendererOutput;
  }

  listitem(item: Tokens.ListItem): RendererOutput {
    let itemBody = '';
    itemBody += this.parser.parse(item.tokens);

    return `<li>${itemBody}</li>\n` as RendererOutput;
  }

  paragraph({ tokens }: Tokens.Paragraph): RendererOutput {
    return `<div class="wiki-paragraph">${this.parser.parseInline(tokens)}</div>\n` as RendererOutput;
  }

  table(token: Tokens.Table): RendererOutput {
    let cell = '';
    let body = '';
    for (let j = 0; j < token.rows.length; j++) {
      const row = token.rows[j];

      cell = '';
      for (let k = 0; k < row.length; k++) {
        cell += this.tablecell(row[k]);
      }

      body += this.tablerow({ text: cell as ParserOutput });
    }
    if (body) body = `<tbody>${body}</tbody>`;

    return '<div class="wiki-table-wrap"><table class="wiki-table">'
      + body
      + '</table></div>' as RendererOutput;
  }

  tablerow({ text }: Tokens.TableRow<ParserOutput>): RendererOutput {
    return `<tr>\n${text}</tr>\n` as RendererOutput;
  }

  tablecell(token: Tokens.TableCell): RendererOutput {
    const content = this.parser.parse(token.tokens);

    return `<td${token.option.colspan ? ` colspan="${token.option.colspan}"` : ''}${token.option.rowspan ? ` rowspan="${token.option.rowspan}"` : ''}>${content}</td>` as RendererOutput;
  }

  /**
   * span level renderer
   */
  escape({ text }: Tokens.Escape): RendererOutput {
    return text as RendererOutput;
  }

  comment({ }: Tokens.Comment): RendererOutput {
    return '' as RendererOutput;
  }

  literal({ raw }: Tokens.Literal): RendererOutput {
    if (raw.includes('\n')) {
      return `<pre><code>${escape(raw.slice(3, -3), true)}</code></pre>` as RendererOutput;
    }
    else {
      return `<code>${escape(raw.slice(3, -3))}</code>` as RendererOutput;
    }
  }

  style({ style, tokens }: Tokens.Style): RendererOutput {
    return `<div style="${style}">${this.parser.parse(tokens)}</div>` as RendererOutput;
  }

  size({ style, tokens }: Tokens.Size): RendererOutput {
    if (style.startsWith('+')) {
      return `<span class="wiki-size-up-${style.slice(1)}">${this.parser.parse(tokens)}</span>` as RendererOutput;
    }
    else {
      return `<span class="wiki-size-down-${style.slice(1)}">${this.parser.parse(tokens)}</span>` as RendererOutput;
    }
  }

  folding({ text, tokens }: Tokens.Folding): RendererOutput {
    return `<details><summary>${text}</summary><div>${this.parser.parse(tokens)}</div></details>` as RendererOutput;
  }

  color({ style, tokens }: Tokens.Color): RendererOutput {
    return `<span style="color: ${style}">${this.parser.parse(tokens)}</span>` as RendererOutput;
  }

  strong({ tokens }: Tokens.Strong): RendererOutput {
    return `<strong>${this.parser.parseInline(tokens)}</strong>` as RendererOutput;
  }

  em({ tokens }: Tokens.Em): RendererOutput {
    return `<em>${this.parser.parseInline(tokens)}</em>` as RendererOutput;
  }

  codespan({ text }: Tokens.Codespan): RendererOutput {
    return `<code>${escape(text, true)}</code>` as RendererOutput;
  }

  br(token: Tokens.Br): RendererOutput {
    return '<br>' as RendererOutput;
  }

  macro({ name }: Tokens.Macro): RendererOutput {
    switch (name) {
      case 'tableofcontents':
        return `<div class="wiki-macro-toc"><div class="toc-indent"></div></div>` as RendererOutput;
      case 'footnote':
        return `<div class="wiki-macro-footnote"></div>` as RendererOutput;
      case 'br':
        return `<br>` as RendererOutput;
      case 'clearfix':
        return `<div class="wiki-clearfix"></div>` as RendererOutput;
      case 'date':
        const now = new Date();
        return `<time date-format='Y-m-d H:i:sO' datetime='${now.toISOString()}'>${now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>` as RendererOutput;
      default:
        return `` as RendererOutput;
    }
  }

  del({ tokens }: Tokens.Del): RendererOutput {
    return `<del>${this.parser.parseInline(tokens)}</del>` as RendererOutput;
  }

  sup({ tokens }: Tokens.Sup): RendererOutput {
    return `<sup>${this.parser.parseInline(tokens)}</sup>` as RendererOutput;
  }

  sub({ tokens }: Tokens.Sub): RendererOutput {
    return `<sub>${this.parser.parseInline(tokens)}</sub>` as RendererOutput;
  }

  underline({ tokens }: Tokens.Underline): RendererOutput {
    return `<u>${this.parser.parseInline(tokens)}</u>` as RendererOutput;
  }

  link({ href, external, tokens }: Tokens.Link): RendererOutput {
    const text = this.parser.parseInline(tokens) as string;
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return text as RendererOutput;
    }
    href = cleanHref;
    return `<a ${external ? 'class="wiki-link-external" target="_blank"' : 'class="wiki-link-internal"'} href="${href}" title="${escape(href)}">${text}</a>` as RendererOutput;
  }

  footnote({ title, tokens }: Tokens.Footnote): RendererOutput {
    const text = this.parser.parseInline(tokens) as string;
    return '<a href="#" class="wiki-fn-content" title="' + (escape(text)) + '">[' + title + ']</a>' as RendererOutput;
  }

  text(token: Tokens.Text | Tokens.Escape): RendererOutput {
    return 'tokens' in token && token.tokens
      ? this.parser.parseInline(token.tokens) as unknown as RendererOutput
      : ('escaped' in token && token.escaped ? token.text as RendererOutput : escape(token.text) as RendererOutput);
  }
}
