import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenIcon, Loader2Icon, Link2OffIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { listOrphanPaperNotes, type OrphanPaperNote } from "@/lib/literature/paper-notes";
import {
  loadNotebookNoteContents,
} from "@/lib/literature/recover-paper-from-note";
import { openPaperNote } from "@/lib/literature/create-paper-note";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import { cn } from "@/lib/utils";

function groupOrphansByEntry(orphans: OrphanPaperNote[]): OrphanPaperNote[] {
  const byKey = new Map<string, OrphanPaperNote>();
  for (const note of orphans) {
    const key = note.bibkey ?? note.relativePath;
    if (!byKey.has(key)) byKey.set(key, note);
  }
  return [...byKey.values()];
}

function orphanLabel(note: OrphanPaperNote): string {
  return note.title?.trim() || note.bibkey || note.name.replace(/\.md$/i, "");
}

/** Sidebar section — reading notes without a library entry (e.g. after Zotero disconnect). */
export function LiteratureOrphanNotesSection() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);
  const papers = useLiteratureStore((s) => s.papers);
  const recoverPaperFromNote = useLiteratureStore((s) => s.recoverPaperFromNote);
  const workspaceDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const notebookDir = resolveNotebookDir(workspaceDirs);

  const [orphans, setOrphans] = useState<OrphanPaperNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [recoveringKey, setRecoveringKey] = useState<string | null>(null);

  useEffect(() => {
    if (!projectRoot) {
      setOrphans([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadNotebookNoteContents(projectRoot, files, notebookDir).then((map) => {
      if (cancelled) return;
      setOrphans(listOrphanPaperNotes(papers, files, notebookDir, map));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, files, papers, notebookDir]);

  const grouped = useMemo(() => groupOrphansByEntry(orphans), [orphans]);

  if (!projectRoot || (!loading && grouped.length === 0)) return null;

  const handleRecover = async (note: OrphanPaperNote) => {
    if (!projectRoot) return;
    setRecoveringKey(note.relativePath);
    try {
      let content = note.content;
      if (!content.trim()) {
        const map = await loadNotebookNoteContents(projectRoot, files, notebookDir);
        content = map.get(note.relativePath) ?? "";
      }
      if (!content.trim()) {
        toast.error("Could not read note content");
        return;
      }
      await recoverPaperFromNote(projectRoot, note.relativePath, content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRecoveringKey(null);
    }
  };

  return (
    <div className="mt-3 border-t border-border/60 pt-2 px-1">
      <p className="px-1 py-1 text-[length:var(--font-hint)] font-medium uppercase tracking-wide text-muted-foreground/55 flex items-center gap-1.5">
        <Link2OffIcon className="size-3" />
        {t("literature.notes.unlinked")}
      </p>
      {loading ? (
        <p className={cn(SETTINGS_ROW_DESC, "px-1 py-2 flex items-center gap-2")}>
          <Loader2Icon className="size-3 animate-spin" />
          Scanning notes…
        </p>
      ) : (
        <>
          <p className={cn(SETTINGS_ROW_DESC, "px-1 pb-2 mt-0 text-[length:var(--font-size-11)]")}>
            Literature reading notes (frontmatter with paper_id / bibkey) whose library entry is missing.
          </p>
          <ul className="space-y-1">
            {grouped.map((note) => {
              const noteCount = orphans.filter(
                (o) => (o.bibkey ?? o.relativePath) === (note.bibkey ?? note.relativePath),
              ).length;
              const busy = recoveringKey === note.relativePath;
              return (
                <li
                  key={note.relativePath}
                  className="rounded-sm border border-border/50 bg-muted/20 px-2 py-1.5 space-y-1"
                >
                  <p className="truncate text-[length:var(--font-size-12)] font-medium text-foreground/90">
                    {orphanLabel(note)}
                  </p>
                  <p className={cn(SETTINGS_ROW_DESC, "mt-0 truncate text-[length:var(--font-size-11)]")}>
                    {note.bibkey ? `@${note.bibkey}` : note.relativePath}
                    {noteCount > 1 ? ` · ${noteCount} notes` : ""}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      size="xs"
                      variant="secondary"
                      className="h-6 flex-1"
                      disabled={busy}
                      onClick={() => void handleRecover(note)}
                    >
                      {busy ? (
                        <Loader2Icon className="size-3 animate-spin mr-1" />
                      ) : (
                        <BookOpenIcon className="size-3 mr-1" />
                      )}
                      {t("literature.notes.restoreEntry")}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-6 shrink-0"
                      onClick={() => void openPaperNote(note.relativePath, note.name)}
                    >
                      {t("literature.notes.open")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
