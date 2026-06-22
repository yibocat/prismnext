import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import "katex/dist/katex.min.css";
import { REMARK_PLUGINS, REHYPE_PLUGINS, MARKDOWN_COMPONENTS, CHAT_MARKDOWN_TYPOGRAPHY, normalizeMathDelimiters } from "@/lib/markdown-config";
import { ShikiCodeBlock } from "./shiki-code-block";
import { cn } from "@/lib/utils";

const COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  code: ShikiCodeBlock as any,
};

/**
 * Memoized react-markdown renderer for stable (committed) markdown blocks.
 * Renders ONCE and doesn't re-render on subsequent stream deltas.
 */
export const StaticMarkdown = memo(function StaticMarkdown({
  content,
}: {
  content: string;
}) {
  if (!content) return null;

  const normalized = useMemo(() => normalizeMathDelimiters(content), [content]);

  return (
    <div className={cn("text-[length:var(--font-chat-message)] text-foreground leading-normal min-w-0 max-w-full overflow-hidden", CHAT_MARKDOWN_TYPOGRAPHY)}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
});
