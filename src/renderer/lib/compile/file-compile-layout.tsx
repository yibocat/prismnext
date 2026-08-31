import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { WorkspaceSplit } from "@/components/layout/workspace-split";
import { useCompileStore } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { compileEngineFromRelPath } from "@shared/compile/artifact-key";
import {
  previewOpenToViewMode,
  resolveCompileSplitCollapse,
  viewModeAfterPanelCollapse,
  type CompileViewMode,
} from "./compile-split";

export type FileCompileLayoutProps = {
  editor: ReactNode;
  preview: ReactNode;
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
  compileRoot: string;
  /** Typst live: opening the pane must not kick a PDF compile. */
  skipPreviewPdfCompile?: boolean;
};

function createContentHost(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.height = "100%";
  el.style.minHeight = "0";
  el.style.minWidth = "0";
  el.style.overflow = "hidden";
  return el;
}

/**
 * Files editor + preview split (PDF left, editor right).
 * LaTeX preview is Lector. Typst preview is Tinymist iframe or Lector, depending on the toolbar.
 */
export function FileCompileLayout({
  editor,
  preview,
  previewOpen,
  onPreviewOpenChange,
  compileRoot,
  skipPreviewPdfCompile,
}: FileCompileLayoutProps) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const effectiveMode = previewOpenToViewMode(previewOpen);
  const { leftCollapsed, rightCollapsed } = resolveCompileSplitCollapse(effectiveMode, false);

  const pdfHost = useMemo(() => createContentHost(), []);
  const editorHost = useMemo(() => createContentHost(), []);
  const leftSlotRef = useRef<HTMLDivElement>(null);
  const rightSlotRef = useRef<HTMLDivElement>(null);
  const [hostsAttached, setHostsAttached] = useState(false);

  const setMode = (mode: CompileViewMode) => {
    onPreviewOpenChange(mode !== "tex");
  };

  useEffect(() => {
    if (!previewOpen || !projectRoot || skipPreviewPdfCompile) return;
    if (compileEngineFromRelPath(compileRoot) === "typst") {
      void import("@/stores/typst-live-store").then((m) => {
        void m.compileTypstPdf(compileRoot, { skipIfCached: true });
      });
      return;
    }
    useCompileStore.getState().ensurePreviewCompile(compileRoot);
  }, [previewOpen, projectRoot, compileRoot, skipPreviewPdfCompile]);

  useEffect(() => {
    return () => {
      pdfHost.remove();
      editorHost.remove();
    };
  }, [pdfHost, editorHost]);

  useLayoutEffect(() => {
    const left = leftSlotRef.current;
    const right = rightSlotRef.current;
    if (!left || !right) return;
    left.appendChild(pdfHost);
    right.appendChild(editorHost);
    setHostsAttached(true);
  }, [pdfHost, editorHost]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceSplit
          left={<div ref={leftSlotRef} className="h-full min-h-0 min-w-0 overflow-hidden" />}
          right={<div ref={rightSlotRef} className="h-full min-h-0 min-w-0 overflow-hidden" />}
          leftId="pdf"
          rightId="editor"
          defaultLeft={60}
          layoutKey="pdf:editor"
          leftCollapsed={leftCollapsed}
          rightCollapsed={rightCollapsed}
          onLeftCollapsedChange={(collapsed) => {
            if (collapsed) setMode(viewModeAfterPanelCollapse("left", false));
            else setMode("split");
          }}
          onRightCollapsedChange={(collapsed) => {
            if (collapsed) setMode(viewModeAfterPanelCollapse("right", false));
            else setMode("split");
          }}
        />
      </div>
      {hostsAttached ? createPortal(<>{preview}</>, pdfHost) : null}
      {hostsAttached ? createPortal(<>{editor}</>, editorHost) : null}
    </div>
  );
}
