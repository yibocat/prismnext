import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenIcon, ListOrderedIcon, Loader2Icon, SquareIcon } from "lucide-react";
import {
  useCitationStagingStore,
  EMPTY_STAGED_CITATIONS,
  EMPTY_CHECKED_STAGED_IDS,
  isCitationInLibrary,
  isStagedCitationAddable,
} from "@/stores/citation-staging-store";
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
  LITERATURE_COL_CHECK,
} from "./literature-list-chrome";
import { formatLiteratureAuthorsShort } from "./literature-format";
import { cn } from "@/lib/utils";
import type { StagedCitation } from "../../../shared/literature/citation-staging";

function StatusChip({
  c,
  inLibrary,
  queued,
}: {
  c: StagedCitation;
  inLibrary: boolean;
  queued: boolean;
}) {
  const { t } = useTranslation();
  if (queued && !inLibrary) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-muted-foreground"
        title={t("modes.literature.queuedAddCitation")}
      >
        {t("modes.literature.statusQueued")}
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

function RefColumn({
  citation,
  inFlight,
  queued,
  cancelling,
  onCancelAdd,
}: {
  citation: StagedCitation;
  inFlight: boolean;
  queued: boolean;
  cancelling: boolean;
  onCancelAdd: () => void;
}) {
  const { t } = useTranslation();

  if (inFlight) {
    const label = cancelling
      ? t("modes.literature.cancellingAddCitation")
      : t("modes.literature.cancelAddCitation");
    return (
      <button
        type="button"
        disabled={cancelling}
        title={label}
        aria-label={label}
        className={cn(
          "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5",
          "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300",
          "hover:bg-amber-500/15 disabled:pointer-events-none disabled:opacity-80",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onCancelAdd();
        }}
      >
        <Loader2Icon className="size-3 shrink-0 animate-spin" />
        {!cancelling ? <SquareIcon className="size-2.5 shrink-0 fill-current" /> : null}
      </button>
    );
  }

  if (queued) {
    const label = t("modes.literature.cancelQueuedAddCitation");
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        className={cn(
          "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5",
          "border-border bg-muted text-muted-foreground",
          "hover:bg-accent hover:text-foreground",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onCancelAdd();
        }}
      >
        <ListOrderedIcon className="size-3 shrink-0" />
        <SquareIcon className="size-2.5 shrink-0 fill-current" />
      </button>
    );
  }

  return (
    <span className="shrink-0 w-7 text-[length:var(--font-size-11)] text-muted-foreground/60 tabular-nums font-mono">
      #{citation.refId}
    </span>
  );
}

function StagedRow({
  citation,
  inLibrary,
  expanded,
  onToggle,
  checked,
  addable,
  inFlight,
  queued,
  cancelling,
  onToggleCheck,
  onCancelAdd,
}: {
  citation: StagedCitation;
  inLibrary: boolean;
  expanded: boolean;
  onToggle: () => void;
  checked: boolean;
  addable: boolean;
  inFlight: boolean;
  queued: boolean;
  cancelling: boolean;
  onToggleCheck: () => void;
  onCancelAdd: () => void;
}) {
  const { t } = useTranslation();

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
        <RefColumn
          citation={citation}
          inFlight={inFlight}
          queued={queued}
          cancelling={cancelling}
          onCancelAdd={onCancelAdd}
        />
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
        <span className="shrink-0 flex items-center gap-1.5">
          <StatusChip c={citation} inLibrary={inLibrary} queued={queued} />
        </span>
        <span className={LITERATURE_COL_CHECK}>
          <input
            type="checkbox"
            checked={checked}
            disabled={!addable || inFlight || queued}
            onChange={onToggleCheck}
            onClick={(e) => e.stopPropagation()}
            className="size-3 cursor-pointer accent-primary rounded-sm disabled:cursor-not-allowed disabled:opacity-40"
            title={
              addable
                ? t("modes.literature.selectEntry")
                : t("modes.literature.citationNotAddable")
            }
          />
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
  const checkedStagedIds = useCitationStagingStore((s) =>
    chatSessionId
      ? s.checkedStagedIdsBySession[chatSessionId] ?? EMPTY_CHECKED_STAGED_IDS
      : EMPTY_CHECKED_STAGED_IDS,
  );
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const toggleStagedChecked = useCitationStagingStore((s) => s.toggleStagedChecked);
  const setStagedCheckedIds = useCitationStagingStore((s) => s.setStagedCheckedIds);
  const cancelAddToLibrary = useCitationStagingStore((s) => s.cancelAddToLibrary);
  const inFlightAddIds = useCitationStagingStore((s) => s.inFlightAddIds);
  const cancelledAddIds = useCitationStagingStore((s) => s.cancelledAddIds);
  const batchQueuedIds = useCitationStagingStore((s) => s.batchQueuedIds);
  const papers = useLiteratureStore((s) => s.papers);
  const libraryPaperIdSet = useMemo(() => new Set(papers.map((p) => p.id)), [papers]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const jumpCitations = useCitationStagingStore((s) =>
    chatSessionId ? s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS : EMPTY_STAGED_CITATIONS,
  );

  const addableIds = useMemo(
    () =>
      citations
        .filter((c) => isStagedCitationAddable(c, isCitationInLibrary(c, libraryPaperIdSet)))
        .map((c) => c.id),
    [citations, libraryPaperIdSet],
  );
  const checkedAddableCount = addableIds.filter((id) => checkedStagedIds.includes(id)).length;
  const allAddableChecked =
    addableIds.length > 0 && checkedAddableCount === addableIds.length;
  const headerIndeterminate = checkedAddableCount > 0 && !allAddableChecked;

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = headerIndeterminate;
  }, [headerIndeterminate]);

  const handleToggleAll = () => {
    if (!chatSessionId) return;
    if (allAddableChecked) {
      setStagedCheckedIds(
        chatSessionId,
        checkedStagedIds.filter((id) => !addableIds.includes(id)),
      );
    } else {
      setStagedCheckedIds(chatSessionId, [...new Set([...checkedStagedIds, ...addableIds])]);
    }
  };

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
          <span className="shrink-0" />
          <span className={LITERATURE_COL_CHECK}>
            <input
              ref={headerCheckboxRef}
              type="checkbox"
              checked={allAddableChecked}
              disabled={addableIds.length === 0}
              onChange={handleToggleAll}
              className="size-3 cursor-pointer accent-primary rounded-sm disabled:cursor-not-allowed disabled:opacity-40"
              title={t("modes.literature.selectAllAddableCitations")}
            />
          </span>
        </div>
        <div className={literatureListBodyClass}>
          {citations.map((c) => {
            const inLibrary = isCitationInLibrary(c, libraryPaperIdSet);
            const addable = isStagedCitationAddable(c, inLibrary);
            return (
              <StagedRow
                key={c.id}
                citation={c}
                inLibrary={inLibrary}
                expanded={expandedId === c.id}
                inFlight={Boolean(inFlightAddIds[c.id])}
                queued={Boolean(batchQueuedIds[c.id])}
                cancelling={Boolean(cancelledAddIds[c.id])}
                checked={checkedStagedIds.includes(c.id)}
                addable={addable}
                onToggleCheck={() => toggleStagedChecked(chatSessionId, c.id)}
                onCancelAdd={() => cancelAddToLibrary(c.id)}
                onToggle={() =>
                  setExpandedId((prev) => (prev === c.id ? null : c.id))
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
