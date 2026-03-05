export type MarkedToken = (
  Tokens.Blockquote
  | Tokens.Br
  | Tokens.Category
  | Tokens.Comment
  | Tokens.Code
  | Tokens.Codespan
  | Tokens.Del
  | Tokens.Em
  | Tokens.Escape
  | Tokens.Folding
  | Tokens.Footnote
  | Tokens.Heading
  | Tokens.HeadingContent
  | Tokens.Hr
  | Tokens.Image
  | Tokens.Indent
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
  | Tokens.Underline
);

export type Token = (
  MarkedToken
  | Tokens.Generic);

export namespace Tokens {
  export interface Blockquote {
    type: 'blockquote';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Category {
    type: 'category';
    raw: string;
    href: string;
    text: string;
    hash?: string;
    tokens: Token[];
  }

  export interface Comment {
    type: 'comment';
    raw: string;
    text: string;
  }

  export interface Folding {
    type: 'folding';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Macro {
    type: 'macro';
    raw: string;
    name: string;
    argument?: Record<string, string>;
    target?: string;
  }

  export interface Indent {
    type: 'indent';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Br {
    type: 'br';
    raw: string;
  }

  export interface Code {
    type: 'code';
    raw: string;
    codeBlockStyle?: 'indented';
    lang?: string;
    text: string;
    escaped?: boolean;
  }

  export interface Codespan {
    type: 'codespan';
    raw: string;
    text: string;
  }

  export interface Sub {
    type: 'sub';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Sup {
    type: 'sup';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Del {
    type: 'del';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Em {
    type: 'em';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Escape {
    type: 'escape';
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
    type: 'heading';
    raw: string;
    depth: number;
    folded: boolean;
    text: string;
    tokens: Token[];
  }

  export interface HeadingContent {
    type: 'heading_content';
    raw: string;
    folded: boolean;
    tokens: Token[];
  }

  export interface Hr {
    type: 'hr';
    raw: string;
  }

  export interface Image {
    type: 'image';
    raw: string;
    href: string;
    title: string;
    option?: string;
    tokens: Token[];
  }

  export interface Link {
    type: 'link';
    raw: string;
    href: string;
    external: boolean;
    text: string;
    hash?: string;
    tokens: Token[];
  }

  export interface Footnote {
    type: 'footnote';
    raw: string;
    title: string;
    text: string;
    tokens: Token[];
  }

  export interface List {
    type: 'list';
    raw: string;
    ordered: boolean;
    style: string;
    start: number | '';
    items: ListItem[];
  }

  export interface ListItem {
    type: 'list_item';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Literal {
    type: 'literal';
    raw: string;
    text: string;
  }

  export interface Style {
    type: 'style';
    raw: string;
    style: string;
    tokens: Token[];
  }

  export interface Size {
    type: 'size';
    raw: string;
    style: string;
    tokens: Token[];
  }

  export interface Color {
    type: 'color';
    raw: string;
    style: string;
    tokens: Token[];
  }

  export interface Paragraph {
    type: 'paragraph';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Space {
    type: 'space';
    raw: string;
  }

  export interface Strong {
    type: 'strong';
    raw: string;
    text: string;
    tokens: Token[];
  }

  export interface Table {
    type: 'table';
    raw: string;
    rows: TableCell[][];
    attrs: Record<string, string>;
  }

  export interface TableCell {
    text: string;
    tokens: Token[];
    option: Record<string, string>;
    // align: 'center' | 'left' | 'right' | null;
    // colspan: number;
  }

  export interface TableRow<P = string> {
    text: P;
  }

  export interface Text {
    type: 'text';
    raw: string;
    text: string;
    tokens?: Token[];
    escaped?: boolean;
  }

  export interface Underline {
    type: 'underline';
    raw: string;
    text: string;
    tokens: Token[];
  }
}

export type Headings = Array<Tokens.Heading>;
export type Footnotes = Array<Tokens.Footnote>;

export type TokensList = Token[] & {
  footnotes: Footnotes;
  headings: Headings;
};
