import { useEffect, useRef } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useCompileStore } from "@/stores/compile-store";
import { LatexEditor } from "@/components/modules/editor";
import { NoFileOpen } from "@/components/modules/editor/no-file-open";
import { PdfPreview } from "@/components/modules/preview";
import { GitPlaceholder } from "@/components/modules/git/git-placeholder";
import { BrowserPlaceholder } from "@/components/modules/browser/browser-placeholder";
import { AiFab } from "@/components/modules/shared";

// ─── Viewer registry: extension → component ───

const VIEWER_BY_EXT: Record<string, React.ComponentType> = {
  ".tex": LatexEditor,
  ".pdf": PdfPreview,
};

function resolveViewer(filePath: string): React.ComponentType {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return VIEWER_BY_EXT[ext] ?? LatexEditor;
}

// ─── Right Main Area ───

export function RightMainArea() {
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const tabs = useRightPanelStore((s) => s.tabs);
  const openFile = useRightPanelStore((s) => s.openFile);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const pdfRevision = useCompileStore((s) => s.pdfRevision);

  const lastRevision = useRef(pdfRevision);
  useEffect(() => {
    if (pdfRevision > 0 && pdfRevision !== lastRevision.current) {
      lastRevision.current = pdfRevision;
      openFile("pdf:preview", "output.pdf", "PDF Preview");
    }
  }, [pdfRevision, openFile]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const renderContent = () => {
    if (!activeTab) return null;

    switch (activeTab.kind) {
      case "file": {
        if (activeTab.isInitial || !activeTab.filePath) return <NoFileOpen />;
        const Viewer = resolveViewer(activeTab.filePath);
        return (
          <div className="flex-1 min-h-0">
            <Viewer />
          </div>
        );
      }
      case "git-overview":
        return <GitPlaceholder />;
      case "git-diff":
        return (
          <div className="flex-1 min-h-0">
            <LatexEditor />
          </div>
        );
      case "browser":
        return <BrowserPlaceholder />;
      default:
        return null;
    }
  };

  return (
    <div className="relative flex h-full flex-col min-w-[150px]">
      {renderContent()}
      {editorMaximized && <AiFab />}
    </div>
  );
}
