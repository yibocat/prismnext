import { useEffect, useRef } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useCompileStore } from "@/stores/compile-store";
import { LatexEditor } from "@/components/modules/editor";
import { PdfPreview } from "@/components/modules/preview";
import { AiFab } from "@/components/modules/shared";
import { GitBranchIcon, GlobeIcon, FilePlusIcon } from "lucide-react";

// ─── Viewer registry: extension → component ───

const VIEWER_BY_EXT: Record<string, React.ComponentType> = {
  ".tex": LatexEditor,
  ".pdf": PdfPreview,
};

function resolveViewer(filePath: string): React.ComponentType {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return VIEWER_BY_EXT[ext] ?? LatexEditor;
}

// ─── Placeholders ───

function GitPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <GitBranchIcon className="size-10 opacity-30" />
      <p className="text-[length:var(--font-placeholder)]">Git changes will appear here</p>
      <p className="text-[length:var(--font-placeholder)] opacity-50">Coming soon</p>
    </div>
  );
}

function BrowserPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <GlobeIcon className="size-10 opacity-30" />
      <p className="text-[length:var(--font-placeholder)]">Browser will appear here</p>
      <p className="text-[length:var(--font-placeholder)] opacity-50">Coming soon</p>
    </div>
  );
}

function NoFileOpen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted mx-auto">
          <FilePlusIcon className="size-7 text-muted-foreground" />
        </div>
        <p className="mt-3 text-[length:var(--font-empty-state)] text-muted-foreground">No open files</p>
      </div>
    </div>
  );
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
