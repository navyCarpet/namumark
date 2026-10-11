export type NamumarkToken =
  | Tokens.Blockquote
  | Tokens.Br
  | Tokens.Comment
  | Tokens.CommentLink
  | Tokens.Code
  | Tokens.Del
  | Tokens.Em
  | Tokens.Escape
  | Tokens.Folding
  | Tokens.Footnote
  | Tokens.GlobalStyle
  | Tokens.Heading
  | Tokens.Hr
  | Tokens.Html
  | Tokens.If
  | Tokens.IncludeParam
  | Tokens.Indent
  | Tokens.Latex
  | Tokens.Link
  | Tokens.List
  | Tokens.ListItem
  | Tokens.Literal
  | Tokens.Macro
  | Tokens.Paragraph
  | Tokens.Space
  | Tokens.Strong
  | Tokens.Style
  | Tokens.Size
  | Tokens.Color
  | Tokens.Sub
  | Tokens.Sup
  | Tokens.Table
  | Tokens.Text
  | Tokens.Underline;

export type Token = NamumarkToken | Tokens.Generic;

export type Document = {
  namespace: string;
  title: string;
};

export namespace Tokens {
  export interface Blockquote {
    type: "blockquote";
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Comment {
    type: "comment";
    raw: string;
    text: string;
  }

  export interface CommentLink {
    type: "commentlink";
    raw: string;
    text: string;
  }

  export interface Folding {
    type: "folding";
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Macro {
    type: "macro";
    raw: string;
    name: string;
    argument?: Record<string, string>;
    target?: string;
    footnoteEndIndex?: number;
    shownGroups?: FootnoteGroup[];
    hide?: boolean;
    tex?: string;
    html?: string;
    includeIndex?: number;
    count?: number;
  }

  export interface Indent {
    type: "indent";
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Br {
    type: "br";
    raw: string;
  }

  export interface Code {
    type: "code";
    raw: string;
    codeBlockStyle?: "indented";
    lang?: string;
    text: string;
    escaped?: boolean;
  }

  export interface Sub {
    type: "sub";
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Sup {
    type: "sup";
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Del {
    type: "del";
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Em {
    type: "em";
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Escape {
    type: "escape";
    raw: string;
    text: string;
  }

  export interface Generic {
    [index: string]: any;
    type: string;
    raw: string;
    tokens?: Token[];
  }

  export interface Heading {
    type: "heading";
    raw: string;
    depth: number;
    folded: boolean;
    text: string;
    tokens: Token[];
    number?: string;
    anchor?: string;
    section?: number;
  }

  export interface Hr {
    type: "hr";
    raw: string;
  }

  export interface Html {
    type: "html";
    raw: string;
    text: string;
    pre?: boolean;
    block?: boolean;
  }

  export interface If {
    type: "if";
    raw: string;
    expr: string;
    tokens: Token[];
    show?: boolean;
  }

  export interface Latex {
    type: "latex";
    raw: string;
    tex: string;
  }

  export interface Link {
    type: "link";
    raw: string;
    href: string;
    hrefWasEmptyBeforeHost?: boolean;
    external: boolean;
    text: string;
    hash?: string;
    to?: string;
    pipe?: boolean;
    tokens: Token[];
    document?: Document;
    exists?: boolean;
    kind?: "link" | "file" | "category";
    src?: string;
    filesize?: number;
    option?: Record<string, string>;
  }

  export interface Footnote {
    type: "footnote";
    raw: string;
    title: string;
    text: string;
    tokens: Token[];
    index?: number;
    displayLabel?: string;
    groupIndex?: number;
    groupId?: string;
    groupSize?: number;
    groupRefIndex?: number;
  }

  export interface FootnoteGroup {
    index: number;
    label: string;
    id: string;
    refIndices: number[];
    text: string;
    tokens: Token[];
  }

  export interface List {
    type: "list";
    raw: string;
    ordered: boolean;
    style: string;
    start: number | "";
    items: ListItem[];
    loose?: boolean;
  }

  export interface ListItem {
    type: "list_item";
    raw: string;
    text: string;
    tokens: Token[];
    loose?: boolean;
    task?: boolean;
  }

  export interface Literal {
    type: "literal";
    raw: string;
    text: string;
  }

  export interface Style {
    type: "style";
    raw: string;
    style?: string;
    darkStyle?: string;
    lang?: string;
    className?: string;
    tag?: string;
    onclick?: string;
    attrs?: string;
    tokens: Token[];
  }

  export interface GlobalStyle {
    type: "globalstyle";
    raw: string;
    css: string;
  }

  export interface IncludeParam {
    type: "includeparam";
    raw: string;
    name: string;
    fallback?: string;
    resolved?: string;
  }

  export interface Size {
    type: "size";
    raw: string;
    style: string;
    tokens: Token[];
  }

  export interface Color {
    type: "color";
    raw: string;
    light: string;
    dark: string;
    spec?: string;
    tokens: Token[];
  }

  export interface Paragraph {
    type: "paragraph";
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Space {
    type: "space";
    raw: string;
  }

  export interface Strong {
    type: "strong";
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Table {
    type: "table";
    raw: string;
    caption?: { tokens: Token[]; raw: string };
    rows: TableCell[][];
    hadHeadRowsBeforeIf?: boolean;
    hadBodyRowsBeforeIf?: boolean;
    attrs: Record<string, string>;
    style: {
      wrapper: Record<string, string>;
      light: Record<string, string>;
      dark: Record<string, string>;
    };
  }

  export type TableCellOptions = Record<string, string> & {
    colspan?: string;
    rowspan?: string;
    th?: string;
    rowClass?: string;
    rowKeep?: string;
    rowDarkBg?: string;
    rowStyle?: string;
    rowDarkStyle?: string;
    rowif?: string;
  };

  export interface TableCell {
    text: string;
    tokens: Token[];
    option: TableCellOptions;
    style: {
      light: Record<string, string>;
      dark: Record<string, string>;
    };
    pre?: string;
    post?: string;
  }

  export interface TableRow<P = string> {
    text: P;
    class?: string;
    style?: string;
    darkStyle?: string;
  }

  export interface Text {
    type: "text";
    raw: string;
    text: string;
    tokens?: Token[];
    escaped?: boolean;
    blockBefore?: boolean;
    blockAfter?: boolean;
  }

  export interface Underline {
    type: "underline";
    raw: string;
    text: string;
    tokens: Token[];
  }
}

export type Headings = Array<Tokens.Heading>;
export type Footnotes = Array<Tokens.Footnote>;
export type FootnoteGroups = Array<Tokens.FootnoteGroup>;

export type TokensList = Token[] & {
  footnotes: Footnotes;
  headings: Headings;
  footnoteGroups: FootnoteGroups;
  footnoteFinalGroups: FootnoteGroups;
};
