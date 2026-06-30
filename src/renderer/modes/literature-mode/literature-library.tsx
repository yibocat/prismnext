import { useMemo, useState, useRef, useCallback, useEffect, type RefObject } from "react";
import {
  FileTextIcon,
  HardDriveIcon,
  Trash2Icon,
  FileDownIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatLiteratureAuthorsShort,
  paperHasReadablePdf,
  sortLiteraturePapers,
  type LiteratureSortColumn,
  type LiteratureSortDirection,
} from "./literature-format";
import { LiteratureEntryPanel } from "./literature-entry-panel";
import {
  literatureListHeaderLabelClass,
  literatureListBodyClass,
  literatureListHeaderClass,
  literatureListRowClass,
  literaturePanelExpandedDetailClass,
  literaturePanelExpandedRowStickyClass,
  literatureRowShellClass,
  literatureRowTextClass,
  LITERATURE_COL_CHECK,
  LITERATURE_COL_AUTHORS,
  LITERATURE_COL_TITLE,
  LITERATURE_COL_VENUE,
  LITERATURE_COL_VENUE_LABELS,
  LITERATURE_COL_YEAR,
  literatureRowZoteroBadgeClass,
} from "./literature-list-chrome";
import { cn } from "@/lib/utils";
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

/** Keep expanded row pinned under the list header when detail height changes. */
function useExpandedDetailScrollAnchor(
  expanded: boolean,
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  listHeaderRef: RefObject<HTMLDivElement | null>,
  rowShellRef: RefObject<HTMLDivElement | null>,
  detailRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!expanded) return;
    const scrollEl = scrollContainerRef.current;
    const anchorEl = rowShellRef.current;
    const detailEl = detailRef.current;
    const headerEl = listHeaderRef.current;
    if (!scrollEl || !anchorEl || !detailEl) return;

    const headerH = headerEl?.offsetHeight ?? 0;

    const ro = new ResizeObserver(() => {
      const scrollTopBefore = scrollEl.scrollTop;
      requestAnimationFrame(() => {
        const rowTopInViewport =
          anchorEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top;
        const delta = rowTopInViewport - headerH;
        if (Math.abs(delta) > 0.5) {
          scrollEl.scrollTop = scrollTopBefore + delta;
        }
      });
    });

    ro.observe(detailEl);
    return () => ro.disconnect();
  }, [expanded, scrollContainerRef, listHeaderRef, rowShellRef, detailRef]);
}

/** Expanded detail panel fills the visible library scroll area (below list header + row). */
function useExpandedDetailFillHeight(
  expanded: boolean,
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  listHeaderRef: RefObject<HTMLDivElement | null>,
  rowShellRef: RefObject<HTMLDivElement | null>,
  detailRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const detailEl = detailRef.current;
    if (!expanded || !detailEl) {
      if (detailEl) detailEl.style.minHeight = "";
      return;
    }

    const scrollEl = scrollContainerRef.current;
    const rowEl = rowShellRef.current;
    const headerEl = listHeaderRef.current;
    if (!scrollEl || !rowEl) return;

    const apply = () => {
      const headerH = headerEl?.offsetHeight ?? 0;
      const rowH = rowEl.offsetHeight;
      const minH = scrollEl.clientHeight - headerH - rowH;
      detailEl.style.minHeight = `${Math.max(0, minH)}px`;
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(scrollEl);
    ro.observe(rowEl);
    if (headerEl) ro.observe(headerEl);

    return () => {
      ro.disconnect();
      detailEl.style.minHeight = "";
    };
  }, [expanded, scrollContainerRef, listHeaderRef, rowShellRef, detailRef]);
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
  return (
    <div ref={headerRef} className={literatureListHeaderClass}>
      <SortHeaderButton
        label="Year"
        active={sortColumn === "year"}
        direction={sortDirection}
        onClick={() => onSort("year")}
        className={LITERATURE_COL_YEAR}
      />
      <SortHeaderButton
        label="Title"
        active={sortColumn === "title"}
        direction={sortDirection}
        onClick={() => onSort("title")}
        className={LITERATURE_COL_TITLE}
      />
      <span
        className={cn(LITERATURE_COL_AUTHORS, literatureListHeaderLabelClass, "text-muted-foreground")}
      >
        Authors
      </span>
      <span
        className={cn(LITERATURE_COL_VENUE, literatureListHeaderLabelClass, "text-muted-foreground")}
      >
        Publication
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
  scrollContainerRef,
  listHeaderRef,
  onToggleExpand,
  onToggleCheck,
}: {
  paper: LiteraturePaper;
  expanded: boolean;
  checked: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  listHeaderRef: RefObject<HTMLDivElement | null>;
  onToggleExpand: () => void;
  onToggleCheck: () => void;
}) {
  const openLiteraturePaper = useRightPanelStore((s) => s.openLiteraturePaper);
  const pdfCacheState = useLiteratureStore((s) => s.pdfCacheStatus[paper.id]);
  const pdfCached = pdfCacheState?.cached ?? false;
  const pdfStale = pdfCacheState?.stale ?? false;
  const rowShellRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const isZotero = Boolean(paper.zotero_key);

  useExpandedDetailScrollAnchor(
    expanded,
    scrollContainerRef,
    listHeaderRef,
    rowShellRef,
    detailRef,
  );
  useExpandedDetailFillHeight(
    expanded,
    scrollContainerRef,
    listHeaderRef,
    rowShellRef,
    detailRef,
  );

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
      const target = e.target as HTMLElement;
      if (target.closest('input[type="checkbox"]')) return;
      if (target.closest("[data-literature-pdf-open]")) return;
      handleRowClick();
    },
    [handleRowClick],
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

  return (
    <div className={literatureListRowClass}>
      <div
        ref={rowShellRef}
        className={cn(
          literatureRowShellClass,
          literatureRowTextClass,
          expanded && literaturePanelExpandedRowStickyClass,
        )}
        onClick={handleShellClick}
      >
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
              title="From Zotero — import to local to keep after disconnect"
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
        <div ref={detailRef} className={literaturePanelExpandedDetailClass}>
          <LiteratureEntryPanel paper={paper} fillHeight />
        </div>
      ) : null}
    </div>
  );
}

export function LiteratureLibrary() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
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
  const clearCheckedPapers = useLiteratureStore((s) => s.clearCheckedPapers);
  const deletePapers = useLiteratureStore((s) => s.deletePapers);
  const exportPapersBibTeX = useLiteratureStore((s) => s.exportPapersBibTeX);

  const [sortColumn, setSortColumn] = useState<LiteratureSortColumn>("year");
  const [sortDirection, setSortDirection] = useState<LiteratureSortDirection>("desc");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const filteredPapers = useMemo(() => {
    const q = searchQuery.trim();
    let base =
      q.length >= 2 && searchResults ? searchResults : papers;
    if (viewPaperIds) {
      const allowed = new Set(viewPaperIds);
      base = base.filter((p) => allowed.has(p.id));
    }
    return base;
  }, [papers, searchQuery, searchResults, viewPaperIds]);

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
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "year" ? "desc" : "asc");
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

  const handleBatchDelete = async () => {
    if (!projectRoot || checkedPaperIds.length === 0) return;
    setDeleting(true);
    try {
      await deletePapers(projectRoot, checkedPaperIds);
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleBatchExport = async () => {
    if (!projectRoot || checkedPaperIds.length === 0) return;
    try {
      await exportPapersBibTeX(projectRoot, checkedPaperIds);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
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
          Start your library
        </p>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground/70 max-w-sm">
          Drag in a PDF, or use the toolbar <PlusIcon className="inline size-3 align-text-bottom" /> menu to add by DOI, arXiv ID, or import BibTeX.
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
          {searchQuery.trim().length >= 2
            ? `No matches for “${searchQuery.trim()}”`
            : viewLabel
              ? `No entries in “${viewLabel}”`
              : "No entries"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background @container">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto overflow-anchor-none"
      >
        <LibraryTableHeader
          headerRef={headerRef}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          allChecked={allVisibleChecked}
          indeterminate={indeterminate}
          onToggleAll={handleToggleAll}
        />
        <div className={literatureListBodyClass}>
          {visiblePapers.map((paper) => (
            <LibraryTableRow
              key={paper.id}
              paper={paper}
              expanded={selectedPaperId === paper.id}
              checked={checkedPaperIds.includes(paper.id)}
              onToggleExpand={() => handleToggleExpand(paper.id)}
              onToggleCheck={() => togglePaperChecked(paper.id)}
              scrollContainerRef={scrollRef}
              listHeaderRef={headerRef}
            />
          ))}
        </div>
      </div>

      {checkedPaperIds.length > 0 ? (
        <div
          className="shrink-0 flex items-center gap-2 border-t border-border bg-card px-3 py-1.5 text-[length:var(--font-menu-item)]"
        >
          <span className="text-muted-foreground tabular-nums">
            {checkedPaperIds.length} selected
          </span>
          <Button size="xs" variant="ghost" className="h-6 px-1.5 @md:px-2" onClick={() => void handleBatchExport()} title="Export .bib">
            <FileDownIcon className="size-3 @md:mr-1" />
            <span className="hidden @md:inline">Export .bib</span>
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="h-6 px-1.5 @md:px-2 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            title="Delete selected"
          >
            <Trash2Icon className="size-3 @md:mr-1" />
            <span className="hidden @md:inline">Delete</span>
          </Button>
          <span className="flex-1" />
          <Button size="xs" variant="ghost" className="h-6" onClick={clearCheckedPapers}>
            Clear
          </Button>
        </div>
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {checkedPaperIds.length} entries?</DialogTitle>
          </DialogHeader>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            Selected papers will be removed from the library. PDF attachments are deleted when unused.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleBatchDelete()}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
