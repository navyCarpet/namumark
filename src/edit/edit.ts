import { markDirty } from "./Serializer.ts";
import type { Token, Tokens } from "../Tokens.ts";

export interface EditContext {
  replaceWith(...tokens: Token[]): void;
  remove(): void;
  insertBefore(...tokens: Token[]): void;
  insertAfter(...tokens: Token[]): void;
  skip(): void;
}

export function transform(
  tokens: Token[],
  visitor: (node: Token, ctx: EditContext) => void,
): void {
  interface EditFrame {
    arr: Token[];
    owner: Token | null;
    out: Token[];
    read: number;
    i: number;
    kids: [Token[], Token | null][] | null;
    kid: number;
  }

  const finish = (f: EditFrame) => {
    if (f.out === f.arr) return;
    for (let k = f.read; k < f.arr.length; k++) f.out.push(f.arr[k]);
    for (let k = 0; k < f.out.length; k++) f.arr[k] = f.out[k];
    f.arr.length = f.out.length;
  };

  const stack: EditFrame[] = [
    {
      arr: tokens,
      owner: null,
      out: tokens,
      read: 0,
      i: -1,
      kids: null,
      kid: 0,
    },
  ];

  try {
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.kids) {
        if (frame.kid < frame.kids.length) {
          const [childArr, childOwner] = frame.kids[frame.kid++];
          stack.push({
            arr: childArr,
            owner: childOwner,
            out: childArr,
            read: 0,
            i: -1,
            kids: null,
            kid: 0,
          });
          continue;
        }
        frame.kids = null;
      }

      frame.i++;
      if (frame.i >= frame.out.length) {
        if (frame.out === frame.arr || frame.read >= frame.arr.length) {
          finish(frame);
          stack.pop();
          continue;
        }
        frame.out.push(frame.arr[frame.read++]);
      }

      const node = frame.out[frame.i];
      let stop = false;
      let skip = false;

      const touch = (...added: Token[]) => {
        if (frame.out === frame.arr) {
          frame.out = frame.arr.slice(0, frame.i + 1);
          frame.read = frame.i + 1;
        }
        if (frame.i < 0) {
          while (frame.read < frame.arr.length)
            frame.out.push(frame.arr[frame.read++]);
        }
        if (frame.owner) markDirty(frame.owner);
        for (const t of added) markDirty(t);
      };
      const ctx: EditContext = {
        replaceWith(...nodes) {
          touch(...nodes);
          frame.out.splice(frame.i, 1, ...nodes);
          frame.i += nodes.length - 1;
          stop = true;
        },
        remove() {
          touch();
          frame.out.splice(frame.i, 1);
          frame.i--;
          stop = true;
        },
        insertBefore(...nodes) {
          touch(...nodes);
          frame.out.splice(frame.i, 0, ...nodes);
          frame.i += nodes.length;
        },
        insertAfter(...nodes) {
          touch(...nodes);
          frame.out.splice(frame.i + 1, 0, ...nodes);
        },
        skip() {
          skip = true;
        },
      };

      visitor(node, ctx);
      if (stop || skip) continue;
      if (node.type === "table") {
        const table = node as Tokens.Table;
        frame.kids = [];
        if (table.caption) frame.kids.push([table.caption.tokens, node]);
        for (const row of table.rows) {
          for (const cell of row) frame.kids.push([cell.tokens, node]);
        }
      } else if (node.type === "list") {
        frame.kids = (node as Tokens.List).items.map(
          (item) => [item.tokens, node] as [Token[], Token],
        );
      } else {
        const children = (node as Tokens.Generic).tokens;
        frame.kids = children ? [[children, node]] : [];
      }
      frame.kid = 0;
    }
  } catch (err) {
    for (let k = stack.length - 1; k >= 0; k--) finish(stack[k]);
    throw err;
  }
}

export function update<T extends Token>(
  token: T,
  changes: Partial<T> | ((token: T) => void),
): T {
  const style =
    token.type === "style" ? (token as Token as Tokens.Style) : undefined;
  const color =
    token.type === "color" ? (token as Token as Tokens.Color) : undefined;
  const prevClassName = style?.className;
  const prevStyle = style?.style;
  const prevDarkStyle = style?.darkStyle;
  const prevLang = style?.lang;
  const prevTag = style?.tag;
  const prevOnclick = style?.onclick;
  const prevLight = color?.light;
  const prevDark = color?.dark;

  if (typeof changes === "function") changes(token);
  else Object.assign(token, changes);

  if (style?.attrs !== undefined) {
    let attrs = style.attrs;
    const setAttr = (name: string, value: string | undefined) => {
      const m = new RegExp(`(^|\\s)${name}="[^"]*"`).exec(attrs);
      if (!m) {
        if (value === undefined) return;
        attrs = attrs ? `${attrs} ${name}="${value}"` : `${name}="${value}"`;
        return;
      }
      const before = attrs.slice(0, m.index);
      const after = attrs.slice(m.index + m[0].length);
      if (value === undefined)
        attrs = before ? before + after : after.replace(/^\s+/, "");
      else attrs = before + m[1] + `${name}="${value}"` + after;
    };

    if (style.className !== prevClassName) setAttr("class", style.className);
    if (style.style !== prevStyle) setAttr("style", style.style);
    if (style.darkStyle !== prevDarkStyle)
      setAttr("dark-style", style.darkStyle);
    if (style.lang !== prevLang) setAttr("lang", style.lang);
    if (style.tag !== prevTag) setAttr("tag", style.tag);
    if (style.onclick !== prevOnclick) setAttr("onclick", style.onclick);
    style.attrs = attrs;
  }

  if (color?.spec !== undefined) {
    const parts = color.spec.split(",");
    if (color.light !== prevLight)
      parts[0] = color.light.startsWith("#") ? color.light : "#" + color.light;
    if (color.dark !== prevDark && color.dark)
      parts[1] = color.dark.startsWith("#") ? color.dark : "#" + color.dark;
    if (color.dark !== prevDark && !color.dark) parts.length = 1;
    color.spec = parts.join(",");
  }

  markDirty(token);
  return token;
}

export function createText(text: string): Tokens.Text {
  return { type: "text", text, escaped: false } as Tokens.Text;
}

export function createLink(target: string, text?: string): Tokens.Link {
  return {
    type: "link",
    href: target,
    hrefWasEmptyBeforeHost: target === "",
    to: target,
    external: /^(?:https?|ftp):\/\//i.test(target),
    pipe: text !== undefined,
    text: text ?? target,
    tokens: text !== undefined ? [createText(text)] : [],
  } as Tokens.Link;
}

export function createMacro(name: string, target?: string): Tokens.Macro {
  return { type: "macro", name, target } as Tokens.Macro;
}

export function renameLink(tokens: Token[], from: string, to: string): void {
  transform(tokens, (node) => {
    if (node.type !== "link") return;
    const link = node as Tokens.Link;
    if ((link.to ?? link.href) !== from) return;
    update(link, { to, href: to });
  });
}

export function replaceText(
  tokens: Token[],
  pattern: string | RegExp,
  replacement: string,
): void {
  let search = pattern;
  if (typeof pattern !== "string" && !pattern.global) {
    search = new RegExp(pattern.source, pattern.flags + "g");
  }

  transform(tokens, (node) => {
    if (node.type !== "text" || (node as Tokens.Text).tokens) return;
    const text = node as Tokens.Text;
    const next = text.text.replaceAll(search as string, replacement);
    if (next !== text.text) update(text, { text: next });
  });
}
