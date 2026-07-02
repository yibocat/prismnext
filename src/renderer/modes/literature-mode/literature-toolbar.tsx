import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PlusIcon, Loader2Icon, NotebookPenIcon, PlusCircleIcon, Trash2Icon, LoaderCircleIcon, XIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useChatStore } from "@/stores/chat-store";
import { useCitationStagingStore, EMPTY_STAGED_CITATIONS, isCitationInLibrary } from "@/stores/citation-staging-store";
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
import { stagedAddProgressLabel } from "@/lib/literature/staged-add-progress-label";
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
        title={notesOpen ? "Close reading notes" : "Open reading notes"}
      >
        <NotebookPenIcon className="size-3.5" />
      </button>
    </div>
  );
}

function LiteratureLibraryToolbar() {
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
  const addAllToLibrary = useCitationStagingStore((s) => s.addAllToLibrary);
  const batchAdd = useCitationStagingStore((s) => s.batchAdd);
  const addProgressById = useCitationStagingStore((s) => s.addProgressById);
  const clearPanelForSession = useCitationStagingStore((s) => s.clearPanelForSession);
  const citations = useCitationStagingStore((s) => {
    if (!chatSessionId) return EMPTY_STAGED_CITATIONS;
    if (s.panelHiddenSessions[chatSessionId]) return EMPTY_STAGED_CITATIONS;
    return s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS;
  });
  const libraryPaperIdSet = useMemo(
    () => new Set(papers.map((p) => p.id)),
    [papers],
  );
  const pendingCount = citations.filter(
    (c) => !isCitationInLibrary(c, libraryPaperIdSet),
  ).length;
  const addingAll = batchAdd != null && batchAdd.sessionId === chatSessionId;
  const activeBatchProgress = addingAll
    ? Object.values(addProgressById).find(
        (p) => p.sessionId === chatSessionId && p.phase !== "done",
      )
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
    const { path } = await window.electronAPI.literaturePickPdf();
    if (!path) return;
    enqueuePdfImports(projectRoot, [path]);
  };

  const handleImportBibTeX = async () => {
    if (!projectRoot) return;
    const { paths } = await window.electronAPI.literaturePickBibTeX();
    if (!paths.length) return;
    setBusy(true);
    try {
      const bibPath = paths.find((p) => p.toLowerCase().endsWith(".bib"));
      if (!bibPath) {
        toast.error("Select a .bib file (optionally with Better BibTeX .json)");
        return;
      }
      const bibContent = await window.electronAPI.fsRead(bibPath).then((r) => r.content);
      const jsonPath = paths.find((p) => p.toLowerCase().endsWith(".json"));
      let jsonContent: string | undefined;
      if (jsonPath) {
        jsonContent = await window.electronAPI.fsRead(jsonPath).then((r) => r.content);
      }
      await importBibTeX(projectRoot, bibContent, jsonContent);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAddAllCitations = async () => {
    if (!chatSessionId || pendingCount === 0 || addingAll) return;
    await addAllToLibrary(chatSessionId);
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
              <span
                className="inline-flex max-w-[min(16rem,45vw)] items-center gap-1 rounded-full bg-amber-500/10 px-2 h-6 text-[length:var(--font-menu-item)] text-amber-800 dark:text-amber-300 shrink-0"
                title={
                  activeBatchProgress
                    ? stagedAddProgressLabel(activeBatchProgress)
                    : `Adding ${batchAdd.completed}/${batchAdd.total} to library`
                }
              >
                <Loader2Icon className="size-3 shrink-0 animate-spin" />
                <span className="truncate tabular-nums">
                  {activeBatchProgress
                    ? stagedAddProgressLabel(activeBatchProgress)
                    : `${batchAdd.completed}/${batchAdd.total} adding`}
                </span>
              </span>
            ) : null}
            <Button
              size="xs"
              variant="ghost"
              className={cn("h-6 shrink-0", compact ? "size-6 px-0" : "px-1.5")}
              onClick={() => void handleAddAllCitations()}
              disabled={pendingCount === 0 || addingAll}
              title="Add all pending citations to the library"
            >
              {addingAll ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlusCircleIcon className="size-3.5" />
              )}
              {!compact ? <span className="ml-1">Add all</span> : null}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className={cn(
                "h-6 shrink-0 text-muted-foreground hover:text-destructive",
                compact ? "size-6 px-0" : "px-1.5",
              )}
              onClick={handleClearCitations}
              disabled={citations.length === 0}
              title="Clear all citations in this session"
            >
              <Trash2Icon className="size-3.5" />
              {!compact ? <span className="ml-1">Clear</span> : null}
            </Button>
          </>
        ) : (
          <>
            <LiteratureBatchSelectionActions actions={batchActions} compact={compact} />
            <LiteratureAddByIdentifierButton projectRoot={projectRoot} disabled={busy} />
            <AppMenu>
            <AppMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  toolbarBtn,
                  "shrink-0 size-6 justify-center px-0",
                )}
                title="Add to library"
                disabled={busy}
              >
                {busy ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <PlusIcon className="size-3.5" />
                )}
              </button>
            </AppMenuTrigger>
            <AppMenuContent align="end">
              <AppMenuItem
                disabled={!projectRoot || busy}
                onClick={() => {
                  setNewTitle("");
                  setNewDialog(true);
                }}
              >
                New entry…
              </AppMenuItem>
              <AppMenuSeparator />
              <AppMenuItem disabled={!projectRoot || busy} onClick={() => void handleImportPdf()}>
                Import PDF…
              </AppMenuItem>
              <AppMenuItem disabled={!projectRoot || busy} onClick={() => void handleImportBibTeX()}>
                Import BibTeX (+ optional .json)…
              </AppMenuItem>
              <AppMenuSeparator />
              <AppMenuItem
                disabled={!projectRoot || busy}
                onClick={() => setZoteroDialogOpen(true)}
              >
                {boundCollectionId ? "Manage Zotero sync…" : "Connect Zotero…"}
              </AppMenuItem>
              {boundCollectionId ? (
                <AppMenuItem
                  disabled={!projectRoot || busy || pullingFromZotero}
                  onClick={() => {
                    if (!projectRoot) return;
                    void pullFromZotero(projectRoot);
                  }}
                >
                  {pullingFromZotero ? "Refreshing from Zotero…" : "Refresh from Zotero"}
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
            <DialogTitle>New entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-[length:var(--font-size-11)] text-muted-foreground">Title</Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Paper title"
              onKeyDown={(e) => e.key === "Enter" && handleNewEntry()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleNewEntry()} disabled={!newTitle.trim() || busy}>
              {busy ? "Creating…" : "Create"}
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
    </>
  );
}

export function LiteratureToolbar({ tab }: { tab: RightTab }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const papers = useLiteratureStore((s) => s.papers);
  const paper = tab.literaturePaperId
    ? papers.find((p) => p.id === tab.literaturePaperId)
    : null;

  const extractPaperIds = useMemo(() => {
    if (tab.literaturePaperId) return [tab.literaturePaperId];
    return papers.map((p) => p.id);
  }, [tab.literaturePaperId, papers]);

  useLiteratureExtractSession(projectRoot, extractPaperIds);

  if (tab.literaturePaperId && paper) {
    return <LiteratureReaderToolbar paper={paper} tab={tab} />;
  }

  return <LiteratureLibraryToolbar />;
}
