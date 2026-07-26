import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileTextIcon,
  FolderOpenIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import { listPaperNotes, paperNotesFolderPath } from "@/lib/literature/paper-notes";
import { createNewPaperNote, openPaperNoteInFiles } from "@/lib/literature/create-paper-note";
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from "@/components/ui/app-context-menu";
import {
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import type { LiteraturePaper } from "@/types/electron.d";
import {
  LiteratureSidebarCitationPanel,
  useLiteratureCitationNetwork,
} from "./literature-sidebar-citations";
import {
  LiteratureSidebarViewTabs,
  type LiteratureReaderSidebarView,
} from "./literature-sidebar-view-tabs";

const headerBtn = cn(
  "flex size-5 items-center justify-center rounded text-muted-foreground",
  "hover:bg-accent hover:text-accent-foreground transition-colors",
);

const ROW_BASE =
  "flex min-h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors";

function noteLabel(name: string): string {
  const base = name.replace(/\.md$/i, "");
  const dated = base.match(/^(\d{4}-\d{2}-\d{2})(?:-note(?:-(\d+))?)?$/);
  if (dated) {
    const [, day, suffix] = dated;
    return suffix ? `${day} · ${suffix}` : day;
  }
  return base;
}

function truncateText(text: string, max = 72): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function PaperNoteRow({
  note,
  isActive,
  isDirty,
  onOpen,
  onOpenInFiles,
}: {
  note: { relativePath: string; name: string };
  isActive: boolean;
  isDirty: boolean;
  onOpen: () => void;
  onOpenInFiles: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AppContextMenu>
      <AppContextMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            ROW_BASE,
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
          onClick={onOpen}
        >
          <FileTextIcon className="size-3 shrink-0 opacity-60" />
          <span className="min-w-0 flex-1 truncate">{noteLabel(note.name)}</span>
          {isDirty ? (
            <span
              className="size-2 shrink-0 rounded-full bg-info"
              title={t("modes.literature.unsavedChanges")}
            />
          ) : null}
        </button>
      </AppContextMenuTrigger>
      <AppContextMenuContent>
        <AppContextMenuItem onSelect={onOpenInFiles}>
          <FolderOpenIcon className="size-3.5 opacity-70" />
          Open in Files
        </AppContextMenuItem>
      </AppContextMenuContent>
    </AppContextMenu>
  );
}

export function LiteraturePaperWorkspaceSidebar({ paper }: { paper: LiteraturePaper }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);
  const openedContents = useDocumentStore((s) => s.openedContents);
  const dirtyVersion = useDocumentStore((s) => s.dirtyVersion);
  const openFile = useDocumentStore((s) => s.openFile);
  const isFileDirty = useDocumentStore((s) => s.isFileDirty);
  const notebookDir = resolveNotebookDir(useWorkspaceConfigStore.getState().workspaceDirs);

  const loadAnnotations = useLiteratureStore((s) => s.loadAnnotations);
  const deleteAnnotation = useLiteratureStore((s) => s.deleteAnnotation);
  const activeNotePath = useLiteratureReaderStore(
    (s) => s.activeNotePathByPaper[paper.id] ?? null,
  );
  const setActiveNote = useLiteratureReaderStore((s) => s.setActiveNote);
  const setNotesPaneOpen = useLiteratureReaderStore((s) => s.setNotesPaneOpen);
  const requestFocusPage = useLiteratureReaderStore((s) => s.requestFocusPage);
  const requestDeleteAnnotation = useLiteratureReaderStore((s) => s.requestDeleteAnnotation);

  const [tab, setTab] = useState<LiteratureReaderSidebarView>("notes");
  const [creating, setCreating] = useState(false);
  const [annotations, setAnnotations] = useState<
    Awaited<ReturnType<typeof loadAnnotations>>
  >([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);

  const citationTabActive = tab === "references" || tab === "citedBy";
  const citationNetwork = useLiteratureCitationNetwork(
    projectRoot,
    paper,
    citationTabActive,
  );

  const notes = useMemo(
    () => listPaperNotes(paper, files, notebookDir),
    [paper, files, notebookDir],
  );

  const notesFolder = paperNotesFolderPath(notebookDir, paper);

  void dirtyVersion;

  useEffect(() => {
    if (!projectRoot) return;
    setLoadingAnnotations(true);
    void loadAnnotations(projectRoot, paper.id)
      .then(setAnnotations)
      .finally(() => setLoadingAnnotations(false));
  }, [projectRoot, paper.id, loadAnnotations, tab]);

  const openNote = useCallback(
    async (relativePath: string) => {
      const file = files.find((f) => f.relativePath === relativePath);
      if (!file) return;
      if (!openedContents.has(file.id)) {
        await openFile(file.id);
      } else {
        useDocumentStore.getState().setActiveFile(file.id);
      }
      setActiveNote(paper.id, relativePath);
      setNotesPaneOpen(paper.id, true);
    },
    [files, openedContents, openFile, paper.id, setActiveNote, setNotesPaneOpen],
  );

  const openNoteInFiles = useCallback(
    (relativePath: string, name: string) => {
      void openPaperNoteInFiles(relativePath, name);
    },
    [],
  );

  const handleDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!projectRoot) return;
      await deleteAnnotation(projectRoot, annotationId);
      requestDeleteAnnotation(annotationId);
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    },
    [projectRoot, deleteAnnotation, requestDeleteAnnotation],
  );

  const handleNewNote = async () => {
    setCreating(true);
    try {
      const path = await createNewPaperNote(paper);
      if (path) {
        setActiveNote(paper.id, path);
        setNotesPaneOpen(paper.id, true);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center gap-2 px-3 min-w-0">
        <LiteratureSidebarViewTabs
          value={tab}
          onValueChange={setTab}
          referenceCount={citationNetwork.result?.references?.totalCount}
          citedByCount={citationNetwork.result?.citedBy?.totalCount}
        />
        <div className="flex-1" />
        {citationTabActive ? (
          <Hint label={t("modes.literature.refreshCitations")}>
            <button
              type="button"
              className={headerBtn}
              disabled={citationNetwork.loading || citationNetwork.refreshing}
              onClick={() => void citationNetwork.refresh()}
            >
              {citationNetwork.refreshing ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
            </button>
          </Hint>
        ) : null}
      </SidebarHeader>

      <SidebarContent className="min-h-0 gap-0 overflow-auto px-1 py-1">
        {tab === "references" || tab === "citedBy" ? (
          <LiteratureSidebarCitationPanel
            paper={paper}
            section={tab === "references" ? "references" : "citedBy"}
            network={citationNetwork}
          />
        ) : tab === "notes" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between px-1 py-0.5">
              <span
                className="truncate text-[length:var(--font-size-11)] text-muted-foreground/60"
                title={notesFolder}
              >
                {notesFolder.split("/").pop()}
              </span>
              <Hint label={t("literature.notes.newNote")}>
                <button
                  type="button"
                  className={headerBtn}
                  disabled={creating}
                  onClick={() => void handleNewNote()}
                >
                  {creating ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <PlusIcon className="size-3" />
                  )}
                </button>
              </Hint>
            </div>

            {notes.length === 0 ? (
              <p className="px-2 py-3 text-[length:var(--font-size-11)] text-muted-foreground/55">
                {t("modes.literature.noNotesYet")}
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {notes.map((note) => (
                  <li key={note.relativePath}>
                    <PaperNoteRow
                      note={note}
                      isActive={activeNotePath === note.relativePath}
                      isDirty={isFileDirty(note.relativePath)}
                      onOpen={() => void openNote(note.relativePath)}
                      onOpenInFiles={() => openNoteInFiles(note.relativePath, note.name)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-0.5">
            {loadingAnnotations ? (
              <div className="flex justify-center py-4">
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : annotations.length === 0 ? (
              <p className="px-2 py-3 text-[length:var(--font-size-11)] text-muted-foreground/55">
                Highlight text in the PDF to add annotations.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {annotations.map((ann) => (
                  <li key={ann.id}>
                    <div className={cn(ROW_BASE, "group flex-col items-start gap-0.5 py-1.5 pr-1")}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 text-left"
                        onClick={() => requestFocusPage(ann.page)}
                      >
                        <span className="flex w-full items-center gap-1.5 text-[length:var(--font-size-11)] text-muted-foreground/70">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: ann.color ?? "var(--warning)" }}
                          />
                          p.{ann.page}
                        </span>
                        <span className="w-full text-[length:var(--font-size-11)] leading-snug text-foreground/85">
                          {ann.quoted_text?.trim()
                            ? truncateText(ann.quoted_text)
                            : "(highlight)"}
                        </span>
                      </button>
                      <Hint label={t("modes.literature.deleteHighlight")}>
                        <button
                          type="button"
                          className={cn(
                            headerBtn,
                            "ml-auto opacity-0 group-hover:opacity-100",
                          )}
                          onClick={() => void handleDeleteAnnotation(ann.id)}
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      </Hint>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SidebarContent>
    </>
  );
}
