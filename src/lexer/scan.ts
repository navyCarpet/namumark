import type { _Lexer } from "./Lexer.ts";
import { other } from "./rules.ts";
import { maxColorNameLength, parseColor } from "../helpers.ts";

const maxStyledColorPartLength = 1 + maxColorNameLength;
const maxStyledColorSpecLength = maxStyledColorPartLength * 2 + 1;

export function isStyledBraceHead(src: string, at = 0): boolean {
  if (!src.startsWith("{{{", at)) return false;
  const head = at + 3;
  if (
    src.startsWith("#!wiki", head) ||
    src.startsWith("#!folding", head) ||
    src.startsWith("#!if ", head)
  )
    return true;

  const sign = src[head];
  const size = src.charCodeAt(head + 1);
  const separator = src.charCodeAt(head + 2);
  if (
    (sign === "+" || sign === "-") &&
    size >= 0x31 &&
    size <= 0x35 &&
    (separator === 0x20 ||
      separator === 0x09 ||
      (separator >= 0x0a && separator <= 0x0d))
  )
    return true;

  if (src[head] !== "#") return false;
  const limit = Math.min(src.length, head + maxStyledColorSpecLength + 1);
  let end = head + 1;
  while (end < limit) {
    const code = src.charCodeAt(end);
    if (code === 0x20 || (code >= 0x09 && code <= 0x0d)) break;
    end++;
  }
  if (end === head + 1 || end === limit) return false;

  const parts = src.slice(head, end).split(",");
  const light = parseColor(parts[0]);
  const dark = parts[1] ? parseColor(parts[1]) : null;
  return parts.length <= 2 && !!light && (!parts[1] || !!dark);
}

export function findClosingBrace(str: string, abortOnHeading: boolean) {
  let level = 1;
  let lineStart = true;
  for (let i = 0; i < str.length; i++) {
    if (str.startsWith("{{{", i)) {
      level++;
      i += 2;
      lineStart = false;
      continue;
    }
    if (str.startsWith("}}}", i)) {
      level--;
      if (level === 0) return i;
      i += 2;
      lineStart = false;
      continue;
    }
    if (abortOnHeading && level === 1 && lineStart && str[i] === "=") {
      other.headingScan.lastIndex = i;
      if (other.headingScan.test(str)) return -1;
    }
    lineStart = str[i] === "\n";
  }
  return -1;
}

export interface BraceExtent {
  end: number;
  headingAt: number;
  headingEnd: number;
}

export interface PositionIndex<T> {
  readonly size: number;
  get(position: number): T | undefined;
  positionAt(index: number): number | undefined;
  lowerBound(position: number): number;
}

export interface PositionList {
  readonly length: number;
  get(index: number): number;
  next(from: number, before: number): number;
}

class Int32PositionList implements PositionList {
  readonly values: Int32Array;

  constructor(values: number[]) {
    this.values = Int32Array.from(values);
  }

  get length(): number {
    return this.values.length;
  }

  get(index: number): number {
    return this.values[index];
  }

  next(from: number, before: number): number {
    let lo = 0;
    let hi = this.values.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.values[mid] < from) lo = mid + 1;
      else hi = mid;
    }
    const position = this.values[lo];
    return position !== undefined && position < before ? position : -1;
  }
}

export const positionList = (values: number[] = []): PositionList =>
  new Int32PositionList(values);

abstract class PackedPositionIndex<T> implements PositionIndex<T> {
  readonly size: number;
  private readonly first?: number;
  private readonly positions?: Int32Array;
  private readonly slots?: Uint32Array;

  constructor(at: ArrayLike<number>, sourceLength: number) {
    this.size = at.length;
    if (at.length === 0) return;

    let contiguous = true;
    for (let i = 1; i < at.length; i++) {
      if (at[i] !== at[0] + i) {
        contiguous = false;
        break;
      }
    }
    if (contiguous) {
      this.first = at[0];
      return;
    }

    const binaryComparisons = at.length * Math.ceil(Math.log2(at.length + 1));
    if (binaryComparisons >= sourceLength) {
      const slots = new Uint32Array(sourceLength);
      for (let i = 0; i < at.length; i++) slots[at[i]] = i + 1;
      this.slots = slots;
      this.positions = Int32Array.from(at);
    } else {
      this.positions = Int32Array.from(at);
    }
  }

  protected find(position: number): number {
    if (this.first !== undefined) {
      const slot = position - this.first;
      return slot >= 0 && slot < this.size ? slot : -1;
    }
    if (this.slots) {
      if (position < 0 || position >= this.slots.length) return -1;
      return this.slots[position] - 1;
    }
    const positions = this.positions;
    if (!positions) return -1;
    let lo = 0;
    let hi = positions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (positions[mid] < position) lo = mid + 1;
      else hi = mid;
    }
    return lo < positions.length && positions[lo] === position ? lo : -1;
  }

  positionAt(index: number): number | undefined {
    if (index < 0 || index >= this.size) return;
    if (this.first !== undefined) return this.first + index;
    if (this.positions) return this.positions[index];
    return;
  }

  lowerBound(position: number): number {
    if (this.first !== undefined)
      return Math.max(0, Math.min(this.size, position - this.first));
    if (this.positions) {
      let lo = 0;
      let hi = this.positions.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.positions[mid] < position) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }
    return 0;
  }

  abstract get(position: number): T | undefined;
}

type PackedInt32 = { constant: number; values?: Int32Array };

const packInt32 = (values: ArrayLike<number>): PackedInt32 => {
  const constant = values[0] ?? -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== constant)
      return { constant, values: Int32Array.from(values) };
  }
  return { constant };
};

const packedInt32At = (field: PackedInt32, index: number) =>
  field.values?.[index] ?? field.constant;

class BracePositionIndex
  extends PackedPositionIndex<BraceExtent>
  implements PositionIndex<BraceExtent>
{
  private readonly ends: PackedInt32;
  private readonly headingAts: PackedInt32;
  private readonly headingEnds: PackedInt32;

  constructor(
    at: ArrayLike<number>,
    ends: ArrayLike<number>,
    headingAts: ArrayLike<number>,
    headingEnds: ArrayLike<number>,
    sourceLength: number,
  ) {
    super(at, sourceLength);
    this.ends = packInt32(ends);
    this.headingAts = packInt32(headingAts);
    this.headingEnds = packInt32(headingEnds);
  }

  get(position: number): BraceExtent | undefined {
    const slot = this.find(position);
    if (slot === -1) return;
    return {
      end: packedInt32At(this.ends, slot),
      headingAt: packedInt32At(this.headingAts, slot),
      headingEnd: packedInt32At(this.headingEnds, slot),
    };
  }
}

class ClosingPositionIndex
  extends PackedPositionIndex<LinkExtent | FootnoteExtent>
  implements PositionIndex<LinkExtent | FootnoteExtent>
{
  private readonly ends: PackedInt32;
  private readonly readTos: PackedInt32;

  constructor(
    at: ArrayLike<number>,
    ends: ArrayLike<number>,
    readTos: ArrayLike<number>,
    sourceLength: number,
  ) {
    super(at, sourceLength);
    this.ends = packInt32(ends);
    this.readTos = packInt32(readTos);
  }

  get(position: number): LinkExtent | FootnoteExtent | undefined {
    const slot = this.find(position);
    if (slot === -1) return;
    return {
      end: packedInt32At(this.ends, slot),
      readTo: packedInt32At(this.readTos, slot),
    };
  }
}

const emptyPositionIndex: PositionIndex<never> = {
  size: 0,
  get: () => undefined,
  positionAt: () => undefined,
  lowerBound: () => 0,
};

export function scanBraces(src: string): PositionIndex<BraceExtent> {
  let eventCount = 0;
  let nextOpen = src.indexOf("{{{");
  let nextClose = src.indexOf("}}}");
  while (nextOpen !== -1 || nextClose !== -1) {
    if (nextClose === -1 || (nextOpen !== -1 && nextOpen < nextClose)) {
      eventCount++;
      nextOpen = src.indexOf("{{{", nextOpen + 1);
    } else {
      eventCount++;
      nextClose = src.indexOf("}}}", nextClose + 1);
    }
  }
  if (eventCount === 0) return emptyPositionIndex as PositionIndex<BraceExtent>;

  const at = new Int32Array(eventCount);
  const isOpen = new Uint8Array(eventCount);
  nextOpen = src.indexOf("{{{");
  nextClose = src.indexOf("}}}");
  let event = 0;
  while (nextOpen !== -1 || nextClose !== -1) {
    if (nextClose === -1 || (nextOpen !== -1 && nextOpen < nextClose)) {
      at[event] = nextOpen;
      isOpen[event++] = 1;
      nextOpen = src.indexOf("{{{", nextOpen + 1);
    } else {
      at[event++] = nextClose;
      nextClose = src.indexOf("}}}", nextClose + 1);
    }
  }

  const heads: number[] = [];
  const headEnds: number[] = [];
  for (let p = src.indexOf("\n="); p !== -1; p = src.indexOf("\n=", p + 1)) {
    other.headingScan.lastIndex = p + 1;
    const heading = other.headingScan.exec(src);
    if (!heading) continue;
    heads.push(p + 1);
    headEnds.push(p + 1 + heading[0].length);
  }

  const unmatched = new Int32Array(at.length);
  const match = new Int32Array(at.length);
  const head = new Int32Array(at.length);
  const headEnd = new Int32Array(at.length);

  let openingCount = 0;
  for (const opening of isOpen) openingCount += opening;
  const openingAt = new Int32Array(openingCount);
  const openingEnd = new Int32Array(openingCount);
  const openingHeadingAt = new Int32Array(openingCount);
  const openingHeadingEnd = new Int32Array(openingCount);
  let opening = openingCount;
  for (let t = at.length - 1; t >= 0; t--) {
    let next = t + 1;
    while (next < at.length && at[next] < at[t] + 3) next++;
    if (next === at.length) next = -1;

    if (!isOpen[t]) {
      unmatched[t] = t;
      match[t] = -1;
    } else {
      match[t] = next === -1 ? -1 : unmatched[next];
      if (match[t] === -1) {
        unmatched[t] = -1;
      } else {
        let after = match[t] + 1;
        while (after < at.length && at[after] < at[match[t]] + 3) after++;
        unmatched[t] = after === at.length ? -1 : unmatched[after];
      }
    }

    const body = at[t] + 3;
    const limit = next === -1 ? src.length : at[next];
    head[t] = -1;
    headEnd[t] = -1;
    if (isOpen[t] && src[body] === "=") {
      other.headingScan.lastIndex = body;
      const heading = other.headingScan.exec(src);
      if (heading) {
        head[t] = body;
        headEnd[t] = body + heading[0].length;
      }
    }
    if (head[t] === -1) {
      let lo = 0;
      let hi = heads.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (heads[mid] < body) lo = mid + 1;
        else hi = mid;
      }
      if (lo < heads.length && heads[lo] < limit) {
        head[t] = heads[lo];
        headEnd[t] = headEnds[lo];
      }
    }
    if (head[t] === -1 && next !== -1 && isOpen[next] && match[next] !== -1) {
      head[t] = head[match[next]];
      headEnd[t] = headEnd[match[next]];
    }

    if (isOpen[t]) {
      opening--;
      openingAt[opening] = at[t];
      openingEnd[opening] = match[t] === -1 ? -1 : at[match[t]];
      openingHeadingAt[opening] = head[t];
      openingHeadingEnd[opening] = headEnd[t];
    }
  }
  return new BracePositionIndex(
    openingAt,
    openingEnd,
    openingHeadingAt,
    openingHeadingEnd,
    src.length,
  );
}

export interface LinkExtent {
  end: number;
  readTo: number;
}

export function scanLinkEnds(
  src: string,
  braces: PositionIndex<BraceExtent>,
): PositionIndex<LinkExtent> {
  if (src.indexOf("[[") === -1)
    return emptyPositionIndex as PositionIndex<LinkExtent>;

  const at: number[] = [];
  const events = other.linkEvent;
  events.lastIndex = 0;
  for (let m = events.exec(src); m; m = events.exec(src)) {
    at.push(m.index);
    events.lastIndex = m.index + 1;
  }

  const res = new Int32Array(at.length);
  const readTo = new Int32Array(at.length);
  const next2 = new Int32Array(at.length);
  let p2 = at.length;
  let p3 = at.length;

  const openingAt: number[] = [];
  const openingEnd: number[] = [];
  const openingReadTo: number[] = [];
  for (let t = at.length - 1; t >= 0; t--) {
    while (p2 > 0 && at[p2 - 1] >= at[t] + 2) p2--;
    while (p3 > 0 && at[p3 - 1] >= at[t] + 3) p3--;
    next2[t] = p2 === at.length ? -1 : p2;

    const kind = src[at[t]];

    if (kind === "\n") {
      res[t] = -1;
      readTo[t] = 0;
      continue;
    }

    if (kind === "]") {
      res[t] = t;
      readTo[t] = at[t] + 2;
      continue;
    }

    if (kind === "\\") {
      const n = next2[t];
      res[t] = n === -1 ? -1 : res[n];
      readTo[t] = n === -1 ? 0 : readTo[n];
      continue;
    }

    if (kind === "{") {
      const brace = braces.get(at[t]);
      const close = brace ? brace.end : -1;
      if (close === -1) {
        const n = p3 === at.length ? -1 : p3;
        res[t] = n === -1 ? -1 : res[n];
        readTo[t] = n === -1 ? 0 : readTo[n];
        continue;
      }
      let lo = t + 1;
      let hi = at.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (at[mid] < close + 3) lo = mid + 1;
        else hi = mid;
      }
      const n = lo === at.length ? -1 : lo;
      res[t] = n === -1 ? -1 : res[n];
      readTo[t] = Math.max(close + 3, n === -1 ? 0 : readTo[n]);
      continue;
    }

    const inner = next2[t];
    const child = inner === -1 ? -1 : res[inner];
    const childRead = inner === -1 ? 0 : readTo[inner];
    openingAt.push(at[t]);
    openingEnd.push(child === -1 ? -1 : at[child]);
    openingReadTo.push(childRead);
    if (child === -1) {
      res[t] = -1;
      readTo[t] = childRead;
      continue;
    }
    const n = next2[child];
    res[t] = n === -1 ? -1 : res[n];
    readTo[t] = Math.max(childRead, n === -1 ? 0 : readTo[n]);
  }
  openingAt.reverse();
  openingEnd.reverse();
  openingReadTo.reverse();
  return new ClosingPositionIndex(
    openingAt,
    openingEnd,
    openingReadTo,
    src.length,
  );
}

export interface FootnoteExtent {
  end: number;
  readTo: number;
}

export function scanFootnoteEnds(
  src: string,
  braces: PositionIndex<BraceExtent>,
  linkEnds: PositionIndex<LinkExtent>,
  argEnds: PositionList,
  macroNames: Record<string, string>,
): PositionIndex<FootnoteExtent> {
  if (src.indexOf("[*") === -1)
    return emptyPositionIndex as PositionIndex<FootnoteExtent>;

  const at: number[] = [];
  const events = other.footnoteEvent;
  events.lastIndex = 0;
  for (let m = events.exec(src); m; m = events.exec(src)) {
    at.push(m.index);
    events.lastIndex = m.index + 1;
  }

  const res = new Int32Array(at.length);
  const readTo = new Int32Array(at.length);
  let p2 = at.length;

  const from = (pos: number) => {
    let lo = 0;
    let hi = at.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (at[mid] < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo === at.length ? -1 : lo;
  };

  const titleEnds = new Int32Array(at.length);
  let scanned = 0;
  for (let t = 0; t < at.length; t++) {
    if (src[at[t]] !== "[" || src[at[t] + 1] !== "*") continue;
    const start = at[t] + 2;
    if (scanned < start) {
      other.footnoteTitle.lastIndex = start;
      scanned = start + other.footnoteTitle.exec(src)![0].length;
    }
    titleEnds[t] = scanned;
  }

  const openingAt: number[] = [];
  const openingEnd: number[] = [];
  const openingReadTo: number[] = [];
  for (let t = at.length - 1; t >= 0; t--) {
    while (p2 > 0 && at[p2 - 1] >= at[t] + 2) p2--;
    const skip2 = p2 === at.length ? -1 : p2;
    const skip1 = t + 1 === at.length ? -1 : t + 1;
    const kind = src[at[t]];

    if (kind === "\n") {
      res[t] = -1;
      readTo[t] = 0;
      continue;
    }

    if (kind === "]") {
      res[t] = t;
      readTo[t] = at[t] + 1;
      continue;
    }

    if (kind === "\\") {
      res[t] = skip2 === -1 ? -1 : res[skip2];
      readTo[t] = skip2 === -1 ? 0 : readTo[skip2];
      continue;
    }

    if (kind === "{") {
      const brace = braces.get(at[t]);
      const close = brace ? brace.end : -1;
      if (close === -1) {
        res[t] = skip1 === -1 ? -1 : res[skip1];
        readTo[t] = skip1 === -1 ? 0 : readTo[skip1];
        continue;
      }
      const n = from(close + 3);
      res[t] = n === -1 ? -1 : res[n];
      readTo[t] = Math.max(close + 3, n === -1 ? 0 : readTo[n]);
      continue;
    }

    if (src.startsWith("[[", at[t])) {
      const link = linkEnds.get(at[t]);
      const close = link ? link.end : -1;
      const need = link ? link.readTo : 0;
      const n = close === -1 ? skip1 : from(close + 2);
      res[t] = n === -1 ? -1 : res[n];
      readTo[t] = Math.max(need, n === -1 ? 0 : readTo[n]);
      continue;
    }

    if (src[at[t] + 1] === "*") {
      const title = titleEnds[t];
      const s = title === at[t] + 2 ? skip2 : from(title);
      const c = s === -1 ? -1 : res[s];
      openingAt.push(at[t]);
      openingEnd.push(c === -1 ? -1 : at[c]);
      openingReadTo.push(s === -1 ? 0 : readTo[s]);
      const child = skip2 === -1 ? -1 : res[skip2];
      const childRead = skip2 === -1 ? 0 : readTo[skip2];
      if (child === -1) {
        res[t] = -1;
        readTo[t] = childRead;
        continue;
      }
      const n = child + 1 === at.length ? -1 : child + 1;
      res[t] = n === -1 ? -1 : res[n];
      readTo[t] = Math.max(childRead, n === -1 ? 0 : readTo[n]);
      continue;
    }

    other.macroScan.lastIndex = at[t];
    const mac = other.macroScan.exec(src);
    const name = mac === null ? undefined : macroNames[mac[1].toLowerCase()];
    if (mac === null || name === undefined) {
      res[t] = skip1 === -1 ? -1 : res[skip1];
      readTo[t] = skip1 === -1 ? 0 : readTo[skip1];
      continue;
    }
    if (mac[2] === "]") {
      const n = from(at[t] + mac[0].length);
      res[t] = n === -1 ? -1 : res[n];
      readTo[t] = n === -1 ? 0 : readTo[n];
      continue;
    }
    const want = at[t] + mac[0].length;
    const argEnd = argEnds.next(want, src.length);
    if (argEnd === -1) {
      res[t] = skip1 === -1 ? -1 : res[skip1];
      readTo[t] = skip1 === -1 ? 0 : readTo[skip1];
      continue;
    }
    const n = from(argEnd + 2);
    res[t] = n === -1 ? -1 : res[n];
    readTo[t] = Math.max(argEnd + 2, n === -1 ? 0 : readTo[n]);
  }
  openingAt.reverse();
  openingEnd.reverse();
  openingReadTo.reverse();
  return new ClosingPositionIndex(
    openingAt,
    openingEnd,
    openingReadTo,
    src.length,
  ) as PositionIndex<FootnoteExtent>;
}

export interface RowScan {
  at: number[];
  end: Int32Array;
  readTo: Int32Array;
}

export function scanRowEnds(
  src: string,
  braces: PositionIndex<BraceExtent>,
  argEnds: PositionList,
  macroNames: Record<string, string>,
): RowScan {
  const at: number[] = [];
  const events = other.rowEvent;
  events.lastIndex = 0;
  for (let m = events.exec(src); m; m = events.exec(src)) {
    events.lastIndex = m.index + 1;
    if (src[m.index] === "=") {
      if (m.index === 0 || src[m.index - 1] !== "\n") continue;
      other.headingScan.lastIndex = m.index;
      if (!other.headingScan.test(src)) continue;
    }
    at.push(m.index);
  }
  at.push(src.length);

  const end = new Int32Array(at.length);
  const readTo = new Int32Array(at.length);

  const fromPos = (pos: number) => {
    let lo = 0;
    let hi = at.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (at[mid] < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  for (let t = at.length - 1; t >= 0; t--) {
    const p = at[t];

    if (p === src.length) {
      end[t] = src.startsWith("||", p - 2) ? p : -1;
      readTo[t] = src.length;
      continue;
    }

    const ch = src[p];

    if (ch === "=") {
      other.headingScan.lastIndex = p;
      const heading = other.headingScan.exec(src)!;
      end[t] = -1;
      readTo[t] = p + heading[0].length;
      continue;
    }

    if (ch === "\n") {
      if (src.startsWith("||", p - 2)) {
        end[t] = p + 1;
        readTo[t] = p + 1;
        continue;
      }
      end[t] = end[t + 1];
      readTo[t] = readTo[t + 1];
      continue;
    }

    if (ch === "\\") {
      if (p + 2 > src.length) {
        end[t] = -1;
        readTo[t] = src.length;
        continue;
      }
      const n = src[p + 1] === "\n" ? t + 1 : fromPos(p + 2);
      end[t] = end[n];
      readTo[t] = Math.max(p + 2, readTo[n]);
      continue;
    }

    if (ch === "{") {
      const brace = braces.get(p);
      let dest = p + 3;
      let need = p + 3;
      if (brace !== undefined && brace.end !== -1) {
        const styled = isStyledBraceHead(src, p);
        if (styled && brace.headingAt !== -1 && brace.headingAt < brace.end) {
          need = src.length;
        } else {
          dest = brace.end + 3;
          need = brace.end + 3;
        }
      }
      const n = fromPos(dest);
      end[t] = end[n];
      readTo[t] = Math.max(need, readTo[n]);
      continue;
    }

    if (src.startsWith("[[", p) || src[p + 1] === "*") {
      end[t] = end[t + 1];
      readTo[t] = readTo[t + 1];
      continue;
    }

    other.macroScan.lastIndex = p;
    const mac = other.macroScan.exec(src);
    const name = mac === null ? undefined : macroNames[mac[1].toLowerCase()];
    if (mac === null || name === undefined) {
      end[t] = end[t + 1];
      readTo[t] = readTo[t + 1];
      continue;
    }
    if (mac[2] === "]") {
      const n = fromPos(p + mac[0].length);
      end[t] = end[n];
      readTo[t] = readTo[n];
      continue;
    }
    const want = p + mac[0].length;
    const argEnd = argEnds.next(want, src.length);
    if (argEnd === -1) {
      end[t] = end[t + 1];
      readTo[t] = readTo[t + 1];
      continue;
    }
    const n = fromPos(argEnd + 2);
    end[t] = end[n];
    readTo[t] = Math.max(argEnd + 2, readTo[n]);
  }
  return { at, end, readTo };
}

export function findClosingBracket(str: string, lexer: _Lexer, off: number) {
  if (off !== -1) {
    const extent = lexer.index.linkEnds.get(off - 2);
    if (extent && extent.readTo <= off + str.length) {
      return extent.end === -1 ? -1 : extent.end - off;
    }
  }
  if (off !== -1) {
    const ends = lexer.index.noteEnds;
    if (ends.next(off, off + str.length) === -1) return -1;
  }
  let level = 1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\") {
      i++;
      continue;
    }
    if (str.startsWith("{{{", i)) {
      const end = lexer.closingBrace(str, i, off, false);
      i += end === -1 ? 2 : end + 5;
      continue;
    }
    if (str.startsWith("[[", i)) {
      level++;
      i++;
      continue;
    }
    if (str.startsWith("]]", i)) {
      level--;
      if (level === 0) return i;
      i++;
      continue;
    }
    if (str[i] === "\n") return -1;
  }
  return -1;
}

export function findClosingFootnote(str: string, lexer: _Lexer, off: number) {
  if (off !== -1) {
    const ends = lexer.index.noteEnds;
    if (ends.next(off, off + str.length) === -1) return -1;
  }
  let level = 1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\") {
      i++;
      continue;
    }
    if (str.startsWith("{{{", i)) {
      const end = lexer.closingBrace(str, i, off, false);
      i += end === -1 ? 2 : end + 5;
      continue;
    }
    if (str.startsWith("[*", i)) {
      level++;
      i++;
      continue;
    }
    if (str[i] === "]") {
      level--;
      if (level === 0) return i;
      continue;
    }
    if (str[i] === "\n") return -1;
  }
  return -1;
}
