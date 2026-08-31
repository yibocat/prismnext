import { compileEngineFromRelPath } from "@shared/compile/artifact-key";

/** Which panel is visible in a compile split (PDF left, editor right). */
export type CompileViewMode = "split" | "tex" | "pdf";

/** Typst opens the live SVG pane by default. LaTeX stays editor-first. */
export function defaultCompilePreviewOpen(fileRel: string): boolean {
  return compileEngineFromRelPath(fileRel) === "typst";
}

export function resolveCompilePreviewOpen(
  stored: boolean | undefined,
  fileRel: string,
): boolean {
  return stored ?? defaultCompilePreviewOpen(fileRel);
}

/** Which panel collapses for a view mode (slots stay left→right; swap only moves content). */
export function resolveCompileSplitCollapse(
  viewMode: CompileViewMode,
  panesSwapped: boolean,
): { leftCollapsed: boolean; rightCollapsed: boolean } {
  const hidePdf = viewMode === "tex";
  const hideEditor = viewMode === "pdf";
  return {
    leftCollapsed: panesSwapped ? hideEditor : hidePdf,
    rightCollapsed: panesSwapped ? hidePdf : hideEditor,
  };
}

/** Sash drag → view mode when a panel collapses. */
export function viewModeAfterPanelCollapse(
  side: "left" | "right",
  panesSwapped: boolean,
): CompileViewMode {
  if (side === "left") return panesSwapped ? "pdf" : "tex";
  return panesSwapped ? "tex" : "pdf";
}

export function previewOpenToViewMode(previewOpen: boolean): CompileViewMode {
  return previewOpen ? "split" : "tex";
}
