import { ChevronDownIcon } from "lucide-react";
import { useLiteratureStore } from "@/stores/literature-store";
import { useChatStore } from "@/stores/chat-store";
import { useCitationStagingStore, EMPTY_STAGED_CITATIONS } from "@/stores/citation-staging-store";
import { cn } from "@/lib/utils";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuTrigger,
} from "@/components/ui/app-menu";

export type LiteratureLibrarySubview = "library" | "session-citations";

const toolbarBtn = cn(
  "flex items-center gap-1 h-6 px-1.5 rounded text-[length:var(--font-menu-item)]",
  "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
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

export function LiteratureLibrarySubviewDropdown() {
  const subview = useLiteratureStore((s) => s.librarySubview);
  const setSubview = useLiteratureStore((s) => s.setLibrarySubview);
  const entryCount = useLiteratureStore((s) => s.papers.length);
  const chatSessionId = useChatStore((s) => s.sessionId);
  const citations = useCitationStagingStore((s) => {
    if (!chatSessionId) return EMPTY_STAGED_CITATIONS;
    if (s.panelHiddenSessions[chatSessionId]) return EMPTY_STAGED_CITATIONS;
    return s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS;
  });
  const citationCount = citations.length;
  const pendingCount = citations.filter((c) => !c.addedToLibrary).length;

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button type="button" className={cn(toolbarBtn, "max-w-[11rem] font-medium")}>
          <span className="truncate">
            {subviewTriggerLabel(subview, entryCount, citationCount)}
          </span>
          <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
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
