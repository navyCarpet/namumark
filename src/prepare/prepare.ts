import { evaluate, Scope, stringify, truthy } from "./Expression.ts";
import { walkTokens } from "../helpers.ts";
import {
  assignFootnoteNumbers,
  assignFootnoteShowing,
  assignHeadingNumbers,
} from "./metadata.ts";
import { hashClassName } from "../renderer/css.ts";
import type { NamumarkOptions } from "../Options.ts";
import { other } from "../lexer/rules.ts";
import type { Token, Tokens, TokensList } from "../Tokens.ts";

export function _prepare(
  tokens: Token[],
  options?: NamumarkOptions,
): TokensList {
  const prepared = tokens as TokensList;
  prepared.headings = [];
  prepared.footnotes = [];
  prepared.footnoteGroups ??= [];
  prepared.footnoteFinalGroups ??= [];

  for (const token of tokens) {
    if (token.type === "heading")
      prepared.headings.push(token as Tokens.Heading);
  }
  assignHeadingNumbers(prepared.headings);
  resolveConditionsAndParams(
    tokens,
    new Scope(options?.parameters),
    options?.title,
  );
  prepareFootnotes(prepared);

  if (!options?.discuss && !options?.prefix) {
    let includeIndex = 0;
    walkTokens(tokens, (token) => {
      if (token.type === "macro" && (token as Tokens.Macro).name === "include")
        (token as Tokens.Macro).includeIndex = ++includeIndex;
    });
  }
  hashUserClasses(tokens);
  return prepared;
}

function prepareFootnotes(prepared: TokensList): void {
  const footnotes = prepared.footnotes;
  const footnoteMacros: Tokens.Macro[] = [];
  type FootnoteCollectionFrame = {
    tokens: Token[];
    nextTokenIndex: number;
    tableRows: Tokens.TableCell[][];
    nextRowIndex: number;
    nextCellIndex: number;
    listItems: Tokens.ListItem[];
    nextItemIndex: number;
  };
  const stack: FootnoteCollectionFrame[] = [
    {
      tokens: prepared,
      nextTokenIndex: 0,
      tableRows: emptyRows,
      nextRowIndex: 0,
      nextCellIndex: 0,
      listItems: emptyItems,
      nextItemIndex: 0,
    },
  ];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.nextTokenIndex >= frame.tokens.length) {
      if (frame.nextRowIndex < frame.tableRows.length) {
        const row = frame.tableRows[frame.nextRowIndex];
        if (frame.nextCellIndex >= row.length) {
          frame.nextRowIndex++;
          frame.nextCellIndex = 0;
          continue;
        }
        frame.tokens = row[frame.nextCellIndex++].tokens;
        frame.nextTokenIndex = 0;
        continue;
      }
      if (frame.nextItemIndex < frame.listItems.length) {
        frame.tokens = frame.listItems[frame.nextItemIndex++].tokens;
        frame.nextTokenIndex = 0;
        continue;
      }
      stack.pop();
      continue;
    }

    const token = frame.tokens[frame.nextTokenIndex++];
    if (token.type === "if" && !(token as Tokens.If).show) continue;
    if (token.type === "footnote") {
      footnotes.push(token as Tokens.Footnote);
    } else if (
      token.type === "macro" &&
      (token as Tokens.Macro).name === "footnote"
    ) {
      (token as Tokens.Macro).footnoteEndIndex = footnotes.length;
      footnoteMacros.push(token as Tokens.Macro);
    }
    if (token.type === "table") {
      const table = token as Tokens.Table;
      stack.push({
        tokens: table.caption ? table.caption.tokens : emptyTokens,
        nextTokenIndex: 0,
        tableRows: table.rows,
        nextRowIndex: 0,
        nextCellIndex: 0,
        listItems: emptyItems,
        nextItemIndex: 0,
      });
    } else if (token.type === "list") {
      stack.push({
        tokens: emptyTokens,
        nextTokenIndex: 0,
        tableRows: emptyRows,
        nextRowIndex: 0,
        nextCellIndex: 0,
        listItems: (token as Tokens.List).items,
        nextItemIndex: 0,
      });
    } else if ((token as Tokens.Generic).tokens) {
      stack.push({
        tokens: (token as Tokens.Generic).tokens!,
        nextTokenIndex: 0,
        tableRows: emptyRows,
        nextRowIndex: 0,
        nextCellIndex: 0,
        listItems: emptyItems,
        nextItemIndex: 0,
      });
    }
  }
  assignFootnoteNumbers(footnotes, prepared.footnoteGroups, footnoteMacros);
  assignFootnoteShowing(
    footnoteMacros,
    prepared.footnoteGroups,
    prepared.footnoteFinalGroups,
  );
}

function hashUserClasses(tokens: Token[]): void {
  const hashClassList = (classNames: string) =>
    classNames.trim().split(/\s+/).filter(Boolean).map(hashClassName).join(" ");
  walkTokens(tokens, (token) => {
    if (token.type === "style") {
      const style = token as Tokens.Style;
      if (style.className) style.className = hashClassList(style.className);
      if (style.onclick) {
        const actions: string[] = [];
        for (const segment of style.onclick.split(";")) {
          const parts = segment.trim().split(",");
          if (parts.length === 1) continue;
          if (parts.length !== 3) break;
          const operation = parts[0];
          if (
            operation !== "add-class" &&
            operation !== "remove-class" &&
            operation !== "toggle-class"
          )
            break;
          actions.push(
            `${operation},${hashClassName(parts[1].trim())},${hashClassName(parts[2].trim())}`,
          );
        }
        style.onclick = actions.join(";");
      }
    } else if (token.type === "table") {
      const table = token as Tokens.Table;
      if (table.attrs.class)
        table.attrs.class = hashClassList(table.attrs.class);
      for (const row of table.rows) {
        for (const cell of row)
          if (cell.option.class)
            cell.option.class = hashClassList(cell.option.class);
        if (row[0]?.option.rowClass)
          row[0].option.rowClass = hashClassList(row[0].option.rowClass);
      }
    }
  });
}

const emptyTokens: Token[] = [];
const emptyRows: Tokens.TableCell[][] = [];
const emptyItems: Tokens.ListItem[] = [];

export function evaluateIfs(
  tokens: Token[],
  scope: Scope,
  title?: string,
): void {
  resolveConditionsAndParams(tokens, scope, title);
}

function resolveConditionsAndParams(
  tokens: Token[],
  scope: Scope,
  title?: string,
): void {
  type ResolutionFrame = {
    tokens: Token[];
    nextTokenIndex: number;
    table: Tokens.Table | null;
    tableRows: Tokens.TableCell[][];
    visibleRows: Tokens.TableCell[][];
    nextRowIndex: number;
    nextCellIndex: number;
    listItems: Tokens.ListItem[];
    nextItemIndex: number;
  };
  const stack: ResolutionFrame[] = [
    {
      tokens: tokens,
      nextTokenIndex: 0,
      table: null,
      tableRows: emptyRows,
      visibleRows: emptyRows,
      nextRowIndex: 0,
      nextCellIndex: -1,
      listItems: emptyItems,
      nextItemIndex: 0,
    },
  ];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.nextTokenIndex >= frame.tokens.length) {
      if (frame.table !== null) {
        if (frame.nextRowIndex >= frame.tableRows.length) {
          frame.table.rows = frame.visibleRows;
          stack.pop();
          continue;
        }
        const row = frame.tableRows[frame.nextRowIndex];
        if (frame.nextCellIndex === -1) {
          const conditionCell = row.find((cell) => "rowif" in cell.option);
          if (conditionCell) {
            let show = false;
            try {
              show = truthy(evaluate(conditionCell.option.rowif!, scope));
            } catch {
              show = false;
            }
            if (!show) {
              frame.nextRowIndex++;
              continue;
            }
          }
          frame.nextCellIndex = 0;
          continue;
        }
        if (frame.nextCellIndex >= row.length) {
          frame.visibleRows.push(row);
          frame.nextRowIndex++;
          frame.nextCellIndex = -1;
          continue;
        }
        frame.tokens = row[frame.nextCellIndex++].tokens;
        frame.nextTokenIndex = 0;
        continue;
      }
      if (frame.nextItemIndex < frame.listItems.length) {
        frame.tokens = frame.listItems[frame.nextItemIndex++].tokens;
        frame.nextTokenIndex = 0;
        continue;
      }
      stack.pop();
      continue;
    }

    const token = frame.tokens[frame.nextTokenIndex++];

    if (token.type === "if") {
      const condition = token as Tokens.If;
      try {
        condition.show = truthy(evaluate(condition.expr, scope));
      } catch {
        condition.show = false;
      }
      if (condition.show)
        stack.push({
          tokens: condition.tokens,
          nextTokenIndex: 0,
          table: null,
          tableRows: emptyRows,
          visibleRows: emptyRows,
          nextRowIndex: 0,
          nextCellIndex: -1,
          listItems: emptyItems,
          nextItemIndex: 0,
        });
    } else if (token.type === "includeparam") {
      const parameter = token as Tokens.IncludeParam;
      if (scope.has(parameter.name)) {
        const value = scope.lookup(parameter.name);
        parameter.resolved = value.t === "null" ? "" : stringify(value);
      }
    } else if (
      token.type === "macro" &&
      (token as Tokens.Macro).name === "math"
    ) {
      const macro = token as Tokens.Macro;
      macro.tex = resolveParams(macro.tex ?? "", scope);
    } else if (token.type === "link") {
      const link = token as Tokens.Link;
      const resolved = resolveParams(link.href, scope);
      if (link.hash !== undefined) link.hash = resolveParams(link.hash, scope);
      if (!link.pipe) {
        const shown = resolveParams(link.text, scope);
        link.text = shown;
        link.tokens = [{ type: "text", raw: shown, text: shown }];
      }
      const target = resolved.trim();
      if (link.external) {
        link.href = resolved;
      } else if (other.externalLink.test(target)) {
        link.external = true;
        link.href = link.hash === undefined ? target : `${target}#${link.hash}`;
        link.hash = undefined;
      } else {
        const current = title ?? "";
        const up = other.parentLink.exec(target);
        if (up) {
          const rest = target.slice(up[0].length);
          const slash = current.lastIndexOf("/");
          const parent = slash === -1 ? "" : current.slice(0, slash);
          if (parent) link.href = rest ? `${parent}/${rest}` : parent;
          else link.href = rest || current;
        } else if (target.startsWith("/")) {
          link.href = current + target;
        } else {
          link.href = target;
        }
      }
      link.hrefWasEmptyBeforeHost = link.href === "";
      if (link.pipe)
        stack.push({
          tokens: link.tokens,
          nextTokenIndex: 0,
          table: null,
          tableRows: emptyRows,
          visibleRows: emptyRows,
          nextRowIndex: 0,
          nextCellIndex: -1,
          listItems: emptyItems,
          nextItemIndex: 0,
        });
    } else if (token.type === "footnote") {
      const footnote = token as Tokens.Footnote;
      footnote.title = resolveParams(footnote.title, scope);
      stack.push({
        tokens: footnote.tokens,
        nextTokenIndex: 0,
        table: null,
        tableRows: emptyRows,
        visibleRows: emptyRows,
        nextRowIndex: 0,
        nextCellIndex: -1,
        listItems: emptyItems,
        nextItemIndex: 0,
      });
    } else if (token.type === "literal") {
      const literal = token as Tokens.Literal;
      literal.text = resolveParams(literal.text, scope);
    } else if (token.type === "code") {
      const code = token as Tokens.Code;
      code.text = resolveParams(code.text, scope);
    } else if (token.type === "html") {
      const html = token as Tokens.Html;
      html.text = resolveParams(html.text, scope);
    } else if (token.type === "folding") {
      const folding = token as Tokens.Folding;
      folding.text = resolveParams(folding.text, scope);
      stack.push({
        tokens: folding.tokens,
        nextTokenIndex: 0,
        table: null,
        tableRows: emptyRows,
        visibleRows: emptyRows,
        nextRowIndex: 0,
        nextCellIndex: -1,
        listItems: emptyItems,
        nextItemIndex: 0,
      });
    } else if (token.type === "macro") {
      const macro = token as Tokens.Macro;
      if (macro.target !== undefined)
        macro.target = resolveParams(macro.target, scope);
      if (macro.argument)
        for (const name of Object.keys(macro.argument))
          macro.argument[name] = resolveParams(macro.argument[name], scope);
    } else if (token.type === "style") {
      const style = token as Tokens.Style;
      if (style.attrs) {
        const attrs = resolveParams(style.attrs, scope);
        const g = style as Tokens.Generic;
        g.style = other.wikiStyle.exec(attrs)?.[1];
        g.darkStyle = other.wikiDarkStyle.exec(attrs)?.[1];
        g.lang = other.wikiLang.exec(attrs)?.[1];
        g.className = other.wikiClass.exec(attrs)?.[1];
        g.onclick = other.wikiOnclick.exec(attrs)?.[1];
      }
      stack.push({
        tokens: style.tokens,
        nextTokenIndex: 0,
        table: null,
        tableRows: emptyRows,
        visibleRows: emptyRows,
        nextRowIndex: 0,
        nextCellIndex: -1,
        listItems: emptyItems,
        nextItemIndex: 0,
      });
    } else if (token.type === "table") {
      const table = token as Tokens.Table;
      if (table.hadHeadRowsBeforeIf === undefined)
        table.hadHeadRowsBeforeIf = table.rows.some(
          (row) => !!row[0]?.option?.["th"],
        );
      if (table.hadBodyRowsBeforeIf === undefined)
        table.hadBodyRowsBeforeIf = table.rows.some(
          (row) => !row[0]?.option?.["th"],
        );
      stack.push({
        tokens: table.caption ? table.caption.tokens : emptyTokens,
        nextTokenIndex: 0,
        table,
        tableRows: table.rows,
        visibleRows: [],
        nextRowIndex: 0,
        nextCellIndex: -1,
        listItems: emptyItems,
        nextItemIndex: 0,
      });
    } else if (token.type === "list") {
      stack.push({
        tokens: emptyTokens,
        nextTokenIndex: 0,
        table: null,
        tableRows: emptyRows,
        visibleRows: emptyRows,
        nextRowIndex: 0,
        nextCellIndex: -1,
        listItems: (token as Tokens.List).items,
        nextItemIndex: 0,
      });
    } else if ((token as Tokens.Generic).tokens) {
      stack.push({
        tokens: (token as Tokens.Generic).tokens!,
        nextTokenIndex: 0,
        table: null,
        tableRows: emptyRows,
        visibleRows: emptyRows,
        nextRowIndex: 0,
        nextCellIndex: -1,
        listItems: emptyItems,
        nextItemIndex: 0,
      });
    }
  }
}

function resolveParams(text: string, scope: Scope): string {
  return text.replace(/@([^@\n]+)@/g, (match: string, inner: string) => {
    const eq = inner.indexOf("=");
    const name = eq === -1 ? inner : inner.slice(0, eq);
    if (name.includes(" ")) return match;
    if (name === "") return match;
    if (eq !== -1 && eq === inner.length - 1) return match;
    if (scope.has(name)) {
      const val = scope.lookup(name);
      return val.t === "null" ? "" : stringify(val);
    }
    return eq === -1 ? "" : inner.slice(eq + 1);
  });
}

export function stripRaw(tokens: Token[]) {
  walkTokens(tokens, (token) => {
    delete (token as { raw?: string }).raw;

    if (token.type === "table") {
      const table = token as Tokens.Table;
      if (table.caption) delete (table.caption as { raw?: string }).raw;
      for (const row of table.rows) {
        for (const cell of row) {
          delete cell.pre;
          delete cell.post;
        }
      }
    }
  });
}
