import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PlusIcon, Loader2Icon, NotebookPenIcon, PlusCircleIcon, Trash2Icon, LoaderCircleIcon, XIcon, BookMarkedIcon, SquareIcon } from "lucide-react";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { literatureDesktop } from "@/lib/desktop-api/literature";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useChatStore } from "@/stores/chat-store";
import {
  useCitationStagingStore,
  EMPTY_STAGED_CITATIONS,
  EMPTY_CHECKED_STAGED_IDS,
  isCitationInLibrary,
  isStagedCitationAddable,
} from "@/stores/citation-staging-store";
import { useLiteratureExtractStore, useLiteratureExtractSession } from "@/stores/literature-extract-store";
import { Button } from "@/components/ui/button";
import type { RightTab } from "@/lib/workspace/mode-registry";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownToolbarControls } from "@/components/modules/editor/toolbars/markdown-toolbar";
import { LiteratureLibrarySubviewDropdown } from "./literature-library-subview-dropdown";
import {
  LiteratureBatchSelectionActions,
  useLiteratureBatchSelectionActions,
} from "./literature-batch-selection-actions";
import { LiteratureAddByIdentifierButton } from "./literature-add-by-identifier";
import { LiteratureTagFilterDropdown } from "./literature-tag-filter-dropdown";
import { ZoteroConnectDialog } from "./zotero-connect-dialog";
import { LiteratureReaderExtractToolbar } from "./literature-agent-text";
import { LiteratureCitationHealthDialog } from "./literature-citation-health-dialog";
import { stagedAddProgressLabel } from "@/lib/literature/staged-add-progress-label";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import type { LiteraturePaper } from "@/types/electron.d";

const toolbarBtn = cn(
  "flex items-center gap-1.5 h-6 px-2 rounded text-[length:var(--font-menu-item)]",
  "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
);

/** Match git-toolbar — icon-only below this toolbar width. */
const LITERATURE_TOOLBAR_COMPACT_WIDTH = 420;

function libraryBackgroundBusyLabel(
  importCount: number,
  extractCount: number,
  pdfDownloadCount: number,
): string | null {
  const parts: string[] = [];
  if (importCount > 0) parts.push(`${importCount} importing`);
  if (pdfDownloadCount > 0) {
    parts.push(`${pdfDownloadCount} downloading PDF${pdfDownloadCount === 1 ? "" : "s"}`);
  }
  if (extractCount > 0) parts.push(`${extractCount} extracting`);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

function libraryBackgroundBusyTitle(
  importCount: number,
  extractCount: number,
  extractQueuedCount: number,
  pdfDownloadCount: number,
): string {
  const parts: string[] = [];
  if (importCount > 0) {
    parts.push(
      importCount === 1
        ? "Importing PDF and resolving metadata"
        : `${importCount} PDF imports in progress`,
    );
  }
  if (pdfDownloadCount > 0) {
    parts.push(
      pdfDownloadCount === 1
        ? "Downloading open-access PDF"
        : `${pdfDownloadCount} PDF downloads in progress`,
    );
  }
  if (extractCount > 0) {
    const queueHint = extractQueuedCount > 0 ? ` (${extractQueuedCount} queued)` : "";
    parts.push(`Extracting agent text${queueHint}`);
  }
  return parts.join(" · ");
}

function LiteratureReaderToolbar({ paper, tab }: { paper: LiteraturePaper; tab: RightTab }) {
  const { t } = useTranslation();
  const notesOpen = useLiteratureReaderStore(
    (s) => s.notesPaneOpenByPaper[paper.id] ?? false,
  );
  const toggleNotesPane = useLiteratureReaderStore((s) => s.toggleNotesPane);
  const setTabViewMode = useRightPanelStore((s) => s.setTabViewMode);
  const viewMode = (tab.viewMode ?? "source") as "source" | "preview";

  return (
    <div className="flex flex-1 items-center gap-2 min-w-0 overflow-hidden">
      <span
        className="truncate text-[length:var(--font-menu-item)] text-foreground min-w-0 flex-1"
        title={paper.title}
      >
        {paper.title}
      </span>
      {notesOpen ? (
        <MarkdownToolbarControls
          viewMode={viewMode}
          onViewModeChange={(mode) => setTabViewMode(tab.id, mode)}
        />
      ) : null}
      <LiteratureReaderExtractToolbar paper={paper} />
      <Hint label={notesOpen ? t("modes.literature.closeNotes") : t("modes.literature.openNotes")}>
        <button
          type="button"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded transition-colors",
            notesOpen
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          onClick={() => {
            const opening = !notesOpen;
            toggleNotesPane(paper.id);
            if (opening && !tab.viewMode) {
              setTabViewMode(tab.id, "source");
            }
          }}
        >
          <NotebookPenIcon className="size-3.5" />
        </button>
      </Hint>
    </div>
  );
}

function LiteratureLibraryToolbar() {
  const { t } = useTranslation();
  const batchActions = useLiteratureBatchSelectionActions();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const subview = useLiteratureStore((s) => s.librarySubview);
  const createPaper = useLiteratureStore((s) => s.createPaper);
  const importBibTeX = useLiteratureStore((s) => s.importBibTeX);
  const boundCollectionId = useLiteratureStore((s) => s.boundCollectionId);
  const papers = useLiteratureStore((s) => s.papers);
  const pullingFromZotero = useLiteratureStore((s) => s.pullingFromZotero);
  const pullFromZotero = useLiteratureStore((s) => s.pullFromZotero);
  const setBoundCollection = useLiteratureStore((s) => s.setBoundCollection);
  const pdfImportBusyCount = useLiteratureStore((s) => s.pdfImportBusyCount);
  const pdfImportQueuedCount = useLiteratureStore((s) => s.pdfImportQueuedCount);
  const pdfDownloadBusyCount = useLiteratureStore((s) => Object.keys(s.pdfDownloadProgress).length);
  const pdfImportTotalCount = pdfImportBusyCount + pdfImportQueuedCount;
  const enqueuePdfImports = useLiteratureStore((s) => s.enqueuePdfImports);
  const chatSessionId = useChatStore((s) => s.sessionId);
  const addStagedToLibrary = useCitationStagingStore((s) => s.addStagedToLibrary);
  const cancelBatchAdd = useCitationStagingStore((s) => s.cancelBatchAdd);
  const batchAdd = useCitationStagingStore((s) => s.batchAdd);
  const addProgressById = useCitationStagingStore((s) => s.addProgressById);
  const inFlightAddIds = useCitationStagingStore((s) => s.inFlightAddIds);
  const clearPanelForSession = useCitationStagingStore((s) => s.clearPanelForSession);
  const checkedStagedIds = useCitationStagingStore((s) =>
    chatSessionId
      ? s.checkedStagedIdsBySession[chatSessionId] ?? EMPTY_CHECKED_STAGED_IDS
      : EMPTY_CHECKED_STAGED_IDS,
  );
  const citations = useCitationStagingStore((s) => {
    if (!chatSessionId) return EMPTY_STAGED_CITATIONS;
    if (s.panelHiddenSessions[chatSessionId]) return EMPTY_STAGED_CITATIONS;
    return s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS;
  });
  const libraryPaperIdSet = useMemo(
    () => new Set(papers.map((p) => p.id)),
    [papers],
  );
  const selectedAddableIds = useMemo(() => {
    const checked = new Set(checkedStagedIds);
    return citations
      .filter(
        (c) =>
          checked.has(c.id) &&
          isStagedCitationAddable(c, isCitationInLibrary(c, libraryPaperIdSet)),
      )
      .map((c) => c.id);
  }, [citations, checkedStagedIds, libraryPaperIdSet]);
  const selectedAddableCount = selectedAddableIds.length;
  const addingAll = batchAdd != null && batchAdd.sessionId === chatSessionId;
  const activeBatchProgress = addingAll
    ? Object.entries(addProgressById).find(
        ([stagedId, p]) =>
          Boolean(inFlightAddIds[stagedId]) &&
          p.sessionId === chatSessionId &&
          p.phase !== "done",
      )?.[1]
    : undefined;

  // Global extraction progress — count papers with any queued/extracting source.
  const extractBusyCount = useLiteratureExtractStore((s) => {
    let n = 0;
    for (const states of Object.values(s.statesByPaper)) {
      if (!states) continue;
      const busy = (["mineru", "pdfjs", "html"] as const).some((src) =>
        ["queued", "extracting"].includes(states[src]?.status ?? ""),
      );
      if (busy) n++;
    }
    return n;
  });
  const extractQueuedCount = useLiteratureExtractStore((s) => {
    let n = 0;
    for (const states of Object.values(s.statesByPaper)) {
      if (!states) continue;
      const queued = (["mineru", "pdfjs", "html"] as const).some(
        (src) => states[src]?.status === "queued",
      );
      if (queued) n++;
    }
    return n;
  });
  const libraryBusyLabel = libraryBackgroundBusyLabel(
    pdfImportTotalCount,
    extractBusyCount,
    pdfDownloadBusyCount,
  );
  const libraryBusyTitle = libraryBackgroundBusyTitle(
    pdfImportTotalCount,
    extractBusyCount,
    extractQueuedCount,
    pdfDownloadBusyCount,
  );

  const [busy, setBusy] = useState(false);
  const [newDialog, setNewDialog] = useState(false);
  const [citationHealthOpen, setCitationHealthOpen] = useState(false);
  const [zoteroDialogOpen, setZoteroDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const apply = () => setCompact(el.clientWidth < LITERATURE_TOOLBAR_COMPACT_WIDTH);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleNewEntry = async () => {
    const title = newTitle.trim();
    if (!title || !projectRoot) return;
    setBusy(true);
    try {
      await createPaper(projectRoot, { title });
      setNewDialog(false);
      setNewTitle("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const handleImportPdf = async () => {
    if (!projectRoot) return;
    const { path } = await literatureDesktop.literaturePickPdf();
    if (!path) return;
    enqueuePdfImports(projectRoot, [path]);
  };

  const handleImportBibTeX = async () => {
    if (!projectRoot) return;
    const { paths } = await literatureDesktop.literaturePickBibTeX();
    if (!paths.length) return;
    setBusy(true);
    try {
      const bibPath = paths.find((p) => p.toLowerCase().endsWith(".bib"));
      if (!bibPath) {
        toast.error("Select a .bib file (optionally with Better BibTeX .json)");
        return;
      }
      const bibContent = await fsDesktop.fsRead(bibPath).then((r) => r.content);
      const jsonPath = paths.find((p) => p.toLowerCase().endsWith(".json"));
      let jsonContent: string | undefined;
      if (jsonPath) {
        jsonContent = await fsDesktop.fsRead(jsonPath).then((r) => r.content);
      }
      await importBibTeX(projectRoot, bibContent, jsonContent);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAddSelectedCitations = async () => {
    if (!chatSessionId || selectedAddableCount === 0 || addingAll) return;
    await addStagedToLibrary(chatSessionId, selectedAddableIds);
  };

  const handleClearCitations = () => {
    if (!chatSessionId) return;
    clearPanelForSession(chatSessionId);
  };

  return (
    <>
      <div
        ref={toolbarRef}
        className={cn(
          "flex flex-1 items-center min-h-8 min-w-0 overflow-hidden",
          compact ? "gap-0.5" : "gap-1",
        )}
      >
        <LiteratureLibrarySubviewDropdown compact={compact} />

        {subview === "library" ? <LiteratureTagFilterDropdown compact={compact} /> : null}

        {libraryBusyLabel ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-primary/10 text-[length:var(--font-menu-item)] text-primary shrink-0",
              compact ? "size-6 justify-center px-0" : "max-w-[min(20rem,55vw)] px-2 h-6",
            )}
            title={libraryBusyTitle}
          >
            <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
            {!compact ? <span className="truncate tabular-nums">{libraryBusyLabel}</span> : null}
          </span>
        ) : null}

        <div className="flex-1" />

        {subview === "session-citations" ? (
          <>
            {addingAll && batchAdd ? (
              <button
                type="button"
                className={cn(
                  "inline-flex max-w-[min(18rem,50vw)] items-center gap-1 rounded-full border px-2 h-6 shrink-0",
                  "border-amber-500/35 bg-amber-500/10 text-[length:var(--font-menu-item)] text-amber-800 dark:text-amber-300",
                  "hover:bg-amber-500/15",
                )}
                title={t("modes.literature.cancelAllAdds")}
                aria-label={t("modes.literature.cancelAllAdds")}
                onClick={() => {
                  if (chatSessionId) cancelBatchAdd(chatSessionId);
                }}
              >
                <Loader2Icon className="size-3 shrink-0 animate-spin" />
                <span className="truncate tabular-nums">
                  {activeBatchProgress
                    ? stagedAddProgressLabel(activeBatchProgress)
                    : `${batchAdd.completed}/${batchAdd.total}`}
                </span>
                <SquareIcon className="size-3 shrink-0 fill-current" />
              </button>
            ) : null}
            <Hint
              label={
                selectedAddableCount > 0
                  ? t("modes.literature.addSelectedPendingHint", {
                      count: selectedAddableCount,
                    })
                  : t("modes.literature.addSelectedPendingEmptyHint")
              }
            >
              <Button
                size="xs"
                variant="ghost"
                className={cn("h-6 shrink-0", compact ? "size-6 px-0" : "px-1.5")}
                onClick={() => void handleAddSelectedCitations()}
                disabled={selectedAddableCount === 0 || addingAll}
              >
                {addingAll ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <PlusCircleIcon className="size-3.5" />
                )}
                {!compact ? (
                  <span className="ml-1">
                    {selectedAddableCount > 0
                      ? t("modes.literature.addSelected", { count: selectedAddableCount })
                      : t("modes.literature.addToLibrary")}
                  </span>
                ) : null}
              </Button>
            </Hint>
            <Hint label={t("modes.literature.clearCitationsHint")}>
              <Button
                size="xs"
                variant="ghost"
                className={cn(
                  "h-6 shrink-0 text-muted-foreground hover:text-destructive",
                  compact ? "size-6 px-0" : "px-1.5",
                )}
                onClick={handleClearCitations}
                disabled={citations.length === 0}
              >
                <Trash2Icon className="size-3.5" />
                {!compact ? <span className="ml-1">{t("modes.literature.clearCitations")}</span> : null}
              </Button>
            </Hint>
          </>
        ) : (
          <>
            <Hint label={t("modes.literature.citationHealthHint")}>
              <button
                type="button"
                className={cn(toolbarBtn, "shrink-0 size-6 justify-center px-0")}
                disabled={!projectRoot}
                onClick={() => setCitationHealthOpen(true)}
              >
                <BookMarkedIcon className="size-3.5" />
              </button>
            </Hint>
            <LiteratureBatchSelectionActions actions={batchActions} compact={compact} />
            <LiteratureAddByIdentifierButton projectRoot={projectRoot} disabled={busy} />
            <AppMenu>
            <Hint label={t("modes.literature.addToLibrary")}>
              <AppMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    toolbarBtn,
                    "shrink-0 size-6 justify-center px-0",
                  )}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <PlusIcon className="size-3.5" />
                  )}
                </button>
              </AppMenuTrigger>
            </Hint>
            <AppMenuContent align="end">
              <AppMenuItem
                disabled={!projectRoot || busy}
                onClick={() => {
                  setNewTitle("");
                  setNewDialog(true);
                }}
              >
                {t("modes.literature.newEntry")}
              </AppMenuItem>
              <AppMenuSeparator />
              <AppMenuItem disabled={!projectRoot || busy} onClick={() => void handleImportPdf()}>
                {t("modes.literature.importPdf")}
              </AppMenuItem>
              <AppMenuItem disabled={!projectRoot || busy} onClick={() => void handleImportBibTeX()}>
                {t("modes.literature.importBibTeX")}
              </AppMenuItem>
              <AppMenuSeparator />
              <AppMenuItem
                disabled={!projectRoot || busy}
                onClick={() => setZoteroDialogOpen(true)}
              >
                {boundCollectionId ? t("modes.literature.connectZotero") : t("modes.literature.connectZotero")}
              </AppMenuItem>
              {boundCollectionId ? (
                <AppMenuItem
                  disabled={!projectRoot || busy || pullingFromZotero}
                  onClick={() => {
                    if (!projectRoot) return;
                    void pullFromZotero(projectRoot);
                  }}
                >
                  {pullingFromZotero
                    ? t("modes.literature.refreshingZotero")
                    : t("modes.literature.refreshZotero")}
                </AppMenuItem>
              ) : null}
            </AppMenuContent>
          </AppMenu>
          </>
        )}
      </div>

      <Dialog open={newDialog} onOpenChange={setNewDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("literature.dialogs.newEntry")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-[length:var(--font-size-11)] text-muted-foreground">
              {t("literature.dialogs.entryTitle")}
            </Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("literature.dialogs.paperTitle")}
              onKeyDown={(e) => e.key === "Enter" && handleNewEntry()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleNewEntry()} disabled={!newTitle.trim() || busy}>
              {busy ? t("common.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {projectRoot ? (
        <ZoteroConnectDialog
          open={zoteroDialogOpen}
          onOpenChange={setZoteroDialogOpen}
          projectRoot={projectRoot}
          currentCollectionId={boundCollectionId}
          onBound={(collectionId, collectionName) => {
            void setBoundCollection(projectRoot, collectionId, collectionName);
          }}
        />
      ) : null}

      <LiteratureCitationHealthDialog
        open={citationHealthOpen}
        onOpenChange={setCitationHealthOpen}
      />
    </>
  );
}

export function LiteratureToolbar({ tab }: { tab: RightTab }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const papers = useLiteratureStore((s) => s.papers);
  const paperId = tab.kind === "literature" ? tab.literaturePaperId : undefined;
  const paper = paperId
    ? papers.find((p) => p.id === paperId)
    : null;

  const extractPaperIds = useMemo(() => {
    if (paperId) return [paperId];
    return papers.map((p) => p.id);
  }, [paperId, papers]);

  useLiteratureExtractSession(projectRoot, extractPaperIds);

  if (paperId && paper) {
    return <LiteratureReaderToolbar paper={paper} tab={tab} />;
  }

  return <LiteratureLibraryToolbar />;
}
