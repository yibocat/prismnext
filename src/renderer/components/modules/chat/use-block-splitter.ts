// src/renderer/components/modules/chat/use-block-splitter.ts
import { useRef, useMemo } from "react";

/** Zero-allocation startsWith at an offset (hot loop — avoid slice per index). */
function startsWithAt(s: string, i: number, token: string): boolean {
  if (i + token.length > s.length) return false;
  for (let k = 0; k < token.length; k++) {
    if (s.charCodeAt(i + k) !== token.charCodeAt(k)) return false;
  }
  return true;
}

/**
 * Block boundary detection state machine for streaming markdown.
 *
 * Splits accumulated text into committed / pending at safe boundaries.
 * Safe boundaries:
 *   - `\n\n` outside any fence
 *   - Closing fence tokens (```, $$, \])
 *
 * Fence types:
 *   - ```  / ```   (code blocks)
 *   - $$   / $$    (display math, dollar-sign)
 *   - \[   / \]    (display math, LaTeX bracket)
 */
export function useBlockSplitter(content: string): {
  committed: string;
  /** Committed text split at safe boundaries — every block is a self-contained markdown document. */
  committedBlocks: string[];
  pending: string;
  isInFence: boolean;
  fenceChar: string;
} {
  const lastSplitIdxRef = useRef(0);
  /** Boundary indices already emitted for the committed prefix (stable across deltas). */
  const blockSplitsRef = useRef<number[]>([]);

  return useMemo(() => {
    const scanFrom = lastSplitIdxRef.current;

    if (scanFrom > content.length) {
      lastSplitIdxRef.current = 0;
      blockSplitsRef.current = [];
      return {
        committed: "",
        committedBlocks: [],
        pending: content,
        isInFence: false,
        fenceChar: "",
      };
    }
    if (scanFrom === content.length) {
      return {
        committed: content,
        committedBlocks: sliceBlocks(content, blockSplitsRef.current, scanFrom),
        pending: "",
        isInFence: false,
        fenceChar: "",
      };
    }

    const tail = content.slice(scanFrom);
    let inFence = false;
    let fenceChar = "";       // "`" | "$" | "["
    let fenceOpenedAt = -1;
    let bestSplit = scanFrom;
    const splits = blockSplitsRef.current;

    const atLineStart = (i: number) => i === 0 || tail[i - 1] === "\n";

    const markSplit = (idx: number) => {
      bestSplit = idx;
      // Dedupe: \n\n scan can re-report a boundary already emitted by a
      // closing fence on the same index (fence consume already ate the \n).
      if (splits.length === 0 || splits[splits.length - 1]! < idx) {
        splits.push(idx);
      }
    };

    for (let i = 0; i < tail.length; i++) {
      // Zero-allocation token match — tail.slice(i) per index made rescaling
      // of the streaming tail O(tail²) in both time and GC pressure.
      if (!inFence) {
        // ── Fence open (all require line-start) ──
        if (atLineStart(i)) {
          if (startsWithAt(tail, i, "```")) {
            inFence = true;
            fenceChar = "`";
            fenceOpenedAt = i;
            continue;
          }
          if (startsWithAt(tail, i, "$$")) {
            inFence = true;
            fenceChar = "$";
            fenceOpenedAt = i;
            continue;
          }
          if (startsWithAt(tail, i, "\\[")) {
            inFence = true;
            fenceChar = "[";
            fenceOpenedAt = i;
            continue;
          }
        }

        // ── \n\n outside fence ──
        if (i >= 1 && tail[i] === "\n" && tail[i - 1] === "\n") {
          markSplit(scanFrom + i + 1);
        }
      } else {
        // ── Inside fence — match closing ──
        if (fenceChar === "`") {
          // Closing ``` — same line (```code```) or on its own line
          if (startsWithAt(tail, i, "```") && i > fenceOpenedAt + 1) {
            inFence = false;
            fenceChar = "";
            markSplit(scanFrom + i + 3 + (tail[i + 3] === "\n" ? 1 : 0));
          }
        }

        if (fenceChar === "$") {
          // $$ math: close anywhere (single-line display math)
          if (startsWithAt(tail, i, "$$") && i > fenceOpenedAt + 1) {
            inFence = false;
            fenceChar = "";
            markSplit(scanFrom + i + 2 + (tail[i + 2] === "\n" ? 1 : 0));
          }
        }

        if (fenceChar === "[") {
          // \[ math: close with \] (anywhere)
          if (startsWithAt(tail, i, "\\]") && i > fenceOpenedAt + 1) {
            inFence = false;
            fenceChar = "";
            markSplit(scanFrom + i + 2 + (tail[i + 2] === "\n" ? 1 : 0));
          }
        }
      }
    }

    lastSplitIdxRef.current = bestSplit;
    return {
      committed: content.slice(0, bestSplit),
      committedBlocks: sliceBlocks(content, splits, bestSplit),
      pending: content.slice(bestSplit),
      isInFence: inFence,
      fenceChar,
    };
  }, [content]);
}

/**
 * Slice the committed prefix at the recorded boundaries. Each slice keeps its
 * trailing separator (\n\n / fence close + \n) so every block parses as a
 * standalone markdown document and, on memo, stays byte-identical while the
 * stream appends later blocks.
 */
function sliceBlocks(content: string, splits: number[], committedEnd: number): string[] {
  if (committedEnd <= 0) return [];
  const blocks: string[] = [];
  let prev = 0;
  for (const split of splits) {
    if (split <= 0 || split >= committedEnd) break;
    const block = content.slice(prev, split);
    // Whitespace-only slivers (e.g. a blank line right after a closing fence)
    // would render as stray empty paragraphs — drop them.
    if (block.trim()) blocks.push(block);
    prev = split;
  }
  if (prev < committedEnd) {
    const last = content.slice(prev, committedEnd);
    if (last.trim()) blocks.push(last);
  }
  return blocks;
}
