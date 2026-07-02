import { useMemo } from "react";
import { ChevronDownIcon, ListIcon } from "lucide-react";
import { useLiteratureStore } from "@/stores/literature-store";
import { useChatStore } from "@/stores/chat-store";
import { useCitationStagingStore, EMPTY_STAGED_CITATIONS, isCitationInLibrary } from "@/stores/citation-staging-store";
import { cn } from "@/lib/utils";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuTrigger,
} from "@/components/ui/app-menu";

export type LiteratureLibrarySubview = "library" | "session-citations";

const toolbarBtn = cn(
  "inline-flex items-center gap-1 h-6 border-0 bg-transparent px-0",
  "text-[length:var(--font-menu-item)] text-muted-foreground shrink-0 min-w-0",
  "transition-colors hover:text-foreground data-[state=open]:text-foreground",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/35 rounded-sm",
);

function subviewTriggerLabel(
  subview: LiteratureLibrarySubview,
  entryCount: number,
  citationCount: number,
): string {
  if (subview === "session-citations") {
    return citationCount === 0
      ? "Session citations"
      : `${citationCount} session citation${citationCount === 1 ? "" : "s"}`;
  }
  return entryCount === 0 ? "All entries" : `${entryCount} entries`;
}

export function LiteratureLibrarySubviewDropdown({ compact = false }: { compact?: boolean }) {
  const subview = useLiteratureStore((s) => s.librarySubview);
  const setSubview = useLiteratureStore((s) => s.setLibrarySubview);
  const entryCount = useLiteratureStore((s) => s.papers.length);
  const papers = useLiteratureStore((s) => s.papers);
  const libraryPaperIdSet = useMemo(() => new Set(papers.map((p) => p.id)), [papers]);
  const chatSessionId = useChatStore((s) => s.sessionId);
  const citations = useCitationStagingStore((s) => {
    if (!chatSessionId) return EMPTY_STAGED_CITATIONS;
    if (s.panelHiddenSessions[chatSessionId]) return EMPTY_STAGED_CITATIONS;
    return s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS;
  });
  const citationCount = citations.length;
  const pendingCount = citations.filter(
    (c) => !isCitationInLibrary(c, libraryPaperIdSet),
  ).length;

  const triggerLabel = subviewTriggerLabel(subview, entryCount, citationCount);

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            toolbarBtn,
            compact ? "relative size-6 justify-center font-medium" : "max-w-[11rem] font-medium",
          )}
          title={triggerLabel}
        >
          {compact ? (
            <>
              <ListIcon className="size-3.5 shrink-0" />
              {subview === "session-citations" && pendingCount > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-[0.875rem] rounded-full bg-primary px-0.5 text-center text-[9px] font-medium leading-[0.875rem] text-primary-foreground tabular-nums">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="truncate">{triggerLabel}</span>
              <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
            </>
          )}
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="start" className="min-w-[12rem]">
        <AppMenuCheckItem
          selected={subview === "library"}
          onClick={() => setSubview("library")}
          trailing={
            entryCount > 0 ? (
              <span className="tabular-nums text-muted-foreground/70">{entryCount}</span>
            ) : undefined
          }
        >
          All entries
        </AppMenuCheckItem>
        <AppMenuCheckItem
          selected={subview === "session-citations"}
          onClick={() => setSubview("session-citations")}
          trailing={
            pendingCount > 0 ? (
              <span className="tabular-nums text-primary/80">{pendingCount}</span>
            ) : citationCount > 0 ? (
              <span className="tabular-nums text-muted-foreground/70">{citationCount}</span>
            ) : undefined
          }
        >
          Session citations
        </AppMenuCheckItem>
      </AppMenuContent>
    </AppMenu>
  );
}
