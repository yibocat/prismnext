import { memo, useCallback, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "@/styles/code-highlight.css";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useTabContext } from "@/lib/tab-context";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import { cn } from "@/lib/utils";

// ─── Module-scope constants ───

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkWikilinks];
const REHYPE_PLUGINS = [rehypeKatex];

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

type AnyTagProps = React.PropsWithChildren<Record<string, unknown>>;

const COMPONENTS: Record<string, React.FC<AnyTagProps>> = {
  table: ({ children, ...rest }) => (
    <div className="my-4 overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="min-w-full" {...rest}>{children}</table>
      </div>
    </div>
  ),
  thead: ({ children, ...rest }) => (
    <thead className="border-b border-border" {...rest}>{children}</thead>
  ),
  th: ({ children, ...rest }) => (
    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground" {...rest}>{children}</th>
  ),
  td: ({ children, ...rest }) => (
    <td className="px-4 py-2.5 text-sm" {...rest}>{children}</td>
  ),
  tr: ({ children, ...rest }) => (
    <tr className="border-b border-border last:border-0" {...rest}>{children}</tr>
  ),
  a: ({ href, children, ...props }: { href?: string; children?: React.ReactNode; [key: string]: unknown }) => {
    if (href?.startsWith("wikilink:")) {
      const target = href.slice("wikilink:".length).split("#")[0];
      return <Wikilink target={target}>{children}</Wikilink>;
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline" {...props}>{children}</a>;
  },
};

const TYPOGRAPHY = cn(
  "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2",
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-1",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1",
  "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1",
  "[&_p]:my-1 [&_p]:leading-normal",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-0.5 [&_li]:leading-normal",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:my-2 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-[length:var(--font-code)]",
  "[&_.katex-display]:my-3 [&_.katex]:text-[length:var(--font-chat-message)]",
  "[&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:text-[length:var(--font-code)]",
);

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
        <div className={TYPOGRAPHY}>
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            components={COMPONENTS}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});
