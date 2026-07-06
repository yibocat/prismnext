import { memo, useMemo, useCallback, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import "katex/dist/katex.min.css";
import {
  MARKDOWN_COMPONENTS,
  CHAT_MARKDOWN_TYPOGRAPHY,
  prepareMarkdownMath,
  MARKDOWN_REMARK_BASE,
  rehypePluginsForSurface,
} from "@/lib/markdown/markdown-config";
import { remarkCitationRefs } from "@/lib/markdown/remark-citation-refs";
import { remarkLibraryCiteRefs } from "@/lib/markdown/remark-library-cite-refs";
import { useLiteratureStore } from "@/stores/literature-store";
import { ShikiCodeBlock } from "./shiki-code-block";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import { jumpToStagedCitation } from "@/lib/literature/jump-to-staged-citation";
import {
  decodeLibraryCiteHref,
  LibraryCitationInline,
} from "./library-citation-inline";
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

/** Citation ref button rendered for `[n]` markers that match a staged citation. */
function CitationRefLink({ n, sessionId }: { n: number; sessionId: string }) {
  const hasRef = useCitationStagingStore((s) =>
    (s.bySession[sessionId] ?? []).some((c) => c.refId === n),
  );
  if (!hasRef) {
    // No matching staged citation — render as plain text, not clickable.
    return <span>[{n}]</span>;
  }
  return (
    <button
      type="button"
      className="mx-0.5 inline-flex items-center rounded-[3px] px-1 align-baseline font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
      title={`Open citation [${n}] in Literature → Session citations`}
      onClick={() => jumpToStagedCitation(sessionId, n)}
    >
      [{n}]
    </button>
  );
}

export const StaticMarkdown = memo(function StaticMarkdown({
  content,
  sessionId,
}: {
  content: string;
  sessionId?: string;
}) {
  if (!content) return null;

  const normalized = useMemo(() => prepareMarkdownMath(content), [content]);
  const bibkeyFingerprint = useLiteratureStore((s) =>
    s.papers.map((p) => p.bibkey).join("\u0000"),
  );
  const knownBibkeySet = useMemo(() => {
    if (!bibkeyFingerprint) return new Set<string>();
    return new Set(bibkeyFingerprint.split("\u0000"));
  }, [bibkeyFingerprint]);
  const remarkPlugins = useMemo<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]>(
    () => [
      ...MARKDOWN_REMARK_BASE,
      remarkCitationRefs,
      [remarkLibraryCiteRefs, { knownBibkeys: knownBibkeySet }] as const,
    ],
    [knownBibkeySet],
  );
  const rehypePlugins = useMemo(() => rehypePluginsForSurface("chat"), []);

  const components = useMemo<Components>(() => {
    const base: Components = {
      ...MARKDOWN_COMPONENTS,
      code: ShikiCodeBlock as any,
      a: ({ href, children, ...props }: any) => {
        if (href?.startsWith("wikilink:")) {
          const target = href.slice("wikilink:".length).split("#")[0];
          return <ChatWikilink target={target}>{children}</ChatWikilink>;
        }
        if (href?.startsWith("citation:")) {
          const n = Number.parseInt(href.slice("citation:".length), 10);
          if (Number.isFinite(n) && n > 0 && sessionId) {
            return <CitationRefLink n={n} sessionId={sessionId} />;
          }
          // No session context — render the literal text the remark plugin emitted.
          return <span>{children}</span>;
        }
        const libraryBibkey = href ? decodeLibraryCiteHref(href) : null;
        if (libraryBibkey) {
          return <LibraryCitationInline bibkey={libraryBibkey} />;
        }
        return (
          <AppBrowserLink href={href}>
            {children}
          </AppBrowserLink>
        );
      },
    };
    return base;
  }, [sessionId]);

  return (
    <div className={cn("text-[length:var(--font-chat-message)] text-foreground leading-relaxed min-w-0 max-w-full overflow-hidden", CHAT_MARKDOWN_TYPOGRAPHY)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={(url) => url}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
});
