const noopTest = { exec: () => null } as unknown as RegExp;

function edit(regex: string | RegExp, opt = '') {
  let source = typeof regex === 'string' ? regex : regex.source;
  const obj = {
    replace: (name: string | RegExp, val: string | RegExp) => {
      let valSource = typeof val === 'string' ? val : val.source;
      valSource = valSource.replace(other.caret, '$1');
      source = source.replace(name, valSource);
      return obj;
    },
    getRegex: () => {
      return new RegExp(source, opt);
    },
  };
  return obj;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const other = {
  codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm,
  outputLinkReplace: /\\([\[\]])/g,
  indentCodeCompensation: /^(\s+)(?:```)/,
  beginningSpace: /^\s+/,
  endingHash: /#$/,
  startingSpaceChar: /^ /,
  endingSpaceChar: / $/,
  nonSpaceChar: /[^ ]/,
  newLineCharGlobal: /\n/g,
  tabCharGlobal: /\t/g,
  multipleSpaceGlobal: /\s+/g,
  blankLine: /^[ \t]*$/,
  doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
  blockquoteStart: /^ {0,3}>/,
  blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
  blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
  listReplaceTabs: /^\t+/,
  listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
  listIsTask: /^\[[ xX]\] /,
  listReplaceTask: /^\[[ xX]\] +/,
  listNewline: /^ (.*(?:\n|$))/,
  literalStyle: /^#!wiki(?:\s+style="(.*?)")?\n/,
  literalFolding: /^#!folding(?:\s+(.*?))?\n/,
  literalSize: /^([+-][1-5]) /,
  literalColor: /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3}|[a-zA-Z]+) /,
  anyLine: /\n.*\n/,
  hrefBrackets: /^<(.*)>$/,
  tableDelimiter: /^\|\|/,
  tableAlignChars: /^\||\| *$/g,
  tableRowBlankLine: /\n[ \t]*$/,
  tableAlignRight: /^ *-+: *$/,
  tableAlignCenter: /^ *:-+: *$/,
  tableAlignLeft: /^ *:-+ *$/,
  tableCellOption: /^<(.*)>/,
  startATag: /^<a /i,
  endATag: /^<\/a>/i,
  startAngleBracket: /^</,
  endAngleBracket: />$/,
  pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/,
  unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
  escapeTest: /[&<>"']/,
  escapeReplace: /[&<>"']/g,
  escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
  escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,
  caret: /(^|[^\[])\^/g,
  percentDecode: /%25/g,
  findPipe: /\|\|/g,
  splitPipe: / \|\|/,
  slashPipe: /\\\|/g,
  carriageReturn: /\r\n|\r/g,
  spaceLine: /^ +$/gm,
  notSpaceStart: /^\S*/,
  endingNewline: /\n$/,
  macroArgs: /^(?:\\.|[^\\,])+/,
  externalLink: /(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/\w+\.[a-zA-Z]{2,}/,
  listItemRegex: (bull: string) => new RegExp(`^ ${bull} ?`),
  nextBulletRegex: (indent: number) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`),
  endInlineRegex: (start: string) => new RegExp(`^(?:${escapeRegExp(start)}|\\n)`),
};

/**
 * Block-Level Grammar
 */

const heading = /^(={1,6})(#)? (.*) \2\1(?:\n|$)/;
const hr = /^-{4,9}(?:\n|$)/;
const list = /^ (\*|[1aAiI]\.)(#\w+)? ?/;
const indent = /^ /;
const blockquote = /^>/;
const table = /^\|\|/;
const tableDelimiter = edit(/^(?:heading|\|\|)/)
  .replace('heading', heading)
  .getRegex();
const paragraph = edit(/^\n(?:heading|indent|hr|list|table|blockquote)/)
  .replace('heading', heading)
  .replace('indent', indent)
  .replace('hr', hr)
  .replace('blockquote', blockquote)
  .replace('list', list)
  .replace('table', table)
  .getRegex();

const blockNormal = {
  blockquote,
  heading,
  hr,
  indent,
  list,
  table,
  tableDelimiter,
  paragraph,
};

type BlockKeys = keyof typeof blockNormal;

/**
 * Normal Inline Grammar
 */

const comment = /^##([^\n]*(?:\n|$))/;
const escape = /^\\(.)/;
const bracesLDelim = /^{{{/;
const bracesRDelim = edit(/^(?:}}}|heading)/)
  .replace('heading', heading)
  .getRegex();
const literalRDelim = /^}}}/;
const newline = /^\n/;
const linkLDelim = /^\[\[/;
const linkPipe = /^(?:\\.|[^|\]\\\n])*/;
const linkRDelim = /^\]\]/;
const footnote = /^\[\*([^ \]]*)/;
const macro = /^\[(.+?)(?:\(((?:\\.|[^\\])*?)\))?(?<!\\)\]/;
const sup = /^(?:\^\^\^|\^\^)/;
const sub = /^(?:,,,|,,)/;
const strong = /^(?:''')/;
const em = /^(?:'')/;
const del = /^(?:~~~|\-\-\-|~~|\-\-)/;
const underline = /^(?:___|__)/;
const inlineText = (end: RegExp) => edit(/^[\s\S](?:(?!end|comment|escape|bracesLDelim|newline|\[|sup|sub|strong|em|del|underline)[\s\S])*/)
  .replace('end', end)
  .replace('comment', comment)
  .replace('escape', escape)
  .replace('bracesLDelim', bracesLDelim)
  .replace('newline', newline)
  .replace('sup', sup)
  .replace('sub', sub)
  .replace('strong', strong)
  .replace('em', em)
  .replace('del', del)
  .replace('underline', underline)
  .getRegex()

const inlineNormal = {
  comment,
  escape,
  bracesLDelim,
  bracesRDelim,
  literalRDelim,
  newline,
  linkLDelim,
  linkPipe,
  linkRDelim,
  footnote,
  macro,
  sup,
  sub,
  strong,
  em,
  del,
  underline,
  inlineText,
  inLiteralText: (end: RegExp) => edit(/^[\s\S](?:(?!end|bracesLDelim)[\s\S])*/)
  .replace('end', end)
  .replace('bracesLDelim', bracesLDelim)
  .getRegex()
};

type InlineKeys = keyof typeof inlineNormal;

/**
 * exports
 */

export const block = blockNormal;

export const inline = inlineNormal;

export interface Rules {
  other: typeof other
  block: Record<BlockKeys, RegExp>
  inline: typeof inlineNormal
}
