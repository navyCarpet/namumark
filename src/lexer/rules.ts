const off = /^(?!)/;

const blockNormal = {
  newline: /^\n/,
  comment: /^##[^\n]*\n?/,
  heading: /^(={1,6})(#?) ([^\n]*?) \2\1(?:\n|$)/,
  hr: /^-{4,9}(?:\n|$)/,
  quote: /^>/,
  listItem: /^( +)(\*|1\.|a\.|A\.|i\.|I\.)(?:#(\d+))?( ?)/,
  indent: /^ /,
  table: /^\|\|/,
  caption: /^\|([^|\n]*)\|/,
};

const inlineNormal = {
  escape: /^\\([^\n])/,
  br: /^\n/,
  wiki: /^\{\{\{#!wiki([^\n]*)\n/,
  folding: /^\{\{\{#!folding([^\n]*)\n/,
  syntax: /^\{\{\{#!syntax( [^ \n][^\n]*)\n/,
  html: /^\{\{\{#!(?:html|HTML)/,
  latex: /^\{\{\{#!latex\n/,
  globalstyle: /^\{\{\{#!style\n/,
  if: /^\{\{\{#!if( [^\n]*)\n/,
  size: /^\{\{\{([+-][1-5])([ \t]+|[\n\v\f\r])(\n?)/,
  color: /^\{\{\{(#[^\x09-\x0d\x20]+)([\x09-\x0d\x20])(\n?)/,
  braceOpen: /^\{\{\{/,
  styledHead:
    /^(?:#!(?:wiki|folding)[^\n]*\n|#!if [^\n]*\n|[+-][1-5](?:[ \t]+|[\n\v\f\r])\n?)/,
  linkOpen: /^\[\[/,
  footnoteOpen: /^\[\*([^\s\]]*)/,
  macro: /^\[([^[\]() \n]+)([(\]])/,
  inertBrackets: /^(?!\[\*|\[[^[\]() \n]+\()\[[^\]\n\\{@<'~\-_^,]*/,
  mathTag: /^<math>([\s\S]*?)<\/math>/,
  includeparam: /^@([^@\n]+)@/,
  commentLink: off,
  decoration: {
    strong: /'''/y,
    em: /''/y,
    del: /~~~|~~|---|--/y,
    underline: /___|__/y,
    sup: /\^\^\^|\^\^/y,
    sub: /,,,|,,/y,
  },
  text: /^[^\n\\[{'~\-_^,@<]+/,
};

const inlineDiscuss = {
  ...inlineNormal,
  html: off,
  commentLink: /^#\d+/,
  inertBrackets: /^(?!\[\*|\[[^[\]() \n]+\()\[[^\]\n\\{@<'~\-_^,#]*/,
  text: /^[^\n\\[{'~\-_^,@<#]+/,
};

export const block = { normal: blockNormal, discuss: blockNormal };
export const inline = { normal: inlineNormal, discuss: inlineDiscuss };

export const other = {
  carriageReturn: /\r\n|\r/g,
  unpairedSurrogate:
    /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g,
  escapeTest: /[&<>"'[\]]/,
  escapeReplace: /[&<>"'[\]]/g,
  escapeTestNoEncode: /[<>"'[\]]|&(?!(?:#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
  escapeReplaceNoEncode:
    /[<>"'[\]]|&(?!(?:#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  percentDecode: /%25/g,
  wikiStyle: /(?:^|\s)style="([^"]*)"/,
  wikiDarkStyle: /(?:^|\s)dark-style="([^"]*)"/,
  wikiLang: /(?:^|\s)lang="([^"]*)"/,
  wikiClass: /(?:^|\s)class="([^"]*)"/,
  wikiTag: /(?:^|\s)tag="([^"]*)"/,
  wikiOnclick: /(?:^|\s)onclick="([^"]*)"/,
  externalLink: /^(?:https?|ftp):\/\//i,
  parentLink: /^\.\.\//,
  notSpaceStart: /^\S*/,
  leadingSpace: /^ /,
  leadingSpaces: /^ +/,
  surroundingSpaces: /^ +| +$/g,
  endingNewline: /\n$/,
  headingScan: /(={1,6})(#?) [^\n]*? \2\1(?=\n|$)/y,
  linkEvent: /[\\\n]|\{\{\{|\[\[|\]\]/g,
  footnoteEvent: /[\\\n[\]]|\{\{\{/g,
  rowEvent: /[\\\n[=]|\{\{\{/g,
  footnoteTitle: /[^\s\]]*/y,
  macroScan: /\[([^[\]() \n]+)([(\]])/y,
  inertLineScan: /[\]{<\n]/g,
  rowOpen: /^ *(?:\|\||\|[^|\n]*\|)/,
  hexColor: /^#([\da-f]{3}){1,2}$/i,
  rgbColor: /^rgb\((\d+),(\d+),(\d+)\)$/,
  cssComment: /\/\*[\s\S]*?\*\//g,
  cssDanglingEscape: /(?:^|[^\\])(?:\\\\)*\\$/,
  lessThan: /</g,
  cssNumber: /^-?(?:\d+(?:\.\d+)?|\.\d+)$/,
  cssBannedFunction: /url\(|expression\(/i,
  cssEscape:
    /\\(?:([\da-f]{1,6})(?:\r\n|[ \t\n\r\f])?|\r\n|[\n\r\f]|([\s\S]))/gi,
  cssCombinator: /(\s*[>+~]\s*|\s+)/,
  cssSelectorGroup: /\([^()]*\)|\[[^\]]*\]/g,
  cssSelectorMask: /\x01(\d+)\x01/g,
  cssSimpleSelector:
    /::?[\w-]+(?:\x01\d+\x01)?|\x01\d+\x01|[.#][\w-]+|\*|[a-zA-Z][\w-]*/g,
};

export interface Rules {
  other: typeof other;
  block: typeof blockNormal;
  inline: typeof inlineNormal;
}
