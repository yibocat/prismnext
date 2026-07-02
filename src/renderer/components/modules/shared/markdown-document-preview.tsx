import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import "katex/dist/katex.min.css";
import "@/styles/code-highlight.css";
import { useLayoutStore } from "@/stores/layout-store";
import { splitMarkdownFrontmatter } from "@/lib/markdown/frontmatter";
import { cn } from "@/lib/utils";
import {
  MARKDOWN_COMPONENTS,
  DOCUMENT_MARKDOWN_TYPOGRAPHY,
  prepareDocumentMarkdown,
  remarkPluginsForProfile,
  rehypePluginsForProfile,
  type MarkdownPreviewProfile,
} from "@/lib/markdown/markdown-config";
import { AppBrowserLink } from "@/components/modules/shared/app-browser-link";
import { MarkdownFrontmatterCard } from "./markdown-frontmatter-card";

const CONTAIN_STYLE: React.CSSProperties = {
  contain: "layout style paint",
  transform: "translateZ(0)",
};

const DEFAULT_LINK_COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  a: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <AppBrowserLink href={href} className="text-primary underline" {...props}>
      {children}
    </AppBrowserLink>
  ),
};

export type MarkdownDocumentPreviewVariant = "default" | "skill" | "rule";

export interface MarkdownDocumentPreviewProps {
  content: string;
  className?: string;
  variant?: MarkdownDocumentPreviewVariant;
  /** Extract paths skip citation-ref plugin so paper `[1]` stays literal; math/rehype stack is identical. */
  previewProfile?: MarkdownPreviewProfile;
  emptyMessage?: string;
  loadingMessage?: string;
  markdownComponents?: Components;
  /** Optional label above the rendered body when frontmatter is present. */
  bodySectionLabel?: string;
  footer?: ReactNode;
}

export const MarkdownDocumentPreview = memo(function MarkdownDocumentPreview({
  content,
  className,
  variant = "default",
  previewProfile = "default",
  emptyMessage = "Nothing to preview yet.",
  loadingMessage = "Loading preview…",
  markdownComponents = DEFAULT_LINK_COMPONENTS,
  bodySectionLabel,
  footer,
}: MarkdownDocumentPreviewProps) {
  const split = useMemo(() => splitMarkdownFrontmatter(content), [content]);
  const bodyNormalized = useMemo(
    () => prepareDocumentMarkdown(split.body, previewProfile),
    [split.body, previewProfile],
  );
  const remarkPlugins = useMemo(
    () => remarkPluginsForProfile(previewProfile),
    [previewProfile],
  );
  const rehypePlugins = useMemo(
    () => rehypePluginsForProfile(previewProfile),
    [previewProfile],
  );
  const mdWidthLimited = useLayoutStore((s) => s.mdWidthLimited);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setTimeout(() => setPainted(true), 0));
    return () => cancelAnimationFrame(raf);
  }, []);

  const hasBody = split.body.trim().length > 0;
  const isEmpty = !content.trim();
  const showBodyLabel = bodySectionLabel !== undefined;

  if (isEmpty) {
    return (
      <div className={cn("h-full overflow-auto px-6 py-4", className)} style={CONTAIN_STYLE}>
        <div className="flex items-center justify-center h-32 text-[length:var(--font-size-12)] text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    );
  }

  if (!painted) {
    return (
      <div className={cn("h-full overflow-auto px-6 py-4", className)} style={CONTAIN_STYLE}>
        <div className="flex items-center justify-center h-32 text-[length:var(--font-size-12)] text-muted-foreground">
          {loadingMessage}
        </div>
      </div>
    );
  }

  const resolvedBodyLabel = showBodyLabel ? bodySectionLabel : undefined;

  return (
    <div className={cn("h-full overflow-auto px-6 py-4", className)} style={CONTAIN_STYLE}>
      <div className={cn(mdWidthLimited && "max-w-prose mx-auto")}>
        {split.hasFrontmatter && (
          <MarkdownFrontmatterCard
            fields={split.fields}
            rawFrontmatter={split.rawFrontmatter}
            variant={variant}
          />
        )}

        {hasBody ? (
          <div>
            {resolvedBodyLabel && (
              <p className="text-[length:var(--font-size-11)] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {resolvedBodyLabel}
              </p>
            )}
            <div className={DOCUMENT_MARKDOWN_TYPOGRAPHY}>
              <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
              >
                {bodyNormalized}
              </ReactMarkdown>
            </div>
          </div>
        ) : split.hasFrontmatter ? (
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            No instruction body below frontmatter.
          </p>
        ) : null}

        {footer}
      </div>
    </div>
  );
});
