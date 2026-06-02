import type { RightTab } from "@/stores/right-panel-store";
import { TabContext, type TabContextValue } from "@/lib/tab-context";
import { LatexEditor } from "@/components/modules/editor";
import { CodeEditor } from "@/components/modules/editor/code-editor";
import { MarkdownPreview } from "@/components/modules/editor/markdown-preview";
import { NoFileOpen } from "@/components/modules/editor/no-file-open";
import { ImageViewer } from "@/components/modules/editor/image-viewer";
import { PdfPreview } from "@/components/modules/preview";
import { GitPlaceholder } from "@/components/modules/git/git-placeholder";
import { BrowserPlaceholder } from "@/components/modules/browser/browser-placeholder";
import { BrowserView } from "@/components/modules/browser/browser-view";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg"]);

function resolveViewer(filePath: string): React.ReactNode {
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return <ImageViewer />;
  if (ext === ".tex" || ext === ".ltx") return <LatexEditor />;
  if (ext === ".pdf") return <PdfPreview />;
  return <CodeEditor />;
}

interface PaneContentProps {
  activeTab: RightTab | undefined;
  /** Whether this tab is the globally active one */
  isActive: boolean;
}

function wrap(ctx: TabContextValue, children: React.ReactNode) {
  return (
    <div className="flex-1 min-h-0">
      <TabContext.Provider value={ctx}>{children}</TabContext.Provider>
    </div>
  );
}

export function PaneContent({ activeTab, isActive }: PaneContentProps) {
  if (!activeTab) return null;

  const ctx: TabContextValue = { tab: activeTab, isActive };

  switch (activeTab.kind) {
    case "file": {
      if (activeTab.isInitial || !activeTab.filePath)
        return wrap(ctx, <NoFileOpen />);
      if (activeTab.viewMode === "preview") {
        return wrap(ctx, <MarkdownPreview />);
      }
      return wrap(ctx, resolveViewer(activeTab.filePath));
    }
    case "git-overview":
      return wrap(ctx, <GitPlaceholder />);
    case "git-diff": {
      const viewer = activeTab.filePath ? resolveViewer(activeTab.filePath) : <CodeEditor />;
      return wrap(ctx, viewer);
    }
    case "texworkspace": {
      if (activeTab.isInitial || !activeTab.filePath)
        return wrap(ctx, <NoFileOpen />);
      return wrap(ctx, resolveViewer(activeTab.filePath));
    }
    case "browser":
      return wrap(ctx, <BrowserView />);
    default:
      return null;
  }
}
