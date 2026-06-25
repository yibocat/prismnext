import { getChunks } from "@codemirror/merge";
import {
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  lineNumbers,
} from "@codemirror/view";
import {
  buildLineKindMap,
  type DiffLineKind,
} from "./diff-chunk-lines";

function applyGutterKind(el: HTMLElement, kind: DiffLineKind) {
  el.classList.add(kind === "del" ? "git-diff-gutter-row-del" : "git-diff-gutter-row-ins");
}

function gutterElementForLineNo(lineGutter: Element, lineNo: number): HTMLElement | null {
  const lineNoStr = String(lineNo);
  for (const el of lineGutter.querySelectorAll(".cm-gutterElement")) {
    if (el.textContent?.trim() === lineNoStr) return el as HTMLElement;
  }
  return null;
}

/** Paint red on empty gutter rows overlapping unified deletion chunk widgets. */
function syncUnifiedDeletionGutter(view: EditorView, lineGutter: Element): void {
  const chunks = view.dom.querySelectorAll(".cm-deletedChunk");
  if (!chunks.length) return;

  for (const el of lineGutter.querySelectorAll(".cm-gutterElement")) {
    if (el.textContent?.trim()) continue;
    const gRect = (el as HTMLElement).getBoundingClientRect();
    if (gRect.height === 0) continue;

    for (const chunk of chunks) {
      const cRect = chunk.getBoundingClientRect();
      if (gRect.bottom > cRect.top + 1 && gRect.top < cRect.bottom - 1) {
        el.classList.add("git-diff-gutter-row-del");
        break;
      }
    }
  }
}

function chunksChanged(view: EditorView, prevState: EditorView["state"]): boolean {
  const cur = getChunks(view.state);
  const prev = getChunks(prevState);
  if (!cur && !prev) return false;
  if (!cur || !prev) return true;
  if (cur.side !== prev.side) return true;
  if (cur.chunks.length !== prev.chunks.length) return true;
  for (let i = 0; i < cur.chunks.length; i++) {
    const c = cur.chunks[i];
    const p = prev.chunks[i];
    if (
      c.fromA !== p.fromA ||
      c.toA !== p.toA ||
      c.fromB !== p.fromB ||
      c.toB !== p.toB
    ) {
      return true;
    }
  }
  return false;
}

function syncUnifiedGutter(
  view: EditorView,
  lineGutter: Element,
  kindMap: Map<number, DiffLineKind>,
) {
  for (const [lineNo, kind] of kindMap) {
    const gutterEl = gutterElementForLineNo(lineGutter, lineNo);
    if (!gutterEl) continue;
    applyGutterKind(gutterEl, kind);
  }
  syncUnifiedDeletionGutter(view, lineGutter);
}

function syncDiffGutterRows(view: EditorView) {
  const lineGutter = view.dom.querySelector(".cm-lineNumbers");
  if (!lineGutter) return;

  lineGutter.querySelectorAll(".cm-gutterElement").forEach((el) => {
    el.classList.remove("git-diff-gutter-row-del", "git-diff-gutter-row-ins");
  });

  const result = getChunks(view.state);
  if (!result) return;

  const kindMap = buildLineKindMap(view.state.doc, result.chunks, result.side);
  const isUnified = Boolean(view.dom.closest(".git-diff-unified"));

  if (isUnified) {
    syncUnifiedGutter(view, lineGutter, kindMap);
    return;
  }

  for (const [lineNo, kind] of kindMap) {
    const gutterEl = gutterElementForLineNo(lineGutter, lineNo);
    if (!gutterEl) continue;
    applyGutterKind(gutterEl, kind);
  }
}

const gitDiffGutterPlugin = ViewPlugin.fromClass(
  class {
    constructor(public view: EditorView) {
      this.schedule();
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.geometryChanged ||
        u.viewportChanged ||
        chunksChanged(u.view, u.startState)
      ) {
        this.schedule();
      }
    }
    schedule() {
      requestAnimationFrame(() => {
        if (!this.view.dom.isConnected) return;
        syncDiffGutterRows(this.view);
      });
    }
  },
);

/** Gutter row accent styling driven by merge chunks. */
export function gitDiffGutterExtension() {
  return gitDiffGutterPlugin;
}

/** Line numbers (gutter chrome is added via gitDiffChromeCompartment). */
export function gitDiffLineNumbers() {
  return [lineNumbers()];
}

/** @internal test helper */
export function gutterElementForLineNoForTest(lineGutter: Element, lineNo: number) {
  return gutterElementForLineNo(lineGutter, lineNo);
}
