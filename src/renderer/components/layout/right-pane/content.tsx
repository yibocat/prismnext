import type { RightTab } from "@/stores/right-panel-store";
import { LatexEditor } from "@/components/modules/editor";
import { NoFileOpen } from "@/components/modules/editor/no-file-open";
import { PdfPreview } from "@/components/modules/preview";
import { GitPlaceholder } from "@/components/modules/git/git-placeholder";
import { BrowserPlaceholder } from "@/components/modules/browser/browser-placeholder";

const VIEWER_BY_EXT: Record<string, React.ComponentType> = {
  ".tex": LatexEditor,
  ".pdf": PdfPreview,
};

function resolveViewer(filePath: string): React.ComponentType {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return VIEWER_BY_EXT[ext] ?? LatexEditor;
}

export function PaneContent({ activeTab }: { activeTab: RightTab | undefined }) {
  if (!activeTab) return null;

  switch (activeTab.kind) {
    case "file": {
      if (activeTab.isInitial || !activeTab.filePath) return <NoFileOpen />;
      const Viewer = resolveViewer(activeTab.filePath);
      return <div className="flex-1 min-h-0"><Viewer /></div>;
    }
    case "git-overview":
      return <GitPlaceholder />;
    case "git-diff":
      return <div className="flex-1 min-h-0"><LatexEditor /></div>;
    case "texworkspace": {
      if (activeTab.isInitial || !activeTab.filePath) return <NoFileOpen />;
      const Viewer = resolveViewer(activeTab.filePath);
      return <div className="flex-1 min-h-0"><Viewer /></div>;
    }
    case "browser":
      return <BrowserPlaceholder />;
    default:
      return null;
  }
}
