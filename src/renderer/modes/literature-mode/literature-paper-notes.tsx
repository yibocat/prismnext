import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, NotebookPenIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import { listPaperNotes, type PaperNoteFile } from "@/lib/literature/paper-notes";
import { createNewPaperNote, openPaperNote } from "@/lib/literature/create-paper-note";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { cn } from "@/lib/utils";
import { PAPER_EXTRACT_ACTION_LABEL } from "../../../shared/paper-extract";
import type { LiteraturePaper } from "@/types/electron.d";

const NOTES_SECTION_LABEL =
  "text-[length:var(--font-size-11)] font-medium tracking-wide text-muted-foreground/60";

const NOTES_GRID_CLASS =
  "grid min-w-0 gap-2 grid-cols-[repeat(auto-fill,minmax(max(9rem,calc((100%-2rem)/5)),1fr))]";

function noteLabel(name: string): string {
  const base = name.replace(/\.md$/i, "");
  const dated = base.match(/^(\d{4}-\d{2}-\d{2})(?:-note(?:-(\d+))?)?$/);
  if (dated) {
    const [, day, suffix] = dated;
    return suffix ? `${day} · ${suffix}` : day;
  }
  return base;
}

function NoteCard({
  note,
  deleting,
  onOpen,
  onDelete,
  deleteTitle,
}: {
  note: PaperNoteFile;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
  deleteTitle: string;
}) {
  return (
    <Card
      className={cn(
        "group relative cursor-pointer py-0 shadow-none transition-colors",
        "hover:border-primary/25 hover:bg-muted/15",
      )}
      onClick={onOpen}
    >
      <button
        type="button"
        className={cn(
          "absolute right-1 top-1 z-10 flex size-5 items-center justify-center rounded-sm",
          "text-muted-foreground/45 opacity-0 transition-opacity",
          "hover:bg-destructive/10 hover:text-destructive",
          "group-hover:opacity-100 focus-visible:opacity-100",
          deleting && "opacity-100 pointer-events-none",
        )}
        title={deleteTitle}
        disabled={deleting}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        {deleting ? (
          <Loader2Icon className="size-2.5 animate-spin" />
        ) : (
          <Trash2Icon className="size-2.5" />
        )}
      </button>

      <div className="flex flex-col gap-0.5 p-2.5 pr-6">
        <p className="truncate text-[length:var(--font-size-13)] font-medium leading-snug text-foreground/90">
          {noteLabel(note.name)}
        </p>
        <p className={cn(SETTINGS_ROW_DESC, "mt-0 truncate leading-snug")}>{note.name}</p>
      </div>
    </Card>
  );
}

export function LiteraturePaperNotesSection({
  paper,
  isZoteroPaper = false,
  showSectionDivider = false,
}: {
  paper: LiteraturePaper;
  isZoteroPaper?: boolean;
  showSectionDivider?: boolean;
}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);
  const deleteFile = useDocumentStore((s) => s.deleteFile);
  const workspaceDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const notebookDir = resolveNotebookDir(workspaceDirs);
  const notes = listPaperNotes(paper, files, notebookDir);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [creatingNote, setCreatingNote] = useState(false);

  const handleNewNote = async () => {
    if (!projectRoot) return;
    setCreatingNote(true);
    try {
      await createNewPaperNote(paper);
    } finally {
      setCreatingNote(false);
    }
  };

  const handleDelete = async (note: PaperNoteFile) => {
    if (!window.confirm(t("literature.notes.deleteConfirm", { name: note.name }))) return;
    setDeletingPath(note.relativePath);
    try {
      await deleteFile(note.relativePath);
      toast.success(t("literature.notes.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingPath(null);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        showSectionDivider && "border-t border-border/40 pt-3",
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className={NOTES_SECTION_LABEL}>
          {t("modes.literature.notes")}
          {notes.length > 0 ? ` (${notes.length})` : ""}
        </h3>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          title={t("literature.notes.newNote")}
          className="h-6 px-1.5 text-[length:var(--font-menu-item)] text-muted-foreground hover:text-foreground"
          disabled={creatingNote || !projectRoot}
          onClick={() => void handleNewNote()}
        >
          {creatingNote ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <NotebookPenIcon className="size-3" />
          )}
          <span className="ml-1">{t("literature.notes.newNote")}</span>
        </Button>
      </div>

      {isZoteroPaper ? (
        <p className={cn(SETTINGS_ROW_DESC, "mt-0 shrink-0 text-[length:var(--font-size-12)]")}>
          Notes are saved in project files. {PAPER_EXTRACT_ACTION_LABEL}, open PDF, or{" "}
          <span className="text-foreground/85">{t("literature.detail.keepInProject")}</span> keeps this entry after
          disconnecting Zotero.
        </p>
      ) : null}

      {notes.length === 0 ? (
        <p className={cn(SETTINGS_ROW_DESC, "mt-0 shrink-0")}>{t("literature.notes.empty")}</p>
      ) : (
        <div className={cn(NOTES_GRID_CLASS, showSectionDivider && "pr-0.5")}>
          {notes.map((note) => (
            <NoteCard
              key={note.relativePath}
              note={note}
              deleting={deletingPath === note.relativePath}
              deleteTitle={t("literature.notes.deleteNote")}
              onOpen={() => void openPaperNote(note.relativePath, note.name)}
              onDelete={() => void handleDelete(note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
