// src/renderer/components/modules/chat/use-block-splitter.ts
import { useRef, useMemo } from "react";

/**
 * Block boundary detection state machine for streaming markdown.
 *
 * Splits accumulated text into committed / pending at safe boundaries.
 * Safe boundaries:
 *   - `\n\n` outside any fence
 *   - Closing fence tokens (```, $$, \], \end{env})
 *
 * Fence types:
 *   - ```  / ```   (code blocks)
 *   - $$   / $$    (display math, dollar-sign)
 *   - \[   / \]    (display math, LaTeX bracket)
 *   - \begin{env} / \end{env} (LaTeX math environments)
 */
export function useBlockSplitter(content: string): {
  committed: string;
  pending: string;
  isInFence: boolean;
  fenceChar: string;
} {
  const lastSplitIdxRef = useRef(0);

  return useMemo(() => {
    const scanFrom = lastSplitIdxRef.current;

    if (scanFrom > content.length) {
      lastSplitIdxRef.current = 0;
      return { committed: "", pending: content, isInFence: false, fenceChar: "" };
    }
    if (scanFrom === content.length) {
      return { committed: content, pending: "", isInFence: false, fenceChar: "" };
    }

    const tail = content.slice(scanFrom);
    let inFence = false;
    let fenceChar = "";       // "`" | "$" | "[" | "B"
    let envStack: string[] = [];
    let fenceOpenedAt = -1;
    let bestSplit = scanFrom;

    const atLineStart = (i: number) => i === 0 || tail[i - 1] === "\n";

    // ── Regex for \begin{env} / \end{env} ──
    const BEGIN_RE = /^\\begin\{(\w+\*?)\}/;
    const END_RE = /^\\end\{(\w+\*?)\}/;

    for (let i = 0; i < tail.length; i++) {
      const rest = tail.slice(i);

      if (!inFence) {
        // ── Fence open (all require line-start) ──
        if (atLineStart(i)) {
          if (rest.startsWith("```")) {
            inFence = true;
            fenceChar = "`";
            fenceOpenedAt = i;
            continue;
          }
          if (rest.startsWith("$$")) {
            inFence = true;
            fenceChar = "$";
            fenceOpenedAt = i;
            continue;
          }
          if (rest.startsWith("\\[")) {
            inFence = true;
            fenceChar = "[";
            fenceOpenedAt = i;
            continue;
          }
          const beginMatch = rest.match(BEGIN_RE);
          if (beginMatch) {
            inFence = true;
            fenceChar = "B";
            envStack = [beginMatch[1]];
            fenceOpenedAt = i;
            continue;
          }
        }

        // ── \n\n outside fence ──
        if (i >= 1 && tail[i] === "\n" && tail[i - 1] === "\n") {
          bestSplit = scanFrom + i + 1;
        }
      } else {
        // ── Inside fence — match closing ──
        if (fenceChar === "`") {
          // Code fence: ``` on its own line
          if (atLineStart(i) && rest.startsWith("```") && i > fenceOpenedAt + 1) {
            const after = tail.slice(i + 3);
            if (after === "" || after.startsWith("\n")) {
              inFence = false;
              fenceChar = "";
              bestSplit = scanFrom + i + 3 + (after.startsWith("\n") ? 1 : 0);
            }
          }
        }

        if (fenceChar === "$") {
          // $$ math: close anywhere (single-line display math)
          if (rest.startsWith("$$") && i > fenceOpenedAt + 1) {
            inFence = false;
            fenceChar = "";
            const after = tail.slice(i + 2);
            bestSplit = scanFrom + i + 2 + (after.startsWith("\n") ? 1 : 0);
          }
        }

        if (fenceChar === "[") {
          // \[ math: close with \] (anywhere)
          if (rest.startsWith("\\]") && i > fenceOpenedAt + 1) {
            inFence = false;
            fenceChar = "";
            const after = tail.slice(i + 2);
            bestSplit = scanFrom + i + 2 + (after.startsWith("\n") ? 1 : 0);
          }
        }

        if (fenceChar === "B") {
          if (atLineStart(i)) {
            // Nested \begin{env}
            const beginMatch = rest.match(BEGIN_RE);
            if (beginMatch) {
              envStack.push(beginMatch[1]);
            }
            // Closing \end{env}
            const endMatch = rest.match(END_RE);
            if (endMatch && endMatch[1] === envStack[envStack.length - 1]) {
              envStack.pop();
              if (envStack.length === 0) {
                inFence = false;
                fenceChar = "";
                const after = tail.slice(i + endMatch[0].length);
                bestSplit = scanFrom + i + endMatch[0].length + (after.startsWith("\n") ? 1 : 0);
              }
            }
          }
        }
      }
    }

    lastSplitIdxRef.current = bestSplit;
    return {
      committed: content.slice(0, bestSplit),
      pending: content.slice(bestSplit),
      isInFence: inFence,
      fenceChar,
    };
  }, [content]);
}
