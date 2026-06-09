import { lazy, type ReactNode } from "react";
import { TabContext, type TabContextValue } from "@/lib/tab-context";

// ── Lazy-loaded viewers (single canonical source) ──
export const CodeEditor = lazy(() => import("@/components/modules/editor/code-editor").then((m) => ({ default: m.CodeEditor })));
export const LatexEditor = lazy(() => import("@/components/modules/editor").then((m) => ({ default: m.LatexEditor })));
export const MarkdownPreview = lazy(() => import("@/components/modules/editor/markdown-preview").then((m) => ({ default: m.MarkdownPreview })));
export const ImageViewer = lazy(() => import("@/components/modules/editor/image-viewer").then((m) => ({ default: m.ImageViewer })));
export const PdfPreview = lazy(() => import("@/components/modules/preview").then((m) => ({ default: m.PdfPreview })));

export const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg"]);

/** Resolve the appropriate viewer component for a given file path based on extension. */
export function resolveViewer(filePath: string): ReactNode {
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return <ImageViewer />;
  if (ext === ".tex" || ext === ".ltx") return <LatexEditor />;
  if (ext === ".pdf") return <PdfPreview />;
  return <CodeEditor />;
}

/** Wrap children with TabContext provider for keep-alive tab state isolation. */
export function wrapTabContext(ctx: TabContextValue, children: ReactNode) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TabContext.Provider value={ctx}>{children}</TabContext.Provider>
    </div>
  );
}
