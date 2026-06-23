import { memo, useCallback, useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import "katex/dist/katex.min.css";
import "@/styles/code-highlight.css";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useTabContext } from "@/lib/workspace/tab-context";
import { cn } from "@/lib/utils";
import {
  REMARK_PLUGINS,
  REHYPE_PLUGINS,
  MARKDOWN_COMPONENTS,
  DOCUMENT_MARKDOWN_TYPOGRAPHY,
  normalizeMathDelimiters,
} from "@/lib/markdown/markdown-config";
import { AppBrowserLink } from "@/components/modules/shared/app-browser-link";

/** CSS containment + GPU layer promotion.
 *  `contain: layout style paint` isolates this subtree from global reflow.
 *  `translateZ(0)` promotes the scroll container to a dedicated compositor
 *  layer so scrolling is pure GPU texture translation — zero layout/paint. */
const CONTAIN_STYLE: React.CSSProperties = {
  contain: "layout style paint",
  transform: "translateZ(0)",
} as React.CSSProperties;

// ─── Wikilink ───

function Wikilink({ target, children }: { target: string; children: React.ReactNode }) {
  const handleClick = useCallback(() => {
    const store = useRightPanelStore.getState();
    const docStore = useDocumentStore.getState();
    const targetLower = target.toLowerCase();
    const file = docStore.files.find(
      (f) =>
        f.name.toLowerCase() === targetLower ||
        f.name.toLowerCase().startsWith(targetLower) ||
        f.relativePath.toLowerCase().includes(targetLower),
    );
    if (file) store.openFile(file.id, file.relativePath, file.name);
  }, [target]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer"
      title={`Open "${target}"`}
    >
      {children}
    </button>
  );
}

// ─── Custom elements ───

const COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  a: ({ href, children, ...props }: any) => {
    if (href?.startsWith("wikilink:")) {
      const target = href.slice("wikilink:".length).split("#")[0];
      return <Wikilink target={target}>{children}</Wikilink>;
    }
    return <AppBrowserLink href={href} className="text-primary underline" {...props}>{children}</AppBrowserLink>;
  },
};

// ─── Markdown Preview ───

export const MarkdownPreview = memo(function MarkdownPreview() {
  const { tab } = useTabContext();
  const fileId = tab.fileId;
  // entry === undefined → IPC in flight, not yet loaded
  // entry !== undefined → content has been fetched from disk
  const entry = useDocumentStore((s) =>
    fileId ? s.openedContents.get(fileId) : undefined,
  );
  const content = entry?.content ?? "";
  const normalized = useMemo(() => normalizeMathDelimiters(content), [content]);
  const mdWidthLimited = useLayoutStore((s) => s.mdWidthLimited);

  // Deferred render — skip first paint so the UI stays responsive on open
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setTimeout(() => setPainted(true), 0));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Phase 1: content not loaded yet (IPC in flight) → skeleton
  if (!entry) {
    return (
      <div className="h-full overflow-auto px-6 py-4" style={CONTAIN_STYLE}>
        <div className="space-y-3 animate-pulse">
          <div className="h-5 w-2/3 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="h-3 w-3/4 rounded bg-muted" />
        </div>
      </div>
    );
  }

  // Phase 2: loaded but genuinely empty
  if (!content) {
    return (
      <div className="h-full overflow-auto px-6 py-4" style={CONTAIN_STYLE}>
        <div className="flex items-center justify-center h-32 text-[length:var(--font-size-12)] text-muted-foreground">
          Empty file
        </div>
      </div>
    );
  }

  // Phase 3: defer ReactMarkdown render past first paint
  if (!painted) {
    return (
      <div className="h-full overflow-auto px-6 py-4" style={CONTAIN_STYLE}>
        <div className="flex items-center justify-center h-32 text-[length:var(--font-size-12)] text-muted-foreground">
          Loading preview…
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-6 py-4" style={CONTAIN_STYLE}>
      <div className={cn(mdWidthLimited && "max-w-prose mx-auto")}>
        <div className={DOCUMENT_MARKDOWN_TYPOGRAPHY}>
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            components={COMPONENTS}
          >
            {normalized}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});
