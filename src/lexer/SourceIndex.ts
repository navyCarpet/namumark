import {
  type BraceExtent,
  type FootnoteExtent,
  type LinkExtent,
  type PositionIndex,
  type PositionList,
  positionList,
  type RowScan,
  scanBraces,
  scanFootnoteEnds,
  scanLinkEnds,
} from "./scan.ts";
import { other } from "./rules.ts";

interface SourceIndexCore {
  braces: PositionIndex<BraceExtent>;
  linkEnds: PositionIndex<LinkExtent>;
  footnoteEnds: PositionIndex<FootnoteExtent>;
  mathEnds: PositionList;
  argEnds: PositionList;
  noteEnds: PositionList;
  inertStops: PositionList;
  newlines: PositionList;
}

export interface SourceIndex extends SourceIndexCore {
  source: string;
  rows: RowScan | null;
}

export interface SourceSpan {
  localStart: number;
  parentStart: number;
  length: number;
}

class SourcePositionMap {
  readonly localStarts: Int32Array;
  readonly parentStarts: Int32Array;
  readonly lengths: Int32Array;

  constructor(spans: SourceSpan[]) {
    const localStarts: number[] = [];
    const parentStarts: number[] = [];
    const lengths: number[] = [];
    for (const span of spans) {
      if (span.length === 0) continue;
      const previous = lengths.length - 1;
      if (
        previous >= 0 &&
        localStarts[previous] + lengths[previous] === span.localStart &&
        parentStarts[previous] + lengths[previous] === span.parentStart
      ) {
        lengths[previous] += span.length;
      } else {
        localStarts.push(span.localStart);
        parentStarts.push(span.parentStart);
        lengths.push(span.length);
      }
    }
    this.localStarts = Int32Array.from(localStarts);
    this.parentStarts = Int32Array.from(parentStarts);
    this.lengths = Int32Array.from(lengths);
  }

  static identity(length: number): SourcePositionMap {
    return new SourcePositionMap(
      length === 0 ? [] : [{ localStart: 0, parentStart: 0, length }],
    );
  }

  project(spans: SourceSpan[]): SourcePositionMap {
    const projected: SourceSpan[] = [];
    let slot = 0;
    for (const child of spans) {
      let cursor = child.parentStart;
      const limit = child.parentStart + child.length;
      let local = child.localStart;

      while (
        slot < this.localStarts.length &&
        this.localStarts[slot] + this.lengths[slot] <= cursor
      )
        slot++;
      while (cursor < limit) {
        if (slot >= this.localStarts.length || cursor < this.localStarts[slot])
          throw new Error("source view crossed an unmapped range");
        const end = Math.min(
          limit,
          this.localStarts[slot] + this.lengths[slot],
        );
        const length = end - cursor;
        projected.push({
          localStart: local,
          parentStart:
            this.parentStarts[slot] + cursor - this.localStarts[slot],
          length,
        });
        local += length;
        cursor = end;
        if (cursor === this.localStarts[slot] + this.lengths[slot]) slot++;
      }
    }
    return new SourcePositionMap(projected);
  }

  toParent(position: number): number | undefined {
    let lo = 0;
    let hi = this.localStarts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.localStarts[mid] <= position) lo = mid + 1;
      else hi = mid;
    }
    const slot = lo - 1;
    if (
      slot < 0 ||
      position < this.localStarts[slot] ||
      position >= this.localStarts[slot] + this.lengths[slot]
    )
      return;
    return this.parentStarts[slot] + position - this.localStarts[slot];
  }

  toLocal(position: number, boundary = false): number | undefined {
    let lo = 0;
    let hi = this.parentStarts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.parentStarts[mid] <= position) lo = mid + 1;
      else hi = mid;
    }
    const slot = lo - 1;
    if (slot < 0 || position < this.parentStarts[slot]) return;
    const end = this.parentStarts[slot] + this.lengths[slot];
    if (position < end || (boundary && position === end))
      return this.localStarts[slot] + position - this.parentStarts[slot];
  }
}

const sourceIndexInternals = new WeakMap<
  SourceIndex,
  { core: SourceIndexCore; positions: SourcePositionMap }
>();

const withSourceIndexInternals = (
  index: SourceIndex,
  core: SourceIndexCore,
  positions: SourcePositionMap,
): SourceIndex => {
  sourceIndexInternals.set(index, { core, positions });
  return index;
};

class MappedPositionIndex<Parent, Local> implements PositionIndex<Local> {
  private readonly parent: PositionIndex<Parent>;
  private readonly positions: SourcePositionMap;
  private readonly transform: (
    value: Parent,
    positions: SourcePositionMap,
  ) => Local | undefined;
  private localPositions?: Int32Array;

  constructor(
    parent: PositionIndex<Parent>,
    positions: SourcePositionMap,
    transform: (
      value: Parent,
      positions: SourcePositionMap,
    ) => Local | undefined,
  ) {
    this.parent = parent;
    this.positions = positions;
    this.transform = transform;
  }

  get(position: number): Local | undefined {
    const parentPosition = this.positions.toParent(position);
    if (parentPosition === undefined) return;
    const value = this.parent.get(parentPosition);
    return value === undefined
      ? undefined
      : this.transform(value, this.positions);
  }

  positionAt(index: number): number | undefined {
    return this.materializedPositions()[index];
  }

  lowerBound(position: number): number {
    const positions = this.materializedPositions();
    let lo = 0;
    let hi = positions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (positions[mid] < position) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  get size(): number {
    return this.materializedPositions().length;
  }

  private materializedPositions(): Int32Array {
    if (this.localPositions) return this.localPositions;
    const positions: number[] = [];
    for (let index = 0; index < this.parent.size; index++) {
      const parentPosition = this.parent.positionAt(index);
      if (parentPosition === undefined) continue;
      const local = this.positions.toLocal(parentPosition);
      if (local !== undefined) positions.push(local);
    }
    return (this.localPositions = Int32Array.from(positions));
  }
}

class MappedPositionList implements PositionList {
  private readonly parent: PositionList;
  private readonly positions: SourcePositionMap;
  private localPositions?: Int32Array;

  constructor(parent: PositionList, positions: SourcePositionMap) {
    this.parent = parent;
    this.positions = positions;
  }

  get(index: number): number {
    return this.materializedPositions()[index];
  }

  get length(): number {
    return this.materializedPositions().length;
  }

  next(from: number, before: number): number {
    if (!(from < before)) return -1;
    const { localStarts, parentStarts, lengths } = this.positions;

    let lo = 0;
    let hi = localStarts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (localStarts[mid] + lengths[mid] <= from) lo = mid + 1;
      else hi = mid;
    }
    const first = lo;
    if (first === localStarts.length || localStarts[first] >= before) return -1;

    lo = first;
    hi = localStarts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (localStarts[mid] < before) lo = mid + 1;
      else hi = mid;
    }
    const last = lo - 1;
    const localFrom = Math.max(from, localStarts[first]);
    const localBefore = Math.min(before, localStarts[last] + lengths[last]);
    let parentFrom = parentStarts[first] + localFrom - localStarts[first];
    const parentBefore = parentStarts[last] + localBefore - localStarts[last];

    while (parentFrom < parentBefore) {
      const found = this.parent.next(parentFrom, parentBefore);
      if (found === -1) return -1;
      const local = this.positions.toLocal(found);
      if (local !== undefined && local >= from && local < before) return local;

      lo = first;
      hi = last + 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (parentStarts[mid] + lengths[mid] <= found) lo = mid + 1;
        else hi = mid;
      }
      if (lo > last) return -1;
      parentFrom = Math.max(found + 1, parentStarts[lo]);
    }
    return -1;
  }

  private materializedPositions(): Int32Array {
    if (this.localPositions) return this.localPositions;
    const positions: number[] = [];
    let from = 0;
    while (true) {
      const position = this.next(from, Infinity);
      if (position === -1) break;
      positions.push(position);
      from = position + 1;
    }
    return (this.localPositions = Int32Array.from(positions));
  }
}

export const mapSourceIndex = (
  parent: SourceIndex,
  source: string,
  spans: SourceSpan[],
): SourceIndex => {
  const parentInternals = sourceIndexInternals.get(parent)!;
  const positions = parentInternals.positions.project(spans);
  const core = parentInternals.core;
  const braces = new MappedPositionIndex(
    core.braces,
    positions,
    (extent, map): BraceExtent | undefined => {
      const end = extent.end === -1 ? -1 : map.toLocal(extent.end, false);
      if (end === undefined) return;
      const headingAt =
        extent.headingAt === -1
          ? -1
          : (map.toLocal(extent.headingAt, false) ?? -1);
      let headingEnd = -1;
      if (headingAt !== -1) {
        const mappedHeadingEnd = map.toLocal(extent.headingEnd, true);
        if (mappedHeadingEnd === undefined) return;
        headingEnd = mappedHeadingEnd;
      }
      return { end, headingAt, headingEnd };
    },
  );
  const mapClosing = (
    extent: LinkExtent | FootnoteExtent,
    map: SourcePositionMap,
  ): LinkExtent | FootnoteExtent | undefined => {
    const end = extent.end === -1 ? -1 : map.toLocal(extent.end, false);
    if (end === undefined) return;
    const readTo = extent.readTo === 0 ? 0 : map.toLocal(extent.readTo, true);
    return readTo === undefined ? undefined : { end, readTo };
  };
  return withSourceIndexInternals(
    {
      source,
      braces,
      linkEnds: new MappedPositionIndex(
        core.linkEnds,
        positions,
        mapClosing,
      ) as PositionIndex<LinkExtent>,
      footnoteEnds: new MappedPositionIndex(
        core.footnoteEnds,
        positions,
        mapClosing,
      ) as PositionIndex<FootnoteExtent>,
      mathEnds: new MappedPositionList(core.mathEnds, positions),
      argEnds: new MappedPositionList(core.argEnds, positions),
      noteEnds: new MappedPositionList(core.noteEnds, positions),
      inertStops: new MappedPositionList(core.inertStops, positions),
      newlines: new MappedPositionList(core.newlines, positions),
      rows: null,
    },
    core,
    positions,
  );
};

class EmptySourcePositionIndex
  extends Map<number, never>
  implements PositionIndex<never>
{
  positionAt(): undefined {}
  lowerBound(): number {
    return 0;
  }
}

const emptyExtentIndex = new EmptySourcePositionIndex();
const emptyPositions = positionList();
const emptyCore: SourceIndexCore = {
  braces: emptyExtentIndex,
  linkEnds: emptyExtentIndex,
  footnoteEnds: emptyExtentIndex,
  mathEnds: emptyPositions,
  argEnds: emptyPositions,
  noteEnds: emptyPositions,
  inertStops: emptyPositions,
  newlines: emptyPositions,
};

export const emptySourceIndex: SourceIndex = withSourceIndexInternals(
  {
    source: "",
    ...emptyCore,
    rows: null,
  },
  emptyCore,
  SourcePositionMap.identity(0),
);

export function createSourceIndex(
  source: string,
  macroNames: Record<string, string>,
): SourceIndex {
  const braces = scanBraces(source);

  const mathEnds: number[] = [];
  let closingPosition = source.indexOf("</math>");
  while (closingPosition !== -1) {
    mathEnds.push(closingPosition);
    closingPosition = source.indexOf("</math>", closingPosition + 7);
  }

  const argEnds: number[] = [];
  closingPosition = source.indexOf(")]");
  while (closingPosition !== -1) {
    argEnds.push(closingPosition);
    closingPosition = source.indexOf(")]", closingPosition + 2);
  }

  const noteEnds: number[] = [];
  closingPosition = source.indexOf("]");
  while (closingPosition !== -1) {
    noteEnds.push(closingPosition);
    closingPosition = source.indexOf("]", closingPosition + 1);
  }

  const inertStops: number[] = [];
  const stopPattern = other.inertLineScan;
  stopPattern.lastIndex = 0;
  let stopMatch = stopPattern.exec(source);
  while (stopMatch !== null) {
    inertStops.push(stopMatch.index);
    stopMatch = stopPattern.exec(source);
  }

  const newlines: number[] = [];
  closingPosition = source.indexOf("\n");
  while (closingPosition !== -1) {
    newlines.push(closingPosition);
    closingPosition = source.indexOf("\n", closingPosition + 1);
  }

  const mathEndIndex = positionList(mathEnds);
  const argEndIndex = positionList(argEnds);
  const noteEndIndex = positionList(noteEnds);
  const inertStopIndex = positionList(inertStops);
  const newlineIndex = positionList(newlines);
  const linkEnds = scanLinkEnds(source, braces);
  const core: SourceIndexCore = {
    braces,
    linkEnds,
    footnoteEnds: scanFootnoteEnds(
      source,
      braces,
      linkEnds,
      argEndIndex,
      macroNames,
    ),
    mathEnds: mathEndIndex,
    argEnds: argEndIndex,
    noteEnds: noteEndIndex,
    inertStops: inertStopIndex,
    newlines: newlineIndex,
  };
  return withSourceIndexInternals(
    {
      source,
      ...core,
      rows: null,
    },
    core,
    SourcePositionMap.identity(source.length),
  );
}
