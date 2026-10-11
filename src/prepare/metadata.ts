import type { Token, Tokens } from "../Tokens.ts";

const emptyTokens: Token[] = [];
const emptyRows: Tokens.TableCell[][] = [];
const emptyItems: Tokens.ListItem[] = [];

export function headingText(tokens: Token[]): string {
  let out = "";
  type TextFrame = {
    list: Token[];
    i: number;
    rows: Tokens.TableCell[][];
    row: number;
    cell: number;
    items: Tokens.ListItem[];
    item: number;
  };
  const stack: TextFrame[] = [
    {
      list: tokens,
      i: 0,
      rows: emptyRows,
      row: 0,
      cell: 0,
      items: emptyItems,
      item: 0,
    },
  ];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.i >= frame.list.length) {
      if (frame.row < frame.rows.length) {
        const row = frame.rows[frame.row];
        if (frame.cell >= row.length) {
          frame.row++;
          frame.cell = 0;
          continue;
        }
        frame.list = row[frame.cell++].tokens;
        frame.i = 0;
        continue;
      }
      if (frame.item < frame.items.length) {
        frame.list = frame.items[frame.item++].tokens ?? emptyTokens;
        frame.i = 0;
        continue;
      }
      stack.pop();
      continue;
    }

    const t = frame.list[frame.i++];
    switch (t.type) {
      case "text":
        if ((t as Tokens.Text).tokens)
          stack.push({
            list: (t as Tokens.Text).tokens!,
            i: 0,
            rows: emptyRows,
            row: 0,
            cell: 0,
            items: emptyItems,
            item: 0,
          });
        else out += (t as Tokens.Text).text;
        break;
      case "escape":
        out += (t as Tokens.Escape).text;
        break;
      case "commentlink":
        out += (t as Tokens.CommentLink).text;
        break;
      case "link":
      case "strong":
      case "em":
      case "del":
      case "underline":
      case "sup":
      case "sub":
      case "color":
      case "size":
      case "paragraph":
      case "indent":
      case "blockquote":
      case "folding":
      case "style": {
        const kids = (t as Tokens.Generic).tokens;
        if (kids)
          stack.push({
            list: kids,
            i: 0,
            rows: emptyRows,
            row: 0,
            cell: 0,
            items: emptyItems,
            item: 0,
          });
        break;
      }
      case "if": {
        const kids = (t as Tokens.If).show
          ? (t as Tokens.If).tokens
          : undefined;
        if (kids)
          stack.push({
            list: kids,
            i: 0,
            rows: emptyRows,
            row: 0,
            cell: 0,
            items: emptyItems,
            item: 0,
          });
        break;
      }
      case "list":
        stack.push({
          list: emptyTokens,
          i: 0,
          rows: emptyRows,
          row: 0,
          cell: 0,
          items: (t as Tokens.List).items,
          item: 0,
        });
        break;
      case "table":
        stack.push({
          list: (t as Tokens.Table).caption
            ? (t as Tokens.Table).caption!.tokens
            : emptyTokens,
          i: 0,
          rows: (t as Tokens.Table).rows,
          row: 0,
          cell: 0,
          items: emptyItems,
          item: 0,
        });
        break;
    }
  }
  return out;
}

export function assignHeadingNumbers(headings: Tokens.Heading[]) {
  if (headings.length === 0) return;
  let minDepth = headings[0].depth;
  for (const h of headings) if (h.depth < minDepth) minDepth = h.depth;
  const counters = [0, 0, 0, 0, 0, 0];
  const seen = new Map<string, number>();
  let section = 0;
  for (const h of headings) {
    h.section = ++section;
    const d = h.depth - 1;
    counters[d]++;
    for (let i = d + 1; i < 6; i++) counters[i] = 0;
    h.number = counters.slice(minDepth - 1, d + 1).join(".") + ".";
    const t = headingText(h.tokens);
    const n = (seen.get(t) ?? 0) + 1;
    seen.set(t, n);
    h.anchor = t === "" ? `_${n + 1}` : n === 1 ? t : `${t}_${n}`;
  }
}

export function assignFootnoteNumbers(
  footnotes: Tokens.Footnote[],
  groups: Tokens.FootnoteGroup[],
  macros: Tokens.Macro[],
) {
  const byTitle = new Map<string, Tokens.FootnoteGroup>();
  let nextMacro = 0;

  footnotes.forEach((f, i) => {
    f.index = i + 1;

    while (
      nextMacro < macros.length &&
      (macros[nextMacro].footnoteEndIndex ?? 0) <= i
    ) {
      byTitle.clear();
      nextMacro++;
    }

    let group = f.title ? byTitle.get(f.title) : undefined;
    if (!group) {
      const label = f.title || String(f.index);
      group = {
        index: groups.length + 1,
        label,
        id: label,
        refIndices: [],
        text: "",
        tokens: [],
      };
      groups.push(group);
      if (f.title) byTitle.set(f.title, group);
    }

    group.refIndices.push(f.index);
    if (group.refIndices.length === 1) {
      group.text = f.text;
      group.tokens = f.tokens;
    }

    f.groupIndex = group.index;
    f.groupId = group.id;
    f.groupRefIndex = group.refIndices.length;
    f.displayLabel = group.label;
  });

  for (const f of footnotes)
    f.groupSize = groups[f.groupIndex! - 1].refIndices.length;
}

export function assignFootnoteShowing(
  macros: Tokens.Macro[],
  groups: Tokens.FootnoteGroup[],
  finalGroups: Tokens.FootnoteGroup[],
) {
  const buckets: Tokens.FootnoteGroup[][] = [];
  for (const m of macros) {
    const shown: Tokens.FootnoteGroup[] = [];
    buckets.push(shown);
    m.shownGroups = shown;
  }

  for (const g of groups) {
    const last = g.refIndices[g.refIndices.length - 1];
    let lo = 0;
    let hi = macros.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((macros[mid].footnoteEndIndex ?? 0) < last) lo = mid + 1;
      else hi = mid;
    }
    if (lo === macros.length) finalGroups.push(g);
    else buckets[lo].push(g);
  }
}
