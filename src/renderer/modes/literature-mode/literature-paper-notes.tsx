import { useState } from "react";
import { Trash2Icon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import { listPaperNotes, type PaperNoteFile } from "@/lib/literature/paper-notes";
import { openPaperNote } from "@/lib/literature/create-paper-note";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LiteraturePaper } from "@/types/electron.d";

/** Match {@link literature-entry-panel} section labels. */
const NOTES_SECTION_LABEL =
  "text-[length:var(--font-size-11)] font-medium tracking-wide text-muted-foreground/60";

/** Min card width; column count follows panel width smoothly (1–5 cols). */
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
}: {
  note: PaperNoteFile;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
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
        title="Delete note"
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
}: {
  paper: LiteraturePaper;
  isZoteroPaper?: boolean;
}) {
  const files = useDocumentStore((s) => s.files);
  const deleteFile = useDocumentStore((s) => s.deleteFile);
  const workspaceDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const notebookDir = resolveNotebookDir(workspaceDirs);
  const notes = listPaperNotes(paper, files, notebookDir);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const handleDelete = async (note: PaperNoteFile) => {
    if (!window.confirm(`Delete note "${note.name}"? This cannot be undone.`)) return;
    setDeletingPath(note.relativePath);
    try {
      await deleteFile(note.relativePath);
      toast.success("Note deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingPath(null);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className={NOTES_SECTION_LABEL}>
        Notes{notes.length > 0 ? ` (${notes.length})` : ""}
      </h3>
      {isZoteroPaper ? (
        <p className={cn(SETTINGS_ROW_DESC, "mt-0 text-[length:var(--font-size-12)]")}>
          Notes are saved in project files. Use{" "}
          <span className="text-foreground/85">Import to local</span> on this entry to keep literature
          links after disconnecting Zotero.
        </p>
      ) : null}
      {notes.length === 0 ? (
        <p className={cn(SETTINGS_ROW_DESC, "mt-0")}>
          No reading notes yet. Use <span className="text-foreground/80">New note</span> to add one.
        </p>
      ) : (
        <div className={NOTES_GRID_CLASS}>
          {notes.map((note) => (
            <NoteCard
              key={note.relativePath}
              note={note}
              deleting={deletingPath === note.relativePath}
              onOpen={() => void openPaperNote(note.relativePath, note.name)}
              onDelete={() => void handleDelete(note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
