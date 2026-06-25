import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  buildLineKindMap,
  diffKindForSide,
  isUnifiedDeletionWidgetAt,
  lineNumbersInChunkRange,
  type ChunkLike,
} from "../../src/renderer/lib/git/diff-chunk-lines";

const doc = Text.of(["line1", "line2", "line3", "line4", "line5"]);

describe("diff-chunk-lines", () => {
  it("diffKindForSide maps merge panes", () => {
    expect(diffKindForSide("a")).toBe("del");
    expect(diffKindForSide("b")).toBe("ins");
    expect(diffKindForSide(null)).toBe("ins");
  });

  it("lineNumbersInChunkRange covers inclusive line span", () => {
    const from = doc.line(2).from;
    const to = doc.line(4).to;
    expect(lineNumbersInChunkRange(doc, from, to)).toEqual([2, 3, 4]);
  });

  it("lineNumbersInChunkRange returns empty for empty chunk span", () => {
    expect(lineNumbersInChunkRange(doc, doc.line(1).from, doc.line(1).from)).toEqual([]);
  });

  it("buildLineKindMap marks side-b insertion lines green", () => {
    const chunks: ChunkLike[] = [
      {
        fromA: doc.line(2).from,
        toA: doc.line(2).from,
        fromB: doc.line(3).from,
        toB: doc.line(4).to,
      },
    ];
    const map = buildLineKindMap(doc, chunks, "b");
    expect(map.get(3)).toBe("ins");
    expect(map.get(4)).toBe("ins");
    expect(map.get(2)).toBeUndefined();
  });

  it("buildLineKindMap marks side-a deletion lines red", () => {
    const chunks: ChunkLike[] = [
      {
        fromA: doc.line(1).from,
        toA: doc.line(2).to,
        fromB: doc.line(5).from,
        toB: doc.line(5).from,
      },
    ];
    const map = buildLineKindMap(doc, chunks, "a");
    expect(map.get(1)).toBe("del");
    expect(map.get(2)).toBe("del");
    expect(map.get(5)).toBeUndefined();
  });

  it("buildLineKindMap skips chunks with no lines on active side", () => {
    const chunks: ChunkLike[] = [
      {
        fromA: doc.line(1).from,
        toA: doc.line(2).to,
        fromB: doc.line(3).from,
        toB: doc.line(3).from,
      },
    ];
    const mapB = buildLineKindMap(doc, chunks, "b");
    expect(mapB.size).toBe(0);
    const mapA = buildLineKindMap(doc, chunks, "a");
    expect(mapA.get(1)).toBe("del");
    expect(mapA.get(2)).toBe("del");
  });

  it("buildLineKindMap includes empty changed line in range", () => {
    const emptyLineDoc = Text.of(["a", "", "c"]);
    const chunks: ChunkLike[] = [
      {
        fromA: emptyLineDoc.line(1).from,
        toA: emptyLineDoc.line(3).to,
        fromB: emptyLineDoc.line(1).from,
        toB: emptyLineDoc.line(3).to,
      },
    ];
    const map = buildLineKindMap(emptyLineDoc, chunks, "b");
    expect(map.get(1)).toBe("ins");
    expect(map.get(2)).toBe("ins");
    expect(map.get(3)).toBe("ins");
  });

  it("isUnifiedDeletionWidgetAt detects deletion widgets on side b", () => {
    const chunks: ChunkLike[] = [
      { fromA: 0, toA: 10, fromB: 20, toB: 20 },
      { fromA: 30, toA: 30, fromB: 40, toB: 50 },
    ];
    expect(isUnifiedDeletionWidgetAt(chunks, "b", 20)).toBe(true);
    expect(isUnifiedDeletionWidgetAt(chunks, "b", 40)).toBe(false);
    expect(isUnifiedDeletionWidgetAt(chunks, "a", 20)).toBe(false);
  });
});
