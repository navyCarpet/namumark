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
  literalStyle: /^#!wiki\s+style="(.*?)"\n/,
  literalFolding: /^#!folding\s+(.*?)\n/,
  literalSize: /^[+-][1-5]/,
  literalColor: /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3}|[a-zA-Z]+)/,
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
  externalLink: /(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/\w+\.[a-zA-Z]{2,}/,
  listItemRegex: (bull: string) => new RegExp(`^ (${bull})(#\\d+)?`),
  nextBulletRegex: (indent: number) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`),
  endInlineRegex: (start: string) => new RegExp(`^(?:${escapeRegExp(start)}|\\n)`),
  inlineText: (end: RegExp) => edit(/^[\s\S](?:(?!end)[^\\_\^,\-~\[{'#\n])*/).replace('end', end).getRegex()
};

/**
 * Block-Level Grammar
 */

const heading = /^(={1,6})(#)? (.*) \2\1(?:\n|$)/;
const hr = /^-{4,9}(?:\n|$)/;
const list = /^ (\*|[1aAiI]\.)(#\w+)?/;
const indent = /^ ([^\n]*(?:\n|$))/;
const blockquote = /^>([^\n]*(?:\n|$))/;
const table = /^\|\|[\s\S]*?\|\|(?:\n|$)/;
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
  paragraph,
};

type BlockKeys = keyof typeof blockNormal;

/**
 * Normal Inline Grammar
 */

const inlineNormal = {
  comment: /^##([^\n]*(?:\n|$))/,
  escape: /^\\(.)/,
  bracesLDelim: /^{{{/,
  bracesRDelim: /^}}}/,
  newline: /^\n/,
  linkLDelim: /^\[\[/,
  linkRDelim: /^\]\]/,
  footnote: /^\[\*(\S*) /,
  macro: /^(?!\\\[)\[(.+?)(?:\(((?:\\.|[^\\])*?)\))?(?:(?<!\\)\])/,
  sup: /^(?:\^\^\^|\^\^)/,
  sub: /^(?:,,,|,,)/,
  strong: /^(?:''')/,
  em: /^(?:'')/,
  del: /^(?:~~~|\-\-\-|~~|\-\-)/,
  underline: /^(?:___|__)/
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
  inline: Record<InlineKeys, RegExp>
}
