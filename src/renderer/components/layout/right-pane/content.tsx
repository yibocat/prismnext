import { useMemo, lazy, Suspense } from "react";
import type { RightTab } from "@/stores/right-panel-store";
import { TabContext, type TabContextValue } from "@/lib/tab-context";
import { NoFileOpen } from "@/components/modules/editor/no-file-open";
import { GitPlaceholder } from "@/components/modules/git/git-placeholder";
import { BrowserPlaceholder } from "@/components/modules/browser/browser-placeholder";
import { useDocumentStore } from "@/stores/document-store";

// ── All viewers are lazy-loaded. This keeps CodeMirror (~4 MB), pdfjs-dist,
//    react-markdown, katex, xterm, and every other heavy dependency out of the
//    main bundle. The window appears instantly; viewers load on first use. ──
const CodeEditor = lazy(() => import("@/components/modules/editor/code-editor").then((m) => ({ default: m.CodeEditor })));
const LatexEditor = lazy(() => import("@/components/modules/editor").then((m) => ({ default: m.LatexEditor })));
const MarkdownPreview = lazy(() => import("@/components/modules/editor/markdown-preview").then((m) => ({ default: m.MarkdownPreview })));
const ImageViewer = lazy(() => import("@/components/modules/editor/image-viewer").then((m) => ({ default: m.ImageViewer })));
const PdfPreview = lazy(() => import("@/components/modules/preview").then((m) => ({ default: m.PdfPreview })));
const TerminalView = lazy(() => import("@/components/modules/terminal").then((m) => ({ default: m.TerminalView })));
const BrowserView = lazy(() => import("@/components/modules/browser/browser-view").then((m) => ({ default: m.BrowserView })));
const GitOverview = lazy(() => import("@/components/modules/git/git-overview").then((m) => ({ default: m.GitOverview })));

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
    <div className="flex flex-col flex-1 min-h-0">
      <TabContext.Provider value={ctx}>{children}</TabContext.Provider>
    </div>
  );
}

export function PaneContent({ activeTab, isActive }: PaneContentProps) {
  if (!activeTab) return null;

  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const ctx: TabContextValue = useMemo(
    () => ({ tab: activeTab, isActive }),
    [activeTab, isActive],
  );

  const content = (() => {
    switch (activeTab.kind) {
      case "file": {
        if (activeTab.isInitial || !activeTab.filePath)
          return wrap(ctx, <NoFileOpen />);
        if (activeTab.viewMode === "preview") {
          if (!isActive) return null;
          return wrap(ctx, <MarkdownPreview />);
        }
        return wrap(ctx, resolveViewer(activeTab.filePath));
      }
      case "git-overview":
        return wrap(ctx, <GitOverview projectRoot={projectRoot ?? ""} />);
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
      case "terminal":
        return wrap(ctx, <TerminalView tabId={activeTab.id} />);
      default:
        return null;
    }
  })();

  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="w-32 h-4 rounded bg-muted animate-pulse" />
      </div>
    }>
      {content}
    </Suspense>
  );
}
