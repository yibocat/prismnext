import type { Text } from "@codemirror/state";

export type DiffLineKind = "del" | "ins";

/** Minimal chunk shape from @codemirror/merge Chunk. */
export interface ChunkLike {
  fromA: number;
  toA: number;
  fromB: number;
  toB: number;
}

export function diffKindForSide(side: "a" | "b" | null): DiffLineKind {
  return side === "a" ? "del" : "ins";
}

/** Line numbers (1-based) covered by a half-open chunk range [from, to). */
export function lineNumbersInChunkRange(doc: Text, from: number, to: number): number[] {
  if (from === to) return [];
  const lines: number[] = [];
  const startLine = doc.lineAt(from).number;
  const endPos = Math.min(Math.max(to - 1, from), doc.length);
  const endLine = doc.lineAt(endPos).number;
  for (let n = startLine; n <= endLine; n++) {
    lines.push(n);
  }
  return lines;
}

/** Unified view: block widget at chunk.fromB when original has deletions. */
export function isUnifiedDeletionWidgetAt(
  chunks: ReadonlyArray<ChunkLike>,
  side: "a" | "b" | null,
  pos: number,
): boolean {
  if (side !== "b") return false;
  for (const chunk of chunks) {
    if (chunk.fromB === pos && chunk.fromA < chunk.toA) return true;
  }
  return false;
}

/** Map document line numbers to del/ins for the active merge pane. */
export function buildLineKindMap(
  doc: Text,
  chunks: ReadonlyArray<ChunkLike>,
  side: "a" | "b" | null,
): Map<number, DiffLineKind> {
  const map = new Map<number, DiffLineKind>();
  if (!side) return map;

  const kind = diffKindForSide(side);
  for (const chunk of chunks) {
    const from = side === "a" ? chunk.fromA : chunk.fromB;
    const to = side === "a" ? chunk.toA : chunk.toB;
    if (from === to) continue;
    for (const lineNo of lineNumbersInChunkRange(doc, from, to)) {
      map.set(lineNo, kind);
    }
  }
  return map;
}
