import { useMemo, useState, useRef, useCallback, useEffect, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  FileTextIcon,
  HardDriveIcon,
  PlusIcon,
} from "lucide-react";
import { useLiteratureStore } from "@/stores/literature-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  formatLiteratureAuthorsShort,
  formatLiteratureListDate,
  paperHasReadablePdf,
  sortLiteraturePapers,
  type LiteratureSortColumn,
  type LiteratureSortDirection,
} from "./literature-format";
import { LiteratureEntryPanel } from "./literature-entry-panel";
import { LiteratureExtractBadge } from "./literature-extract-badge";
import { useLiteratureExtractStore } from "@/stores/literature-extract-store";
import { PAPER_EXTRACT_ACTION_LABEL } from "../../../shared/paper-extract";
import {
  literatureListHeaderLabelClass,
  literatureListBodyClass,
  literatureListHeaderClass,
  literatureListRowClass,
  literaturePanelExpandedDetailClass,
  literatureRowPdfDropPendingClass,
  literatureRowPdfDropReadyClass,
  literatureRowShellClass,
  literatureRowTextClass,
  LITERATURE_COL_CHECK,
  LITERATURE_COL_EXTRACT,
  LITERATURE_COL_AUTHORS,
  LITERATURE_COL_TITLE,
  LITERATURE_COL_VENUE,
  LITERATURE_COL_VENUE_LABELS,
  LITERATURE_COL_CREATED,
  LITERATURE_COL_UPDATED,
  LITERATURE_COL_YEAR,
  literatureRowZoteroBadgeClass,
} from "./literature-list-chrome";
import { cn } from "@/lib/utils";
import { useLiteratureListMarquee } from "@/lib/literature/literature-list-marquee";
import { paperMatchesTagFilter } from "@/lib/literature/paper-tag-utils";
import {
  useLiteraturePdfAttach,
  useLiteratureRowPdfDropSession,
  useLiteratureRowPdfDropTarget,
  type LiteratureRowPdfDropSession,
} from "@/lib/literature/use-literature-pdf-attach";
import { LiteraturePdfAttachConflictDialog } from "./literature-entry-pdf-attach";
import type { LiteraturePaper } from "@/types/electron.d";

/** Scroll expanded row flush under the sticky list header. */
function scrollLiteratureRowBelowHeader(
  scrollEl: HTMLDivElement | null,
  rowEl: HTMLElement | null,
  headerEl: HTMLElement | null,
): void {
  if (!scrollEl || !rowEl) return;
  const headerH = headerEl?.offsetHeight ?? 0;
  const rowTopInViewport = rowEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top;
  const delta = rowTopInViewport - headerH;
  if (Math.abs(delta) < 0.5) return;
  scrollEl.scrollTop += delta;
}

function SortHeaderButton({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  direction: LiteratureSortDirection;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        literatureListHeaderLabelClass,
        "w-full text-left truncate transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
        className,
      )}
    >
      {label}
      {active ? (direction === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

function LibraryTableHeader({
  headerRef,
  sortColumn,
  sortDirection,
  onSort,
  allChecked,
  indeterminate,
  onToggleAll,
}: {
  headerRef: RefObject<HTMLDivElement | null>;
  sortColumn: LiteratureSortColumn;
  sortDirection: LiteratureSortDirection;
  onSort: (column: LiteratureSortColumn) => void;
  allChecked: boolean;
  indeterminate: boolean;
  onToggleAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div ref={headerRef} className={literatureListHeaderClass} data-literature-list-header>
      <span className={LITERATURE_COL_EXTRACT} aria-hidden />
      <SortHeaderButton
        label={t("modes.literature.colYear")}
        active={sortColumn === "year"}
        direction={sortDirection}
        onClick={() => onSort("year")}
        className={LITERATURE_COL_YEAR}
      />
      <SortHeaderButton
        label={t("modes.literature.colTitle")}
        active={sortColumn === "title"}
        direction={sortDirection}
        onClick={() => onSort("title")}
        className={LITERATURE_COL_TITLE}
      />
      <span
        className={cn(LITERATURE_COL_AUTHORS, literatureListHeaderLabelClass, "text-muted-foreground")}
      >
        {t("modes.literature.colAuthors")}
      </span>
      <span
        className={cn(LITERATURE_COL_VENUE, literatureListHeaderLabelClass, "text-muted-foreground")}
      >
        {t("modes.literature.colPublication")}
      </span>
      <span
        className={cn(
          LITERATURE_COL_VENUE_LABELS,
          literatureListHeaderLabelClass,
          "text-muted-foreground",
        )}
        title="Journal labels (coming soon)"
      >
        Labels
      </span>
      <SortHeaderButton
        label={t("modes.literature.colAdded")}
        active={sortColumn === "created_at"}
        direction={sortDirection}
        onClick={() => onSort("created_at")}
        className={LITERATURE_COL_CREATED}
      />
      <SortHeaderButton
        label={t("modes.literature.colUpdated")}
        active={sortColumn === "updated_at"}
        direction={sortDirection}
        onClick={() => onSort("updated_at")}
        className={LITERATURE_COL_UPDATED}
      />
      <span className={LITERATURE_COL_CHECK}>
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = indeterminate;
          }}
          onChange={onToggleAll}
          className="size-3 cursor-pointer accent-primary rounded-sm"
          title="Select all"
        />
      </span>
    </div>
  );
}

function LibraryTableRow({
  paper,
  expanded,
  checked,
  pdfDragActive,
  scrollContainerRef,
  listHeaderRef,
  rowPdfDropSession,
  onToggleExpand,
  onToggleCheck,
  suppressRowClickRef,
}: {
  paper: LiteraturePaper;
  expanded: boolean;
  checked: boolean;
  pdfDragActive: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  listHeaderRef: RefObject<HTMLDivElement | null>;
  rowPdfDropSession: LiteratureRowPdfDropSession;
  onToggleExpand: () => void;
  onToggleCheck: () => void;
  suppressRowClickRef: RefObject<boolean>;
}) {
  const openLiteraturePaper = useRightPanelStore((s) => s.openLiteraturePaper);
  const pdfCacheState = useLiteratureStore((s) => s.pdfCacheStatus[paper.id]);
  const extractStates = useLiteratureExtractStore((s) => s.statesByPaper);
  const pdfCached = pdfCacheState?.cached ?? false;
  const pdfStale = pdfCacheState?.stale ?? false;
  const rowShellRef = useRef<HTMLDivElement>(null);
  const isZotero = Boolean(paper.zotero_key) && paper.origin === "zotero";
  const pdfAttach = useLiteraturePdfAttach(paper.id);
  const rowPdfDrop = useLiteratureRowPdfDropTarget(paper, rowPdfDropSession, pdfAttach.attachPdfPath);

  useEffect(() => {
    if (!expanded) return;
    const scrollEl = scrollContainerRef.current;
    const rowEl = rowShellRef.current;
    const headerEl = listHeaderRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollLiteratureRowBelowHeader(scrollEl, rowEl, headerEl);
      });
    });
  }, [expanded, scrollContainerRef, listHeaderRef]);

  const handleRowClick = useCallback(() => {
    onToggleExpand();
  }, [onToggleExpand]);

  const handleShellClick = useCallback(
    (e: React.MouseEvent) => {
      if (suppressRowClickRef.current) return;
      const target = e.target as HTMLElement;
      if (target.closest('input[type="checkbox"]')) return;
      if (target.closest("[data-literature-pdf-open]")) return;
      handleRowClick();
    },
    [handleRowClick, suppressRowClickRef],
  );

  const handleOpenPdf = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!paperHasReadablePdf(paper)) return;
      openLiteraturePaper(paper.id, paper.title, "reader");
    },
    [openLiteraturePaper, paper],
  );

  const hasPdf = paperHasReadablePdf(paper);
  const authorsShort = formatLiteratureAuthorsShort(paper.authors);
  const rowDropHint =
    pdfDragActive && rowPdfDrop.phase === "ready"
      ? paper.pdf_path
        ? "Drop to replace PDF"
        : "Drop to attach PDF"
      : pdfDragActive && rowPdfDrop.phase === "pending"
        ? "Keep hovering to attach…"
        : undefined;

  return (
    <div
      className={cn(
        literatureListRowClass,
        "relative",
        pdfDragActive && rowPdfDrop.phase === "pending" && literatureRowPdfDropPendingClass,
        pdfDragActive && rowPdfDrop.phase === "ready" && literatureRowPdfDropReadyClass,
      )}
      {...rowPdfDrop.rowDropHandlers}
      title={rowDropHint}
    >
      {rowDropHint ? (
        <span className="pointer-events-none absolute right-2 top-1 z-10 max-w-[min(100%-1rem,14rem)] truncate rounded border border-primary/30 bg-background px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-primary shadow-sm">
          {rowDropHint}
        </span>
      ) : null}
      <div
        ref={rowShellRef}
        data-literature-row-shell
        data-literature-row-id={paper.id}
        className={cn(literatureRowShellClass, literatureRowTextClass)}
        onClick={handleShellClick}
      >
        <span className={LITERATURE_COL_EXTRACT}>
          <LiteratureExtractBadge
            paperId={paper.id}
            statesByPaper={extractStates}
            visible
          />
        </span>
        <span className={cn(LITERATURE_COL_YEAR, "min-w-0")}>
          {paper.year ?? ""}
        </span>
        <div
          className={cn(
            LITERATURE_COL_TITLE,
            "flex items-center gap-1.5 overflow-hidden min-w-0",
            hasPdf && "pointer-events-none",
          )}
        >
          {hasPdf ? (
            pdfStale ? (
              <span title="PDF cache outdated — refresh from Zotero">
                <HardDriveIcon
                  className="size-3 shrink-0 text-amber-600/85 dark:text-amber-500/85"
                  aria-label="PDF cache outdated"
                />
              </span>
            ) : pdfCached ? (
              <span title="PDF cached locally">
                <HardDriveIcon
                  className="size-3 shrink-0 text-emerald-600/80 dark:text-emerald-500/80"
                  aria-label="PDF cached locally"
                />
              </span>
            ) : (
              <span title="PDF not cached — will download when opened">
                <FileTextIcon
                  className="size-3 shrink-0 text-muted-foreground/45"
                  aria-label="PDF not cached locally"
                />
              </span>
            )
          ) : null}
          {hasPdf ? (
            <button
              type="button"
              data-literature-pdf-open
              className={cn(
                "pointer-events-auto w-fit max-w-full shrink min-w-0 truncate text-left font-medium text-foreground hover:underline",
                literatureRowTextClass,
              )}
              onClick={handleOpenPdf}
              title={`Open PDF — ${paper.title}`}
            >
              {paper.title}
            </button>
          ) : (
            <span
              className={cn(
                "w-fit max-w-full shrink min-w-0 truncate font-medium text-foreground",
                literatureRowTextClass,
              )}
              title={paper.title}
            >
              {paper.title}
            </span>
          )}
          {isZotero ? (
            <span
              className={literatureRowZoteroBadgeClass}
              title={`Synced from Zotero — PDF or ${PAPER_EXTRACT_ACTION_LABEL} keeps this entry in the project`}
            >
              Zotero
            </span>
          ) : null}
        </div>
        <span
          className={cn(LITERATURE_COL_AUTHORS, "min-w-0")}
          title={authorsShort}
        >
          {authorsShort}
        </span>
        <span
          className={cn(LITERATURE_COL_VENUE, "min-w-0")}
          title={paper.venue ?? ""}
        >
          {paper.venue ?? ""}
        </span>
        <span
          className={cn(LITERATURE_COL_VENUE_LABELS, "min-w-0")}
          title="Journal labels (coming soon)"
        >
          —
        </span>
        <span
          className={cn(LITERATURE_COL_CREATED, "min-w-0")}
          title={formatLiteratureListDate(paper.created_at)}
        >
          {formatLiteratureListDate(paper.created_at)}
        </span>
        <span
          className={cn(LITERATURE_COL_UPDATED, "min-w-0")}
          title={formatLiteratureListDate(paper.updated_at)}
        >
          {formatLiteratureListDate(paper.updated_at)}
        </span>
        <span className={LITERATURE_COL_CHECK}>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleCheck}
            onClick={(e) => e.stopPropagation()}
            className="size-3 cursor-pointer accent-primary rounded-sm"
            title="Select entry"
          />
        </span>
      </div>
      {expanded ? (
        <div className={literaturePanelExpandedDetailClass}>
          <LiteratureEntryPanel paper={paper} expandedInLibrary pdfAttach={pdfAttach} />
        </div>
      ) : null}
      <LiteraturePdfAttachConflictDialog attach={pdfAttach} />
    </div>
  );
}

export function LiteratureLibrary({ pdfDragActive = false }: { pdfDragActive?: boolean }) {
  const { t } = useTranslation();
  const papers = useLiteratureStore((s) => s.papers);
  const searchQuery = useLiteratureStore((s) => s.searchQuery);
  const searchResults = useLiteratureStore((s) => s.searchResults);
  const libraryView = useLiteratureStore((s) => s.libraryView);
  const viewPaperIds = useLiteratureStore((s) => s.viewPaperIds);
  const collections = useLiteratureStore((s) => s.collections);
  const loading = useLiteratureStore((s) => s.loading);
  const error = useLiteratureStore((s) => s.error);
  const selectedPaperId = useLiteratureStore((s) => s.selectedPaperId);
  const checkedPaperIds = useLiteratureStore((s) => s.checkedPaperIds);
  const selectPaper = useLiteratureStore((s) => s.selectPaper);
  const togglePaperChecked = useLiteratureStore((s) => s.togglePaperChecked);
  const setCheckedPaperIds = useLiteratureStore((s) => s.setCheckedPaperIds);
  const sortColumn = useLiteratureStore((s) => s.librarySortColumn);
  const sortDirection = useLiteratureStore((s) => s.librarySortDirection);
  const libraryTagFilter = useLiteratureStore((s) => s.libraryTagFilter);
  const setLibrarySort = useLiteratureStore((s) => s.setLibrarySort);

  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const listBodyRef = useRef<HTMLDivElement>(null);
  const rowPdfDropSession = useLiteratureRowPdfDropSession();
  const resetRowPdfDrop = rowPdfDropSession.reset;
  const rowAttachActive = rowPdfDropSession.targetPaperId != null;

  useEffect(() => {
    if (!pdfDragActive) resetRowPdfDrop();
  }, [pdfDragActive, resetRowPdfDrop]);

  const { marqueeRect, suppressRowClickRef } = useLiteratureListMarquee({
    scrollRef,
    listBodyRef,
    checkedPaperIds,
    setCheckedPaperIds,
  });

  const filteredPapers = useMemo(() => {
    const q = searchQuery.trim();
    let base =
      q.length >= 2 && searchResults ? searchResults : papers;
    if (viewPaperIds) {
      const allowed = new Set(viewPaperIds);
      base = base.filter((p) => allowed.has(p.id));
    }
    if (libraryTagFilter) {
      base = base.filter((p) => paperMatchesTagFilter(p, libraryTagFilter));
    }
    return base;
  }, [papers, searchQuery, searchResults, viewPaperIds, libraryTagFilter]);

  const viewLabel = useMemo(() => {
    if (libraryView.kind !== "collection") return null;
    const col = collections.find((c) => c.id === libraryView.collectionId);
    return col?.name ?? "Collection";
  }, [libraryView, collections]);

  const visiblePapers = useMemo(
    () => sortLiteraturePapers(filteredPapers, sortColumn, sortDirection),
    [filteredPapers, sortColumn, sortDirection],
  );

  const visibleIds = useMemo(() => visiblePapers.map((p) => p.id), [visiblePapers]);
  const checkedVisibleCount = visibleIds.filter((id) => checkedPaperIds.includes(id)).length;
  const allVisibleChecked = visibleIds.length > 0 && checkedVisibleCount === visibleIds.length;
  const indeterminate = checkedVisibleCount > 0 && !allVisibleChecked;

  const handleSort = (column: LiteratureSortColumn) => {
    if (sortColumn === column) {
      setLibrarySort(column, sortDirection === "asc" ? "desc" : "asc");
    } else {
      setLibrarySort(column, column === "title" ? "asc" : "desc");
    }
  };

  const handleToggleAll = () => {
    if (allVisibleChecked) {
      setCheckedPaperIds(checkedPaperIds.filter((id) => !visibleIds.includes(id)));
    } else {
      const merged = new Set([...checkedPaperIds, ...visibleIds]);
      setCheckedPaperIds([...merged]);
    }
  };

  const handleToggleExpand = (paperId: string) => {
    if (selectedPaperId === paperId) selectPaper(null);
    else selectPaper(paperId);
  };

  if (loading && papers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 px-6 text-center">
        <p className="text-[length:var(--font-placeholder)] text-destructive">{error}</p>
      </div>
    );
  }

  if (papers.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[length:var(--font-size-14)] text-foreground/80">
          {t("modes.literature.emptyTitle")}
        </p>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground/70 max-w-sm">
          {t("modes.literature.emptyHint")}
        </p>
        <p className="text-[length:var(--font-size-11)] text-muted-foreground/45 max-w-sm">
          Zotero is optional — connect it later from the same menu if you want to sync a collection.
        </p>
      </div>
    );
  }

  if (visiblePapers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
          {libraryTagFilter
            ? `No entries tagged “${libraryTagFilter}”`
            : searchQuery.trim().length >= 2
              ? `No matches for “${searchQuery.trim()}”`
              : viewLabel
                ? `No entries in “${viewLabel}”`
                : t("modes.literature.noEntries")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background @container">
      {marqueeRect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 border border-primary/50 bg-primary/10"
          style={{
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      ) : null}
      <div
        ref={scrollRef}
        className="relative flex-1 min-h-0 overflow-auto overflow-anchor-none"
      >
        {pdfDragActive && !rowAttachActive ? (
          <span className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-md border border-primary/25 bg-background/95 px-3 py-1 text-[length:var(--font-size-11)] text-muted-foreground shadow-sm">
            Drop PDFs to import · Hold on a row to attach
          </span>
        ) : null}
        <div className="flex min-h-full flex-col">
          <LibraryTableHeader
            headerRef={headerRef}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            allChecked={allVisibleChecked}
            indeterminate={indeterminate}
            onToggleAll={handleToggleAll}
          />
          <div
            ref={listBodyRef}
            className={cn(literatureListBodyClass, "flex-1")}
            data-literature-list-body
          >
            {visiblePapers.map((paper) => (
              <LibraryTableRow
                key={paper.id}
                paper={paper}
                expanded={selectedPaperId === paper.id}
                checked={checkedPaperIds.includes(paper.id)}
                pdfDragActive={pdfDragActive}
                rowPdfDropSession={rowPdfDropSession}
                onToggleExpand={() => handleToggleExpand(paper.id)}
                onToggleCheck={() => togglePaperChecked(paper.id)}
                scrollContainerRef={scrollRef}
                listHeaderRef={headerRef}
                suppressRowClickRef={suppressRowClickRef}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
