import { useEffect, useRef } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useCompileStore } from "@/stores/compile-store";
import { LatexEditor } from "@/components/workspace/latex-editor";
import { PdfPreview } from "@/components/workspace/pdf-preview";
import { AiFab } from "@/components/workspace/ai-fab";
import { GitBranchIcon, GlobeIcon, FilePlusIcon } from "lucide-react";

// ─── Viewer registry: extension → component ───

const VIEWER_BY_EXT: Record<string, React.ComponentType> = {
  ".tex": LatexEditor,
  ".pdf": PdfPreview,
  // Future: ".png": ImageViewer, ".md": MarkdownEditor, etc.
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
      <p className="text-sm">Git changes will appear here</p>
      <p className="text-xs opacity-50">Coming soon</p>
    </div>
  );
}

function BrowserPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <GlobeIcon className="size-10 opacity-30" />
      <p className="text-sm">Browser will appear here</p>
      <p className="text-xs opacity-50">Coming soon</p>
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
        <p className="mt-3 text-[13px] text-muted-foreground">No open files</p>
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

  // Auto-create tab on PDF compile success
  const lastRevision = useRef(pdfRevision);
  useEffect(() => {
    if (pdfRevision > 0 && pdfRevision !== lastRevision.current) {
      lastRevision.current = pdfRevision;
      openFile("pdf:preview", "output.pdf", "PDF Preview");
    }
  }, [pdfRevision, openFile]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // No tabs at all
  if (!activeTab) {
    return (
      <div className="flex flex-1 flex-col min-w-[150px]" />
    );
  }

  // Render based on tab kind
  switch (activeTab.kind) {
    case "file": {
      if (activeTab.isInitial || !activeTab.filePath) {
        return (
          <div className="flex flex-1 flex-col min-w-[150px]">
            <NoFileOpen />
          </div>
        );
      }
      const Viewer = resolveViewer(activeTab.filePath);
      return (
        <div className="flex flex-1 flex-col min-w-[150px]">
          <div className="relative flex-1 min-h-0">
            <Viewer />
            {editorMaximized && <AiFab />}
          </div>
        </div>
      );
    }

    case "git-overview":
      return <GitPlaceholder />;

    case "git-diff":
      return (
        <div className="flex flex-1 flex-col min-w-[150px]">
          <div className="relative flex-1 min-h-0">
            <LatexEditor />
            {editorMaximized && <AiFab />}
          </div>
        </div>
      );

    case "browser":
      return <BrowserPlaceholder />;

    default:
      return null;
  }
}
