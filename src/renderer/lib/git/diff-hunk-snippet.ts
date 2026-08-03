import { getChunks, type MergeView } from "@codemirror/merge";
import type { EditorView } from "@codemirror/view";
import { diffLines } from "diff";
import { GIT_COLLAPSE_UNCHANGED } from "./diff-display";
import type { ChunkLike } from "./diff-chunk-lines";

export interface GitDiffHunk {
  oldStartLine: number;
  oldLineCount: number;
  newStartLine: number;
  newLineCount: number;
  lines: string[];
}

export interface GitDiffHunkSnippet {
  filePath: string;
  layout: "unified" | "split";
  hunks: GitDiffHunk[];
  removedLineCount: number;
  addedLineCount: number;
}

export type MergeSide = "a" | "b";

const DEFAULT_CONTEXT = GIT_COLLAPSE_UNCHANGED.margin;

function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function offsetToLineNumber(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  for (let i = 0; i < clamped; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

function rangesOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && bFrom < aTo;
}

/** Chunks whose change region intersects the editor selection. */
export function chunksIntersectingSelection(
  chunks: ReadonlyArray<ChunkLike>,
  side: MergeSide,
  selFrom: number,
  selTo: number,
): ChunkLike[] {
  const hits: ChunkLike[] = [];
  for (const chunk of chunks) {
    const from = side === "a" ? chunk.fromA : chunk.fromB;
    const to = side === "a" ? chunk.toA : chunk.toB;

    if (from < to && rangesOverlap(from, to, selFrom, selTo)) {
      hits.push(chunk);
      continue;
    }

    if (side === "b" && chunk.fromA < chunk.toA && chunk.fromB === chunk.toB) {
      if (selFrom <= chunk.fromB && selTo >= chunk.fromB) {
        hits.push(chunk);
      }
      continue;
    }

    if (side === "a" && chunk.fromA === chunk.toA && chunk.fromB < chunk.toB) {
      if (selFrom <= chunk.fromA && selTo >= chunk.fromA) {
        hits.push(chunk);
      }
    }
  }
  return dedupeChunks(hits);
}

function dedupeChunks(chunks: ChunkLike[]): ChunkLike[] {
  const seen = new Set<string>();
  const out: ChunkLike[] = [];
  for (const c of chunks) {
    const key = `${c.fromA}:${c.toA}:${c.fromB}:${c.toB}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function changeLineSpan(text: string, from: number, to: number): { start: number; end: number } {
  if (from === to) {
    const line = offsetToLineNumber(text, Math.min(from, Math.max(text.length, 1)));
    if (from > 0 && text[from - 1] !== "\n") {
      return { start: line, end: line };
    }
    if (line > 1) {
      return { start: line - 1, end: line - 1 };
    }
    return { start: line, end: line };
  }

  const endPos = Math.min(Math.max(to - 1, from), Math.max(text.length, 1));
  return {
    start: offsetToLineNumber(text, from),
    end: offsetToLineNumber(text, endPos),
  };
}

function chunkToHunk(
  oldText: string,
  newText: string,
  chunk: ChunkLike,
  contextLines: number,
): GitDiffHunk {
  const oldChange = changeLineSpan(oldText, chunk.fromA, chunk.toA);
  const newChange = changeLineSpan(newText, chunk.fromB, chunk.toB);
  const oldTotal = Math.max(splitLines(oldText).length, 1);
  const newTotal = Math.max(splitLines(newText).length, 1);

  const alignStart = Math.min(oldChange.start, newChange.start);
  const startLine = Math.max(1, alignStart - contextLines);
  const oldEndLine = Math.min(
    oldTotal,
    Math.max(oldChange.end, alignStart) + contextLines,
  );
  const newEndLine = Math.min(
    newTotal,
    Math.max(newChange.end, alignStart) + contextLines,
  );

  const oldLines = sliceLines(oldText, startLine, oldEndLine);
  const newLines = sliceLines(newText, startLine, newEndLine);
  const lines = buildUnifiedLines(oldLines, newLines);
  const { oldCount, newCount } = hunkHeaderCounts(lines);

  return {
    oldStartLine: startLine,
    oldLineCount: oldCount,
    newStartLine: startLine,
    newLineCount: newCount,
    lines,
  };
}

function sliceLines(text: string, startLine: number, endLine: number): string[] {
  return splitLines(text).slice(startLine - 1, endLine);
}

function buildUnifiedLines(oldLines: string[], newLines: string[]): string[] {
  const parts = diffLines(
    oldLines.length ? `${oldLines.join("\n")}\n` : "",
    newLines.length ? `${newLines.join("\n")}\n` : "",
  );
  const out: string[] = [];
  for (const part of parts) {
    const raw = part.value.endsWith("\n") ? part.value.slice(0, -1) : part.value;
    const lines = raw.length ? raw.split("\n") : [""];
    for (const line of lines) {
      if (part.added) out.push(`+${line}`);
      else if (part.removed) out.push(`-${line}`);
      else out.push(` ${line}`);
    }
  }
  return out;
}

function hunkHeaderCounts(lines: string[]): { oldCount: number; newCount: number } {
  let oldCount = 0;
  let newCount = 0;
  for (const line of lines) {
    if (line.startsWith(" ")) {
      oldCount++;
      newCount++;
    } else if (line.startsWith("-")) {
      oldCount++;
    } else if (line.startsWith("+")) {
      newCount++;
    }
  }
  return { oldCount, newCount };
}

/** Expand merge chunks into unified hunks with context lines. */
export function expandChunksToHunks(
  oldText: string,
  newText: string,
  chunks: ReadonlyArray<ChunkLike>,
  contextLines = DEFAULT_CONTEXT,
): GitDiffHunk[] {
  const sorted = [...chunks].sort((a, b) => a.fromB - b.fromB || a.fromA - b.fromA);
  return sorted.map((chunk) => chunkToHunk(oldText, newText, chunk, contextLines));
}

function countLineStats(hunks: GitDiffHunk[]): { removedLineCount: number; addedLineCount: number } {
  let removedLineCount = 0;
  let addedLineCount = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("-")) removedLineCount++;
      else if (line.startsWith("+")) addedLineCount++;
    }
  }
  return { removedLineCount, addedLineCount };
}

function buildSnippet(
  filePath: string,
  layout: "unified" | "split",
  oldText: string,
  newText: string,
  chunks: ChunkLike[],
): GitDiffHunkSnippet | null {
  if (chunks.length === 0) return null;
  const hunks = expandChunksToHunks(oldText, newText, chunks);
  if (hunks.length === 0) return null;
  const stats = countLineStats(hunks);
  if (stats.removedLineCount === 0 && stats.addedLineCount === 0) return null;
  return { filePath, layout, hunks, ...stats };
}

export function gitDiffSnippetLabel(filePath: string, hunks: GitDiffHunk[]): string {
  const short = filePath.split("/").pop() || filePath;
  if (hunks.length === 0) return short;

  const hasAdded = hunks.some((h) => h.lines.some((l) => l.startsWith("+")));
  if (hasAdded) {
    const lo = Math.min(...hunks.map((h) => h.newStartLine));
    const hi = Math.max(...hunks.map((h) => h.newStartLine + Math.max(h.newLineCount - 1, 0)));
    return lo === hi ? `${short}:${lo}` : `${short}:${lo}-${hi}`;
  }

  const lo = Math.min(...hunks.map((h) => h.oldStartLine));
  const hi = Math.max(...hunks.map((h) => h.oldStartLine + Math.max(h.oldLineCount - 1, 0)));
  return lo === hi ? `${short}:${lo}` : `${short}:${lo}-${hi}`;
}

export function gitDiffSnippetTooltip(removedLineCount: number, addedLineCount: number): string {
  const parts: string[] = [];
  if (removedLineCount > 0) parts.push(`${removedLineCount} 行删除`);
  if (addedLineCount > 0) parts.push(`${addedLineCount} 行新增`);
  if (parts.length === 0) return "无改动行";
  return `含 ${parts.join(" + ")}`;
}

export function formatUnifiedPatch(filePath: string, hunks: GitDiffHunk[]): string {
  const blocks = [`--- a/${filePath}`, `+++ b/${filePath}`];
  for (const hunk of hunks) {
    blocks.push(
      `@@ -${hunk.oldStartLine},${hunk.oldLineCount} +${hunk.newStartLine},${hunk.newLineCount} @@`,
      ...hunk.lines,
    );
  }
  return blocks.join("\n");
}

export function resolveFromUnified(
  view: EditorView,
  oldText: string,
  newText: string,
  filePath: string,
  selFrom: number,
  selTo: number,
): GitDiffHunkSnippet | null {
  const result = getChunks(view.state);
  if (!result) return null;
  const chunks = chunksIntersectingSelection(result.chunks, "b", selFrom, selTo);
  return buildSnippet(filePath, "unified", oldText, newText, chunks);
}

/** Map DOM selection inside a unified deletion widget to merge chunks. */
export function resolveDeletionWidgetSelection(
  view: EditorView,
  container: HTMLElement,
  oldText: string,
  newText: string,
  filePath: string,
): GitDiffHunkSnippet | null {
  const domSel = window.getSelection();
  if (!domSel || domSel.isCollapsed || domSel.rangeCount === 0) return null;

  const node = domSel.anchorNode;
  if (!node) return null;
  const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
  const chunkEl = el?.closest(".cm-deletedChunk");
  if (!chunkEl || !container.contains(chunkEl)) return null;

  const result = getChunks(view.state);
  if (!result) return null;

  let pos: number;
  try {
    pos = view.posAtDOM(chunkEl as Node);
  } catch {
    return null;
  }

  const chunks = result.chunks.filter(
    (c) => c.fromA < c.toA && c.fromB === c.toB && c.fromB === pos,
  );
  return buildSnippet(filePath, "unified", oldText, newText, chunks);
}

export function resolveFromSplit(
  merge: MergeView,
  oldText: string,
  newText: string,
  filePath: string,
): GitDiffHunkSnippet | null {
  const aSel = merge.a.state.selection.main;
  const bSel = merge.b.state.selection.main;
  const aActive = !aSel.empty;
  const bActive = !bSel.empty;
  if (!aActive && !bActive) return null;

  let view: EditorView;
  let side: MergeSide;

  if (aActive && !bActive) {
    view = merge.a;
    side = "a";
  } else if (!aActive && bActive) {
    view = merge.b;
    side = "b";
  } else {
    const focused = document.activeElement;
    if (merge.b.dom.contains(focused)) {
      view = merge.b;
      side = "b";
    } else {
      view = merge.a;
      side = "a";
    }
  }

  const sel = view.state.selection.main;
  const from = Math.min(sel.anchor, sel.head);
  const to = Math.max(sel.anchor, sel.head);
  const result = getChunks(view.state);
  if (!result) return null;
  const chunks = chunksIntersectingSelection(result.chunks, side, from, to);
  return buildSnippet(filePath, "split", oldText, newText, chunks);
}

/** Whole-file diff for Git Changes row drag → Chat (unified layout). */
export function buildFullFileGitDiffSnippet(
  filePath: string,
  oldText: string,
  newText: string,
  layout: "unified" | "split" = "unified",
): GitDiffHunkSnippet | null {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const lines = buildUnifiedLines(oldLines, newLines);
  const hasChange = lines.some((line) => line.startsWith("+") || line.startsWith("-"));
  if (!hasChange) return null;

  const { oldCount, newCount } = hunkHeaderCounts(lines);
  const hunk: GitDiffHunk = {
    oldStartLine: 1,
    oldLineCount: oldCount,
    newStartLine: 1,
    newLineCount: newCount,
    lines,
  };
  const stats = countLineStats([hunk]);
  if (stats.removedLineCount === 0 && stats.addedLineCount === 0) return null;
  return { filePath, layout, hunks: [hunk], ...stats };
}
