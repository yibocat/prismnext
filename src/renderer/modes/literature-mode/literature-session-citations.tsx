import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenIcon, Loader2Icon } from "lucide-react";
import { useCitationStagingStore, EMPTY_STAGED_CITATIONS, isCitationInLibrary } from "@/stores/citation-staging-store";
import { useChatStore } from "@/stores/chat-store";
import { useLiteratureStore } from "@/stores/literature-store";
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
import type { StagedCitation, StagedAddProgressEvent } from "../../../shared/citation-staging";
import { stagedAddProgressLabel } from "@/lib/literature/staged-add-progress-label";

function StatusChip({
  c,
  inLibrary,
  progress,
}: {
  c: StagedCitation;
  inLibrary: boolean;
  progress?: StagedAddProgressEvent;
}) {
  const { t } = useTranslation();
  if (progress && progress.phase !== "done") {
    return (
      <span
        className="inline-flex max-w-[min(12rem,40vw)] shrink-0 items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-amber-800 dark:text-amber-300"
        title={stagedAddProgressLabel(progress)}
      >
        <Loader2Icon className="size-3 shrink-0 animate-spin" />
        <span className="truncate">{stagedAddProgressLabel(progress)}</span>
      </span>
    );
  }
  if (inLibrary) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-primary/80"
        title={t("modes.literature.alreadyInLibrary")}
      >
        In library
      </span>
    );
  }
  if (c.catalogVerified) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-emerald-700 dark:text-emerald-400"
        title={t("modes.literature.identifierVerified")}
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
  inLibrary,
  expanded,
  onToggle,
  progress,
}: {
  citation: StagedCitation;
  inLibrary: boolean;
  expanded: boolean;
  onToggle: () => void;
  progress?: StagedAddProgressEvent;
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
          <StatusChip c={citation} inLibrary={inLibrary} progress={progress} />
        </span>
      </div>
      {expanded ? (
        <div className={literaturePanelExpandedDetailClass}>
          <StagedCitationEntryPanel citation={citation} inLibrary={inLibrary} />
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
  const { t } = useTranslation();
  const chatSessionId = useChatStore((s) => s.sessionId);
  const panelHidden = useCitationStagingStore(
    (s) => (chatSessionId ? Boolean(s.panelHiddenSessions[chatSessionId]) : false),
  );
  const citations = useCitationStagingStore((s) => {
    if (!chatSessionId) return EMPTY_STAGED_CITATIONS;
    if (s.panelHiddenSessions[chatSessionId]) return EMPTY_STAGED_CITATIONS;
    return s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS;
  });
  const addProgressById = useCitationStagingStore((s) => s.addProgressById);
  const papers = useLiteratureStore((s) => s.papers);
  const libraryPaperIdSet = useMemo(() => new Set(papers.map((p) => p.id)), [papers]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const jumpCitations = useCitationStagingStore((s) =>
    chatSessionId ? s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS : EMPTY_STAGED_CITATIONS,
  );

  // Auto-expand + scroll to highlighted row (jump from chat [n]).
  const consumedHighlightRef = useRef<number | null>(null);
  useEffect(() => {
    if (highlightRefId == null) {
      consumedHighlightRef.current = null;
      return;
    }
    if (consumedHighlightRef.current === highlightRefId) return;
    const target = jumpCitations.find((c) => c.refId === highlightRefId);
    if (!target) return;
    consumedHighlightRef.current = highlightRefId;
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
          {t("literature.citations.openChat")}
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
            ? t("literature.citations.cleared")
            : t("literature.citations.empty")}
        </p>
        <p className="text-[length:var(--font-size-11)] text-muted-foreground/60">
          {panelHidden
            ? t("literature.citations.clearedHint")
            : t("literature.citations.emptyHint")}
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
          <span className={cn(LITERATURE_COL_TITLE, literatureListHeaderLabelClass)}>
            {t("modes.literature.colTitle")}
          </span>
          <span className={cn(LITERATURE_COL_AUTHORS, literatureListHeaderLabelClass)}>
            {t("literature.detail.authors")}
          </span>
          <span className={cn(LITERATURE_COL_VENUE, literatureListHeaderLabelClass)}>
            {t("literature.detail.publication")}
          </span>
          <span className={cn(LITERATURE_COL_YEAR, literatureListHeaderLabelClass)}>
            {t("literature.detail.year")}
          </span>
          <span className="ml-auto shrink-0" />
        </div>
        <div className={literatureListBodyClass}>
          {citations.map((c) => (
            <StagedRow
              key={c.id}
              citation={c}
              inLibrary={isCitationInLibrary(c, libraryPaperIdSet)}
              expanded={expandedId === c.id}
              progress={addProgressById[c.id]}
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
