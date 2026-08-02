import { memo, useMemo, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import "katex/dist/katex.min.css";
import {
  MARKDOWN_COMPONENTS,
  CHAT_MARKDOWN_TYPOGRAPHY,
  prepareMarkdownForChat,
  MARKDOWN_REMARK_BASE,
  rehypePluginsForSurface,
} from "@/lib/markdown/markdown-config";
import { remarkCitationRefs } from "@/lib/markdown/remark-citation-refs";
import { remarkLibraryCiteRefs } from "@/lib/markdown/remark-library-cite-refs";
import { remarkProjectFileRefs } from "@/lib/markdown/remark-project-file-refs";
import { remarkExperimentRefs } from "@/lib/markdown/remark-experiment-refs";
import { decodeProjectFileHref } from "@/lib/markdown/project-file-ref";
import { decodeExperimentRefHref } from "@/lib/markdown/experiment-ref";
import { useLiteratureStore } from "@/stores/literature-store";
import { useDocumentStore } from "@/stores/document-store";
import { ShikiCodeBlock } from "./shiki-code-block";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import { jumpToStagedCitation } from "@/lib/literature/jump-to-staged-citation";
import {
  decodeLibraryCiteHref,
  LibraryCitationInline,
} from "./library-citation-inline";
import {
  decodeLibraryFigureHref,
  LiteratureFigureInline,
} from "./literature-figure-inline";
import { isLibraryExtractFigurePath } from "@shared/paper-extract-images";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { ChatFileInline, resolveChatFilePath } from "./chat-file-inline";
import { ChatExperimentInline } from "./chat-experiment-inline";
import { ChatArtifactBlock } from "@/lib/markdown/chat-artifact-block";
import { AppBrowserLink } from "@/components/modules/shared/app-browser-link";

function linkChildText(children: ReactNode): string | undefined {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) {
    const text = children
      .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
      .join("");
    return text || undefined;
  }
  return undefined;
}

function ChatWikilink({ target, children }: { target: string; children: ReactNode }) {
  const path = resolveChatFilePath(target);
  const childText = linkChildText(children);

  return <ChatFileInline path={path} label={childText} />;
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
    <Hint label={`Open citation [${n}] in Literature → Session citations`}>
      <button
        type="button"
        className="mx-0.5 inline-flex items-center rounded-[3px] px-1 align-baseline font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
        onClick={() => jumpToStagedCitation(sessionId, n)}
      >
        [{n}]
      </button>
    </Hint>
  );
}

export const StaticMarkdown = memo(function StaticMarkdown({
  content,
  sessionId,
  muted = false,
}: {
  content: string;
  sessionId?: string;
  /** Slightly weaker body color (e.g. interim prose inside Worked for). */
  muted?: boolean;
}) {
  if (!content) return null;

  const normalized = useMemo(() => prepareMarkdownForChat(content), [content]);
  const bibkeyFingerprint = useLiteratureStore((s) =>
    s.papers.map((p) => p.bibkey).join("\u0000"),
  );
  const knownBibkeySet = useMemo(() => {
    if (!bibkeyFingerprint) return new Set<string>();
    return new Set(bibkeyFingerprint.split("\u0000"));
  }, [bibkeyFingerprint]);
  const projectPathFingerprint = useDocumentStore((s) =>
  `${s.files.map((f) => f.relativePath).join("\u0000")}\u0001${s.folders.join("\u0000")}`,
  );
  const knownProjectPaths = useMemo(() => {
    const paths = new Set<string>();
    if (!projectPathFingerprint) return paths;
    const [filePart, folderPart] = projectPathFingerprint.split("\u0001");
    for (const rel of filePart?.split("\u0000") ?? []) {
      if (rel) paths.add(rel);
    }
    for (const folder of folderPart?.split("\u0000") ?? []) {
      if (folder) paths.add(folder);
    }
    return paths;
  }, [projectPathFingerprint]);
  const stagedCitationFingerprint = useCitationStagingStore((s) => {
    if (!sessionId) return "";
    return (s.bySession[sessionId] ?? [])
      .map((c) => c.refId)
      .filter((id): id is number => typeof id === "number" && id > 0)
      .join("\u0000");
  });
  const stagedRefIds = useMemo(() => {
    if (!stagedCitationFingerprint) return new Set<number>();
    return new Set(
      stagedCitationFingerprint
        .split("\u0000")
        .map((n) => Number.parseInt(n, 10))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
  }, [stagedCitationFingerprint]);
  const remarkPlugins = useMemo<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]>(
    () => [
      ...MARKDOWN_REMARK_BASE,
      ...(stagedRefIds.size > 0
        ? ([[remarkCitationRefs, { stagedRefIds }] as const] as const)
        : []),
      [remarkLibraryCiteRefs, { knownBibkeys: knownBibkeySet }] as const,
      [remarkProjectFileRefs, { knownProjectPaths }] as const,
      remarkExperimentRefs,
    ],
    [knownBibkeySet, knownProjectPaths, stagedRefIds],
  );
  const rehypePlugins = useMemo(() => rehypePluginsForSurface("chat"), []);

  const components = useMemo<Components>(() => {
    const base: Components = {
      ...MARKDOWN_COMPONENTS,
      code: ShikiCodeBlock as any,
      img: ({ src, alt }: ComponentProps<"img">) => {
        if (typeof src !== "string" || !src.trim()) return null;
        if (isLibraryExtractFigurePath(src)) {
          return <ChatArtifactBlock path={src} title={alt} kind="image" />;
        }
        return <ChatArtifactBlock path={src} title={alt} kind="image" />;
      },
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
        const libraryFigure = href ? decodeLibraryFigureHref(href) : null;
        if (libraryFigure) {
          return (
            <LiteratureFigureInline
              bibkey={libraryFigure.bibkey}
              imageRel={libraryFigure.imageRel}
            />
          );
        }
        const projectPath = href ? decodeProjectFileHref(href) : null;
        if (projectPath) {
          return (
            <ChatFileInline
              path={projectPath}
              label={linkChildText(children)}
            />
          );
        }
        const experimentId = href ? decodeExperimentRefHref(href) : null;
        if (experimentId) {
          return <ChatExperimentInline experimentId={experimentId} />;
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
    <div
      className={cn(
        "text-[length:var(--font-chat-message)] leading-[1.7] min-w-0 max-w-full overflow-hidden",
        muted ? "text-muted-foreground" : "text-foreground",
        CHAT_MARKDOWN_TYPOGRAPHY,
      )}
    >
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
