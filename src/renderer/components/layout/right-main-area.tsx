import { useEffect, useRef } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useCompileStore } from "@/stores/compile-store";
import { Group, Panel, Separator } from "react-resizable-panels";
import { RightPane } from "@/components/layout/right-pane";
import { PdfPreview } from "@/components/modules/preview";
import { AiFab } from "@/components/modules/shared";

const SEP = "w-px bg-border hover:bg-primary/40 transition-colors outline-none";

export function RightMainArea() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const previewViewMode = useLayoutStore((s) => s.previewViewMode);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const pdfRevision = useCompileStore((s) => s.pdfRevision);

  const isPreviewActive = activeTab?.kind === "preview";

  // Compile completion → switch to Preview tab
  const lastRevision = useRef(pdfRevision);
  useEffect(() => {
    if (pdfRevision > 0 && pdfRevision !== lastRevision.current) {
      lastRevision.current = pdfRevision;
      const state = useRightPanelStore.getState();
      const current = state.tabs.find((t) => t.id === state.activeTabId);
      if (current?.kind === "file" && current.fileId?.endsWith(".tex") && current.filePath && current.fileId) {
        useRightPanelStore.getState().switchToPreview(current.fileId, current.filePath, current.title);
      }
    }
  }, [pdfRevision]);

  if (!isPreviewActive) {
    return (
      <div className="relative flex h-full flex-col min-w-[150px]">
        <RightPane />
        {editorMaximized && <AiFab />}
      </div>
    );
  }

  if (previewViewMode === "tex") {
    return (
      <div className="relative flex h-full flex-col min-w-[150px]">
        <RightPane />
        {editorMaximized && <AiFab />}
      </div>
    );
  }

  if (previewViewMode === "pdf") {
    return (
      <div className="relative flex h-full flex-col min-w-[150px]">
        <PdfPreview />
        {editorMaximized && <AiFab />}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col min-w-[150px]">
      <Group orientation="horizontal" className="flex-1 min-h-0" resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}>
        <Panel id="editor" minSize={150} defaultSize={60}>
          <RightPane />
        </Panel>
        <Separator id="sep-pdf" className={SEP} />
        <Panel id="pdf" minSize={150} defaultSize={40}>
          <PdfPreview />
        </Panel>
      </Group>
      {editorMaximized && <AiFab />}
    </div>
  );
}
