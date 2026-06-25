import { memo, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import "katex/dist/katex.min.css";
import { REMARK_PLUGINS, REHYPE_PLUGINS, MARKDOWN_COMPONENTS, CHAT_MARKDOWN_TYPOGRAPHY, normalizeMathDelimiters } from "@/lib/markdown/markdown-config";
import { ShikiCodeBlock } from "./shiki-code-block";
import { cn } from "@/lib/utils";
import { openProjectFileFromChat } from "@/lib/files/open-project-file";
import { useDocumentStore } from "@/stores/document-store";
import { AppBrowserLink } from "@/components/modules/shared/app-browser-link";

function ChatWikilink({ target, children }: { target: string; children: React.ReactNode }) {
  const handleClick = useCallback(() => {
    const docStore = useDocumentStore.getState();
    const targetLower = target.toLowerCase();
    const file = docStore.files.find(
      (f) =>
        f.name.toLowerCase() === targetLower
        || f.name.toLowerCase().startsWith(targetLower)
        || f.relativePath.toLowerCase().endsWith(targetLower)
        || f.relativePath.toLowerCase().includes(targetLower),
    );
    if (file) {
      void openProjectFileFromChat(file.relativePath);
      return;
    }
    void openProjectFileFromChat(target);
  }, [target]);

  return (
    <span
      role="link"
      tabIndex={0}
      className="text-primary underline decoration-dotted underline-offset-2 cursor-pointer"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        handleClick();
      }}
    >
      {children}
    </span>
  );
}

const COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  code: ShikiCodeBlock as any,
  a: ({ href, children, ...props }: any) => {
    if (href?.startsWith("wikilink:")) {
      const target = href.slice("wikilink:".length).split("#")[0];
      return <ChatWikilink target={target}>{children}</ChatWikilink>;
    }
    return (
      <AppBrowserLink href={href}>
        {children}
      </AppBrowserLink>
    );
  },
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
