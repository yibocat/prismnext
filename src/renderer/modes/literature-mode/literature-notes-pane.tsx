import { useCallback, useEffect, useMemo, useState } from "react";
import { Suspense } from "react";
import { Loader2Icon, NotebookPenIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import { resolveNotebookDir } from "@/types/workspace";
import { listPaperNotes, resolvePaperNotePath } from "@/lib/literature/paper-notes";
import { createNewPaperNote } from "@/lib/literature/create-paper-note";
import { TabContext, type TabContextValue } from "@/lib/workspace/tab-context";
import { CodeEditor, MarkdownPreview } from "@/lib/workspace/mode-utils";
import { Button } from "@/components/ui/button";
import type { LiteraturePaper } from "@/types/electron.d";
import type { RightTab } from "@/lib/workspace/mode-registry";

function noteTabForPath(paperId: string, relativePath: string, name: string, fileId: string): RightTab {
  return {
    id: `lit-note-${paperId}-${relativePath}`,
    kind: "file",
    title: name,
    isInitial: false,
    fileId,
    filePath: relativePath,
  };
}

export function LiteratureNotesPane({
  paper,
  tab,
}: {
  projectRoot: string;
  paper: LiteraturePaper;
  tab: RightTab;
}) {
  const files = useDocumentStore((s) => s.files);
  const openedContents = useDocumentStore((s) => s.openedContents);
  const openFile = useDocumentStore((s) => s.openFile);
  const notebookDir = resolveNotebookDir(useWorkspaceConfigStore.getState().workspaceDirs);

  const activeNotePath = useLiteratureReaderStore(
    (s) => s.activeNotePathByPaper[paper.id] ?? null,
  );
  const setActiveNote = useLiteratureReaderStore((s) => s.setActiveNote);

  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(false);

  const viewMode = (tab.viewMode ?? "source") as "source" | "preview";

  const notes = useMemo(
    () => listPaperNotes(paper, files, notebookDir),
    [paper, files, notebookDir],
  );

  const resolvedNotePath = useMemo(
    () => resolvePaperNotePath(activeNotePath, notes),
    [activeNotePath, notes],
  );

  const activeFile = useMemo(
    () => (resolvedNotePath ? files.find((f) => f.relativePath === resolvedNotePath) : undefined),
    [files, resolvedNotePath],
  );

  const openNoteByPath = useCallback(
    async (relativePath: string) => {
      const file = files.find((f) => f.relativePath === relativePath);
      if (!file) return;
      setOpening(true);
      try {
        if (!openedContents.has(file.id)) {
          await openFile(file.id);
        } else {
          useDocumentStore.getState().setActiveFile(file.id);
        }
        setActiveNote(paper.id, relativePath);
      } finally {
        setOpening(false);
      }
    },
    [files, openedContents, openFile, paper.id, setActiveNote],
  );

  useEffect(() => {
    if (!resolvedNotePath) {
      if (activeNotePath) setActiveNote(paper.id, null);
      return;
    }

    const file = files.find((f) => f.relativePath === resolvedNotePath);
    if (!file) return;

    if (!openedContents.has(file.id)) {
      void openNoteByPath(resolvedNotePath);
      return;
    }

    if (activeNotePath !== resolvedNotePath) {
      setActiveNote(paper.id, resolvedNotePath);
    }
    useDocumentStore.getState().setActiveFile(file.id);
  }, [
    activeNotePath,
    resolvedNotePath,
    files,
    openedContents,
    openNoteByPath,
    paper.id,
    setActiveNote,
  ]);

  const handleNewNote = async () => {
    setCreating(true);
    try {
      const path = await createNewPaperNote(paper);
      if (path) setActiveNote(paper.id, path);
    } finally {
      setCreating(false);
    }
  };

  const tabCtx: TabContextValue | null = useMemo(() => {
    if (!activeFile || !resolvedNotePath) return null;
    return {
      tab: noteTabForPath(paper.id, resolvedNotePath, activeFile.name, activeFile.id),
      isActive: true,
    };
  }, [activeFile, resolvedNotePath, paper.id]);

  if (!resolvedNotePath || !activeFile || !tabCtx) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <NotebookPenIcon className="size-10 text-muted-foreground/25" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground/90">No reading note open</p>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground max-w-[240px]">
            Create a note for this paper, or pick one from the sidebar.
          </p>
        </div>
        <Button size="sm" onClick={() => void handleNewNote()} disabled={creating}>
          {creating ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" />
              Creating…
            </>
          ) : (
            "New note"
          )}
        </Button>
      </div>
    );
  }

  const contentLoaded = openedContents.has(activeFile.id);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <TabContext.Provider value={tabCtx}>
        <div className="relative min-h-0 flex-1">
          {opening || !contentLoaded ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              <Loader2Icon className="size-4 animate-spin" />
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </div>
              }
            >
              {viewMode === "source" ? <CodeEditor /> : <MarkdownPreview />}
            </Suspense>
          )}
        </div>
      </TabContext.Provider>
    </div>
  );
}
