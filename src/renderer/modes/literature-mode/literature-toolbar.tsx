import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon, Loader2Icon, NotebookPenIcon, PlusCircleIcon, Trash2Icon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useChatStore } from "@/stores/chat-store";
import { useCitationStagingStore, EMPTY_STAGED_CITATIONS } from "@/stores/citation-staging-store";
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
import { cn } from "@/lib/utils";
import type { LiteraturePaper } from "@/types/electron.d";

const toolbarBtn = cn(
  "flex items-center gap-1.5 h-6 px-2 rounded text-[length:var(--font-menu-item)]",
  "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
);

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
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const subview = useLiteratureStore((s) => s.librarySubview);
  const createPaper = useLiteratureStore((s) => s.createPaper);
  const ingestPdf = useLiteratureStore((s) => s.ingestPdf);
  const addByDoi = useLiteratureStore((s) => s.addByDoi);
  const addByArxiv = useLiteratureStore((s) => s.addByArxiv);
  const importBibTeX = useLiteratureStore((s) => s.importBibTeX);
  const chatSessionId = useChatStore((s) => s.sessionId);
  const addAllToLibrary = useCitationStagingStore((s) => s.addAllToLibrary);
  const clearPanelForSession = useCitationStagingStore((s) => s.clearPanelForSession);
  const citations = useCitationStagingStore((s) => {
    if (!chatSessionId) return EMPTY_STAGED_CITATIONS;
    if (s.panelHiddenSessions[chatSessionId]) return EMPTY_STAGED_CITATIONS;
    return s.bySession[chatSessionId] ?? EMPTY_STAGED_CITATIONS;
  });
  const pendingCount = citations.filter((c) => !c.addedToLibrary).length;

  const [busy, setBusy] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [newDialog, setNewDialog] = useState(false);
  const [doiDialog, setDoiDialog] = useState(false);
  const [arxivDialog, setArxivDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [inputValue, setInputValue] = useState("");

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
    setBusy(true);
    try {
      await ingestPdf(projectRoot, path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
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

  const handleAddByDoi = async () => {
    const doi = inputValue.trim();
    if (!doi || !projectRoot) return;
    setBusy(true);
    try {
      await addByDoi(projectRoot, doi);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add by DOI");
    } finally {
      setBusy(false);
      setDoiDialog(false);
      setInputValue("");
    }
  };

  const handleAddByArxiv = async () => {
    const id = inputValue.trim();
    if (!id || !projectRoot) return;
    setBusy(true);
    try {
      await addByArxiv(projectRoot, id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add by arXiv ID");
    } finally {
      setBusy(false);
      setArxivDialog(false);
      setInputValue("");
    }
  };

  const handleAddAllCitations = async () => {
    if (!chatSessionId || pendingCount === 0) return;
    setAddingAll(true);
    try {
      await addAllToLibrary(chatSessionId);
    } finally {
      setAddingAll(false);
    }
  };

  const handleClearCitations = () => {
    if (!chatSessionId) return;
    clearPanelForSession(chatSessionId);
  };

  return (
    <>
      <div className="flex flex-1 items-center gap-1 min-h-8 min-w-0 overflow-hidden">
        <span className="text-[length:var(--font-menu-item)] text-muted-foreground shrink-0">
          Library
        </span>

        <LiteratureLibrarySubviewDropdown />

        <div className="flex-1" />

        {subview === "session-citations" ? (
          <>
            <Button
              size="xs"
              variant="ghost"
              className="h-6 px-1.5 shrink-0"
              onClick={() => void handleAddAllCitations()}
              disabled={pendingCount === 0 || addingAll}
              title="Add all pending citations to the library"
            >
              <PlusCircleIcon className="size-3.5" />
              <span className="hidden @md:inline ml-1">Add all</span>
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="h-6 px-1.5 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleClearCitations}
              disabled={citations.length === 0}
              title="Clear all citations in this session"
            >
              <Trash2Icon className="size-3.5" />
              <span className="hidden @md:inline ml-1">Clear</span>
            </Button>
          </>
        ) : (
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
                onClick={() => {
                  setInputValue("");
                  setDoiDialog(true);
                }}
              >
                Add by DOI…
              </AppMenuItem>
              <AppMenuItem
                disabled={!projectRoot || busy}
                onClick={() => {
                  setInputValue("");
                  setArxivDialog(true);
                }}
              >
                Add by arXiv ID…
              </AppMenuItem>
            </AppMenuContent>
          </AppMenu>
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

      <Dialog open={doiDialog} onOpenChange={setDoiDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add by DOI</DialogTitle>
          </DialogHeader>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="10.1145/3292500.3330701"
            onKeyDown={(e) => e.key === "Enter" && handleAddByDoi()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoiDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleAddByDoi()} disabled={!inputValue.trim() || busy}>
              {busy ? "Fetching…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={arxivDialog} onOpenChange={setArxivDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add by arXiv ID</DialogTitle>
          </DialogHeader>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="2401.12345"
            onKeyDown={(e) => e.key === "Enter" && handleAddByArxiv()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setArxivDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleAddByArxiv()} disabled={!inputValue.trim() || busy}>
              {busy ? "Fetching…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LiteratureToolbar({ tab }: { tab: RightTab }) {
  const papers = useLiteratureStore((s) => s.papers);
  const paper = tab.literaturePaperId
    ? papers.find((p) => p.id === tab.literaturePaperId)
    : null;

  if (tab.literaturePaperId && paper) {
    return <LiteratureReaderToolbar paper={paper} tab={tab} />;
  }

  return <LiteratureLibraryToolbar />;
}
