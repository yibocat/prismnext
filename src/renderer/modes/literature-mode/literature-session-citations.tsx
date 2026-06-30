import { useState, useEffect, useRef } from "react";
import { BookOpenIcon } from "lucide-react";
import { useCitationStagingStore, EMPTY_STAGED_CITATIONS } from "@/stores/citation-staging-store";
import { useChatStore } from "@/stores/chat-store";
import { StagedCitationEntryPanel } from "./literature-staged-entry-panel";
import {
  literatureListHeaderClass,
  literatureListHeaderLabelClass,
  literatureListBodyClass,
  literatureListRowClass,
  literatureRowShellClass,
  literatureRowTextClass,
  literaturePanelExpandedDetailClass,
  LITERATURE_COL_YEAR,
  LITERATURE_COL_TITLE,
  LITERATURE_COL_AUTHORS,
  LITERATURE_COL_VENUE,
} from "./literature-list-chrome";
import { formatLiteratureAuthorsShort } from "./literature-format";
import { cn } from "@/lib/utils";
import type { StagedCitation } from "../../../shared/citation-staging";

function StatusChip({ c }: { c: StagedCitation }) {
  if (c.addedToLibrary) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-primary/80"
        title="Already in project library"
      >
        In library
      </span>
    );
  }
  if (c.catalogVerified) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-emerald-700 dark:text-emerald-400"
        title="Identifier verified against external catalog"
      >
        Pending
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-red-500/35 bg-red-500/10 px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-red-700 dark:text-red-400"
      title={c.verifyError ?? "Not verified"}
    >
      Unverified
    </span>
  );
}

function StagedRow({
  citation,
  expanded,
  onToggle,
}: {
  citation: StagedCitation;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={literatureListRowClass}>
      <div
        className={cn(literatureRowShellClass, expanded && "bg-muted/40")}
        data-ref-id={citation.refId}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="shrink-0 w-7 text-[length:var(--font-size-11)] text-muted-foreground/60 tabular-nums font-mono">
          #{citation.refId}
        </span>
        <span className={cn(LITERATURE_COL_TITLE, literatureRowTextClass, "truncate")}>
          {citation.title || "Untitled"}
        </span>
        <span className={cn(LITERATURE_COL_AUTHORS, literatureRowTextClass)}>
          {formatLiteratureAuthorsShort(citation.authors)}
        </span>
        <span className={cn(LITERATURE_COL_VENUE, literatureRowTextClass)}>
          {citation.venue || "—"}
        </span>
        <span className={cn(LITERATURE_COL_YEAR, literatureRowTextClass, "tabular-nums")}>
          {citation.year ?? "—"}
        </span>
        <span className="ml-auto shrink-0 flex items-center gap-1.5">
          <StatusChip c={citation} />
        </span>
      </div>
      {expanded ? (
        <div className={literaturePanelExpandedDetailClass}>
          <StagedCitationEntryPanel citation={citation} />
        </div>
      ) : null}
    </div>
  );
}

export interface LiteratureSessionCitationsHandle {
  scrollToRefId: (refId: number) => void;
}

interface Props {
  /** When set, the row with this refId is auto-expanded and scrolled into view. */
  highlightRefId?: number | null;
  /** Notify parent once the highlight has been consumed (so it doesn't re-trigger). */
  onHighlightConsumed?: () => void;
}

export function LiteratureSessionCitations({ highlightRefId, onHighlightConsumed }: Props) {
  const chatSessionId = useChatStore((s) => s.sessionId);
  const panelHidden = useCitationStagingStore(
    (s) => (chatSessionId ? Boolean(s.panelHiddenSessions[chatSessionId]) : false),
  );
  const citations = useCitationStagingStore((s) => {
    if (!chatSessionId) return EMPTY_STAGED_CITATIONS;
    if (s.panelHiddenSessions[chatSessionId]) return EMPTY_STAGED_CITATIONS;
    return s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS;
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const jumpCitations = useCitationStagingStore((s) =>
    chatSessionId ? s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS : EMPTY_STAGED_CITATIONS,
  );

  // Auto-expand + scroll to highlighted row (jump from chat [n]).
  useEffect(() => {
    if (highlightRefId == null) return;
    const target = jumpCitations.find((c) => c.refId === highlightRefId);
    if (!target) return;
    setExpandedId(target.id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current?.querySelector(`[data-ref-id="${highlightRefId}"]`);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    });
    onHighlightConsumed?.();
  }, [highlightRefId, jumpCitations, onHighlightConsumed]);

  if (!chatSessionId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
          Open a chat tab to see its citations.
        </p>
      </div>
    );
  }

  if (citations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center gap-2">
        <BookOpenIcon className="size-6 text-muted-foreground/40" />
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
          {panelHidden
            ? "Session citations cleared from this panel."
            : "AI-referenced papers in this chat will appear here."}
        </p>
        <p className="text-[length:var(--font-size-11)] text-muted-foreground/60">
          {panelHidden
            ? "Click [n] in the chat to open a citation here again."
            : "Click a citation like [1] in the chat to jump here."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background @container">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto overflow-anchor-none">
        <div className={literatureListHeaderClass}>
          <span className="shrink-0 w-7 text-[length:var(--font-size-11)] text-muted-foreground/60 font-mono">
            #
          </span>
          <span className={cn(LITERATURE_COL_TITLE, literatureListHeaderLabelClass)}>Title</span>
          <span className={cn(LITERATURE_COL_AUTHORS, literatureListHeaderLabelClass)}>Authors</span>
          <span className={cn(LITERATURE_COL_VENUE, literatureListHeaderLabelClass)}>Publication</span>
          <span className={cn(LITERATURE_COL_YEAR, literatureListHeaderLabelClass)}>Year</span>
          <span className="ml-auto shrink-0" />
        </div>
        <div className={literatureListBodyClass}>
          {citations.map((c) => (
            <StagedRow
              key={c.id}
              citation={c}
              expanded={expandedId === c.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === c.id ? null : c.id))
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
