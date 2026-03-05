import { validateHTMLColorHex, validateHTMLColorName } from "validate-color";
import { _defaults } from "./defaults.ts";
import { splitCells } from "./helpers.ts";
import type { Rules } from "./rules.ts";
import type { _Lexer } from "./Lexer.ts";
import type { Tokens, Token } from "./Tokens.ts";
import type { MarkedOptions } from "./MarkedOptions.ts";

/**
 * Tokenizer
 */
export class _Tokenizer<ParserOutput = string, RendererOutput = string> {
  options: MarkedOptions<ParserOutput, RendererOutput>;
  rules!: Rules; // set by the lexer
  lexer!: _Lexer<ParserOutput, RendererOutput>; // set by the lexer

  constructor(options?: MarkedOptions<ParserOutput, RendererOutput>) {
    this.options = options || _defaults;
  }

  heading(src: string): Tokens.Heading | undefined {
    const cap = this.rules.block.heading.exec(src);
    if (cap) {
      return {
        type: "heading",
        raw: cap[0],
        depth: cap[1].length,
        folded: !!cap[2],
        text: cap[3],
        tokens: this.lexer.inlineTokens(cap[3]).tokens,
      };
    }
  }

  hr(src: string): Tokens.Hr | undefined {
    const cap = this.rules.block.hr.exec(src);
    if (cap) {
      return {
        type: "hr",
        raw: cap[0],
      };
    }
  }

  blockquote(src: string): Tokens.Blockquote | undefined {
    let cap: RegExpExecArray | null;
    let raw = "";
    let text = "";

    while ((cap = this.rules.block.blockquote.exec(src))) {
      src = src.substring(cap[0].length);

      const inner = this.lexer.inlineTokens(src);
      src = src.substring(inner.raw.length);
      if (!src) {
        raw += ">" + inner.raw;
        text += inner.raw;
      } else if (src.startsWith("\n")) {
        raw += ">" + inner.raw + "\n";
        text += inner.raw + "\n";
        src = src.substring(1);
      } else {
        break;
      }
    }

    if (!raw) return;

    return {
      type: "blockquote",
      raw,
      text,
      tokens: this.lexer.blockTokens(text),
    };
  }

  list(src: string): Tokens.List | undefined {
    let cap = this.rules.block.list.exec(src);
    if (!cap) return;

    let bull = cap[1].trim();
    let style = "";

    switch (bull) {
      case "1.":
        style = "decimal";
        break;
      case "a.":
        style = "alpha";
        break;
      case "A.":
        style = "upper-alpha";
        break;
      case "i.":
        style = "roman";
        break;
      case "I.":
        style = "upper-roman";
        break;
    }
    const isordered = bull.length > 1;

    const list: Tokens.List = {
      type: "list",
      raw: cap[0],
      ordered: isordered,
      style,
      start: isordered ? (cap[2] ? +cap[2] : 1) : "",
      items: [],
    };

    src = src.substring(cap[0].length);

    let inner = this.lexer.inlineTokens(src);
    src = src.substring(inner.raw.length);
    if (src.startsWith("\n")) {
      src = src.substring(1);
      inner.raw += "\n";
    }

    list.raw += inner.raw;
    list.items.push({
      type: "list_item",
      raw: cap[0] + inner.raw,
      text: inner.raw,
      tokens: inner.tokens,
    });

    bull = isordered ? `${bull.slice(0, 1)}\\.` : `\\*`;

    // Get next list item
    const itemRegex = this.rules.other.listItemRegex(bull);
    while (src) {
      if (!src.startsWith(" ")) {
        break;
      }

      if ((cap = itemRegex.exec(src))) {
        list.raw += cap[0];
        src = src.substring(cap[0].length);

        inner = this.lexer.inlineTokens(src);
        src = src.substring(inner.raw.length);
        if (src.startsWith("\n")) {
          src = src.substring(1);
          inner.raw += "\n";
        }

        list.raw += inner.raw;
        list.items.push({
          type: "list_item",
          raw: cap[0] + inner.raw,
          text: inner.raw,
          tokens: [],
        });
      } else {
        src = src.substring(1);
        inner = this.lexer.inlineTokens(src);
        src = src.substring(inner.raw.length);
        if (src.startsWith("\n")) {
          src = src.substring(1);
          inner.raw += "\n";
        }

        list.raw += " " + inner.raw;
        list.items.at(-1)!.raw += " " + inner.raw;
        list.items.at(-1)!.text += inner.raw;
      }
    }

    const prevTop = this.lexer.state.top;
    try {
      this.lexer.state.top = false;
      for (let i = 0; i < list.items.length; i++) {
        list.items[i].tokens = this.lexer.blockTokens(list.items[i].text);
      }
    } finally {
      this.lexer.state.top = prevTop;
    }

    return list;
  }

  table(src: string): Tokens.Table | undefined {
    if (!src.startsWith("||")) return;

    const item: Tokens.Table = {
      type: "table",
      raw: "",
      rows: [],
      attrs: {},
    };

    let endEarly = false;
    while (src && src.startsWith("||")) {
      const cells = [];
      src = src.substring(2);
      while (src && !src.startsWith("\n")) {
        let inline = this.lexer.inlineTokens(
          src,
          this.rules.other.tableDelimiter,
        );
        src = src.substring(inline.raw.length);
        if (!src.startsWith("||")) {
          endEarly = true;
          break;
        }
        src = src.substring(2);
        cells.push(inline.raw);
      }

      if (endEarly) {
        break;
      }

      item.rows.push(
        splitCells(cells, item.attrs).map(({ cell, option }) => {
          this.lexer.state.skip = true;
          return {
            text: cell,
            tokens: this.lexer.blockTokens(cell),
            option,
          };
        }),
      );

      src = src.substring(1);
      item.raw += "||" + cells.join("||") + "||\n";
    }

    if (!item.raw) return;

    return item;
  }

  indent(src: string): Tokens.Indent | undefined {
    let cap: RegExpExecArray | null;
    let raw = "";
    let text = "";

    while ((cap = this.rules.block.indent.exec(src))) {
      src = src.substring(cap[0].length);

      const inner = this.lexer.inlineTokens(src);
      src = src.substring(inner.raw.length);
      if (!src) {
        raw += ">" + inner.raw;
        text += inner.raw;
      } else if (src.startsWith("\n")) {
        raw += ">" + inner.raw + "\n";
        text += inner.raw + "\n";
        src = src.substring(1);
      } else {
        break;
      }
    }

    if (!raw) return;

    return {
      type: "indent",
      raw,
      text,
      tokens: this.lexer.blockTokens(text),
    };
  }

  paragraph(src: string): Tokens.Paragraph | Tokens.Text | undefined {
    const prevInParagraph = this.lexer.state.inParagraph;
    this.lexer.state.inParagraph = true;
    const inline = this.lexer.inlineTokens(src, this.rules.block.paragraph);
    this.lexer.state.inParagraph = prevInParagraph;
    src = src.substring(inline.raw.length);

    const cap = this.rules.inline.newline.exec(src);
    if (cap) {
      inline.raw += cap[0];
      inline.tokens.push({
        type: "br",
        raw: cap[0],
      });
    }

    if (!inline.raw) return;

    return {
      type: this.lexer.state.inParagraph ? "text" : "paragraph",
      raw: inline.raw,
      text: inline.raw,
      tokens: inline.tokens,
    };
  }

  /* inline tokens */
  escape(src: string): Tokens.Escape | undefined {
    const cap = this.rules.inline.escape.exec(src);
    if (cap) {
      return {
        type: "escape",
        raw: cap[0],
        text: cap[1],
      };
    }
  }

  comment(src: string): Tokens.Comment | undefined {
    return;
    // const cap = this.rules.inline.comment.exec(src);
    // if (cap) {
    //   return {
    //     type: 'comment',
    //     raw: cap[0],
    //     text: cap[1],
    //   };
    // }
  }

  braces(
    src: string,
  ):
    | Tokens.Literal
    | Tokens.Style
    | Tokens.Color
    | Tokens.Folding
    | Tokens.Size
    | undefined {
    let cap = this.rules.inline.bracesLDelim.exec(src);
    if (!cap) return;
    src = src.substring(cap[0].length);

    let tokens: Token[] = [];

    if ((cap = this.rules.other.literalStyle.exec(src))) {
      src = src.substring(cap[0].length);
      let style = cap;
      let inline = this.lexer.inlineTokens(src, this.rules.inline.bracesRDelim);
      src = src.substring(inline.raw.length);
      cap = this.rules.inline.bracesRDelim.exec(src);
      if (!cap) return;
      tokens = this.lexer.blockTokens(inline.raw);
      return {
        type: "style",
        raw: "{{{" + style[0] + inline.raw + "}}}",
        style: style[1],
        tokens,
      };
    }

    if ((cap = this.rules.other.literalFolding.exec(src))) {
      src = src.substring(cap[0].length);
      let style = cap;
      let inline = this.lexer.inlineTokens(src, this.rules.inline.bracesRDelim);
      src = src.substring(inline.raw.length);
      cap = this.rules.inline.bracesRDelim.exec(src);
      if (!cap) return;
      tokens = this.lexer.blockTokens(inline.raw);
      return {
        type: "folding",
        raw: "{{{" + style[0] + inline.raw + "}}}",
        text: style[1],
        tokens,
      };
    }

    if ((cap = this.rules.other.literalSize.exec(src))) {
      src = src.substring(cap[0].length);
      let style = cap;
      let inline = this.lexer.inlineTokens(src, this.rules.inline.bracesRDelim);
      src = src.substring(inline.raw.length);
      cap = this.rules.inline.bracesRDelim.exec(src);
      if (!cap) return;
      this.lexer.state.skip = true;
      tokens = this.lexer.blockTokens(inline.raw);
      return {
        type: "size",
        raw: "{{{" + style[0] + inline.raw + "}}}",
        style: style[1],
        tokens,
      };
    }

    if ((cap = this.rules.other.literalColor.exec(src))) {
      // const [light = '', dark = ''] = cap[1].split(',');
      // if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
      // if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
      src = src.substring(cap[0].length);
      let style = cap;
      let inline = this.lexer.inlineTokens(src, this.rules.inline.bracesRDelim);
      src = src.substring(inline.raw.length);
      cap = this.rules.inline.bracesRDelim.exec(src);
      if (!cap) return;
      this.lexer.state.skip = true;
      tokens = this.lexer.blockTokens(inline.raw);
      return {
        type: "color",
        raw: "{{{" + style[0] + inline.raw + "}}}",
        style: style[1],
        tokens,
      };
    } else {
      this.lexer.state.inLiteral = true;
      let inline = this.lexer.inlineTokens(src, this.rules.inline.bracesRDelim);
      this.lexer.state.inLiteral = false;
      src = src.substring(inline.raw.length);
      cap = this.rules.inline.bracesRDelim.exec(src);
      if (cap) {
        return {
          type: "literal",
          raw: "{{{" + inline.raw + "}}}",
          text: inline.raw,
        };
      }
    }
  }

  link(src: string): Tokens.Link | undefined {
    let cap = this.rules.inline.linkLDelim.exec(src);
    let raw = "",
      href = "";
    if (!cap) return;

    raw += cap[0];
    src = src.substring(cap[0].length);

    cap = /(?:\\.|[^|\]\\])*/.exec(src);
    href = cap ? cap[0] : "";
    raw += href;
    src = src.substring(href.length);

    if ((cap = /^\|/.exec(src))) {
      raw += cap[0];
      src = src.substring(cap[0].length);
      let inline = this.lexer.inlineTokens(
        src,
        this.rules.other.endInlineRegex("]]"),
      );
      raw += inline.raw;
      src = src.substring(inline.raw.length);
      cap = this.rules.inline.linkRDelim.exec(src);
      if (!cap) return;
      raw += cap[0];
      return {
        type: "link",
        raw,
        href,
        external: this.rules.other.externalLink.test(href),
        text: inline.raw,
        tokens: inline.tokens,
      };
    } else {
      cap = this.rules.inline.linkRDelim.exec(src);
      if (!cap) return;
      raw += cap[0];
      return {
        type: "link",
        raw,
        href,
        external: this.rules.other.externalLink.test(href),
        text: href,
        tokens: [
          {
            type: "text",
            raw: href,
            text: href,
            escaped: false,
          },
        ],
      };
    }
  }

  footnote(src: string): Tokens.Footnote | undefined {
    let cap = this.rules.inline.footnote.exec(src);
    if (!cap) return;

    const delim = cap[0];
    const title = cap[1] ?? "";
    let rest = src.substring(delim.length);

    const inner = this.lexer.inlineTokens(rest, /^(?:\]|\n)/);
    rest = rest.substring(inner.raw.length);
    if (!rest.startsWith("]")) return;

    const raw = delim + inner.raw + "]";

    return {
      type: "footnote",
      raw,
      title,
      text: inner.raw,
      tokens: inner.tokens,
    };
  }

  macro(src: string): Tokens.Macro | undefined {
    let cap = this.rules.inline.macro.exec(src);
    if (!cap) return;

    let raw = cap[0];

    const name = cap[1].trim().toLowerCase();
    switch (name) {
      case "목차":
      case "tableofcontents":
        return {
          type: "macro",
          raw: raw,
          name: "tableofcontents",
        };
      case "각주":
      case "footnote":
        return {
          type: "macro",
          raw: raw,
          name: "footnote",
        };
      case "br":
        return {
          type: "macro",
          raw: raw,
          name: "br",
        };
      case "clearfix":
        return {
          type: "macro",
          raw: raw,
          name: "clearfix",
        };
      case "date":
      case "datetime":
        return {
          type: "macro",
          raw: raw,
          name: "date",
        };
    }

    let args = cap[2];
    if (!args) return;

    let target = '';
    const argument: Record<string, string> = {};

    while (args) {
      cap = this.rules.other.macroArgs.exec(args);
      if (!cap) break;
      args = args.substring(cap[0].length);

      if (!target) {
        target = cap[0].trim();
        continue;
      }
      const [key, value] = cap[0].split('=');
      argument[key.trim()] = value.trim();
    }

    switch (name) {
      case 'pagecount':
        return {
          type: 'macro',
          raw: raw,
          name: 'pagecount',
          argument,
          target
        };
      case 'youtube':
        return {
          type: 'macro',
          raw: raw,
          name: 'youtube',
          argument,
          target
        };
    }
  }

  newline(src: string): Tokens.Br | undefined {
    const cap = this.rules.inline.newline.exec(src);
    if (cap) {
      return {
        type: "br",
        raw: cap[0],
      };
    }
  }

  sub(src: string): Tokens.Sub | undefined {
    let cap = this.rules.inline.sub.exec(src);
    if (!cap) return;

    const delim = cap[0];
    let raw = cap[0];
    src = src.substring(cap[0].length);

    let inline = this.lexer.inlineTokens(
      src,
      this.rules.other.endInlineRegex(cap[0]),
    );
    raw += inline.raw;
    src = src.substring(inline.raw.length);

    if (!src.startsWith(delim)) return;
    raw += delim;

    return {
      type: "sub",
      raw,
      text: inline.raw,
      tokens: inline.tokens,
    };
  }

  sup(src: string): Tokens.Sup | undefined {
    let cap = this.rules.inline.sup.exec(src);
    if (!cap) return;

    const delim = cap[0];
    let raw = cap[0];
    src = src.substring(cap[0].length);

    let inline = this.lexer.inlineTokens(
      src,
      this.rules.other.endInlineRegex(cap[0]),
    );
    raw += inline.raw;
    src = src.substring(inline.raw.length);

    if (!src.startsWith(delim)) return;
    raw += delim;

    return {
      type: "sup",
      raw,
      text: inline.raw,
      tokens: inline.tokens,
    };
  }

  strong(src: string): Tokens.Strong | undefined {
    let cap = this.rules.inline.strong.exec(src);
    if (!cap) return;

    const delim = cap[0];
    let rest = src.substring(delim.length);

    const inner = this.lexer.inlineTokens(
      rest,
      this.rules.other.endInlineRegex(delim),
    );
    rest = rest.substring(inner.raw.length);
    if (!rest.startsWith(delim)) return;

    const raw = delim + inner.raw + delim;

    return {
      type: "strong",
      raw,
      text: inner.raw,
      tokens: inner.tokens,
    };
  }

  em(src: string): Tokens.Em | undefined {
    let cap = this.rules.inline.em.exec(src);
    if (!cap) return;

    const delim = cap[0];
    let rest = src.substring(delim.length);

    const inner = this.lexer.inlineTokens(
      rest,
      this.rules.other.endInlineRegex(delim),
    );
    rest = rest.substring(inner.raw.length);
    if (!rest.startsWith(delim)) return;

    const raw = delim + inner.raw + delim;

    return {
      type: "em",
      raw,
      text: inner.raw,
      tokens: inner.tokens,
    };
  }

  del(src: string): Tokens.Del | undefined {
    let cap = this.rules.inline.del.exec(src);
    if (!cap) return;

    const delim = cap[0];
    let rest = src.substring(delim.length);

    const inner = this.lexer.inlineTokens(
      rest,
      this.rules.other.endInlineRegex(delim),
    );
    rest = rest.substring(inner.raw.length);
    if (!rest.startsWith(delim)) return;

    const raw = delim + inner.raw + delim;

    return {
      type: "del",
      raw,
      text: inner.raw,
      tokens: inner.tokens,
    };
  }

  underline(src: string): Tokens.Underline | undefined {
    let cap = this.rules.inline.underline.exec(src);
    if (!cap) return;

    const delim = cap[0];
    let rest = src.substring(delim.length);

    const inner = this.lexer.inlineTokens(
      rest,
      this.rules.other.endInlineRegex(delim),
    );
    rest = rest.substring(inner.raw.length);
    if (!rest.startsWith(delim)) return;

    const raw = delim + inner.raw + delim;

    return {
      type: "underline",
      raw,
      text: inner.raw,
      tokens: inner.tokens,
    };
  }

  inlineText(src: string, end: RegExp): Tokens.Text | undefined {
    const cap = this.rules.other.inlineText(end).exec(src);
    if (cap) {
      return {
        type: "text",
        raw: cap[0],
        text: cap[0],
        escaped: false,
      };
    }
  }
}
