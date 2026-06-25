import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { HistoryIcon, RotateCcwIcon, FileTextIcon, CalendarIcon, Trash2Icon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { DEFAULT_MANUSCRIPT_DIR } from "@/types/workspace";
import { clearPdfCache } from "@/stores/compile-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BackupEntry {
  label: string;
  timestamp: string;
  files: string[];
}

function formatLabel(label: string): { date: string; from: string; to: string } {
  const firstUnderscore = label.indexOf("_");
  const datePart = firstUnderscore > 0 ? label.slice(0, firstUnderscore) : label;
  const rest = firstUnderscore > 0 ? label.slice(firstUnderscore + 1) : "";
  const readable = datePart.replace("T", " ").replace(/Z$/, "");

  if (rest.startsWith("first_use_")) {
    return {
      date: readable,
      from: "existing files",
      to: rest.slice("first_use_".length),
    };
  }

  const toIdx = rest.lastIndexOf("_to_");
  const from = toIdx > 0 ? rest.slice(0, toIdx) : rest;
  const to = toIdx > 0 ? rest.slice(toIdx + 4) : "";
  return { date: readable, from: from || "unknown", to: to || "unknown" };
}

/** Manuscript template backups — embeddable panel (no page chrome). */
export function BackupsSettingsPanel({
  compact,
  embedded,
  onRestored,
}: {
  compact?: boolean;
  embedded?: boolean;
  onRestored?: () => void;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);
  const manuscriptDir = manuscriptConfig?.dir ?? DEFAULT_MANUSCRIPT_DIR;
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    if (!projectRoot) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.templateListBackups({ rootPath: projectRoot });
      setBackups(result);
    } catch {
      setBackups([]);
    }
    setLoading(false);
  }, [projectRoot]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleRestore = async (label: string) => {
    if (!projectRoot) return;
    setRestoreError(null);
    setRestoring(label);
    try {
      await window.electronAPI.templateRestoreBackup({
        rootPath: projectRoot,
        manuscriptDir,
        backupLabel: label,
      });
      clearPdfCache();
      useDocumentStore.getState().refreshFiles();
      onRestored?.();
      setConfirmRestore(null);
      toast.success("Backup restored — files recovered");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      setRestoreError(msg);
      toast.error(`Restore failed: ${msg}`);
    }
    setRestoring(null);
  };

  const handleDelete = async (label: string) => {
    if (!projectRoot) return;
    setDeleteError(null);
    setDeleting(label);
    try {
      await window.electronAPI.templateDeleteBackup({
        rootPath: projectRoot,
        backupLabel: label,
      });
      setConfirmDelete(null);
      if (expanded === label) setExpanded(null);
      toast.success("Backup deleted");
      await loadBackups();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      setDeleteError(msg);
      toast.error(`Delete failed: ${msg}`);
    }
    setDeleting(null);
  };

  if (!projectRoot) {
    return (
      <p className="text-[length:var(--font-size-12)] text-muted-foreground py-4">
        Open a project to manage manuscript backups.
      </p>
    );
  }

  return (
    <div className={compact && !embedded ? "space-y-2" : embedded ? "" : "flex flex-col h-full"}>
      {!compact && (
        <div className="flex items-center justify-end mb-2">
          <Button variant="outline" size="sm" className="shadow-none h-7" onClick={loadBackups} disabled={loading}>
            Refresh
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-[length:var(--font-size-12)] text-muted-foreground py-4">Loading backups…</p>
      ) : backups.length === 0 ? (
        <div className={cn(
          "flex flex-col items-center gap-2 text-center text-muted-foreground",
          embedded ? "py-6" : "py-8",
        )}>
          <HistoryIcon className="size-8 opacity-25" />
          <p className="text-[length:var(--font-size-12)]">No backups yet</p>
          <p className="text-[length:var(--font-size-11)] max-w-sm">
            Backups are created automatically when you switch templates.
          </p>
        </div>
      ) : (
        <div className={embedded ? "space-y-0 divide-y divide-border" : "space-y-2"}>
          {compact && !embedded && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-[length:var(--font-size-11)]" onClick={loadBackups} disabled={loading}>
                Refresh
              </Button>
            </div>
          )}
          {backups.map((b) => {
            const { date, from, to } = formatLabel(b.label);
            const isExpanded = expanded === b.label;
            const isRestoring = restoring === b.label;
            const isDeleting = deleting === b.label;
            const actionDisabled = !!restoring || !!deleting;

            return (
              <div
                key={b.label}
                className={embedded ? undefined : "rounded-lg border bg-card"}
              >
                <div className={cn("flex items-center gap-3", embedded ? "py-2.5" : "px-3 py-2.5")}>
                  <HistoryIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[length:var(--font-size-12)] font-medium truncate">
                      {from} → {to}
                    </div>
                    <div className="flex items-center gap-1.5 text-[length:var(--font-size-11)] text-muted-foreground mt-0.5">
                      <CalendarIcon className="size-3" />
                      {date}
                      <Badge variant="secondary" className="text-[length:var(--font-size-10)] px-1 py-0 h-4">
                        {b.files.length} file{b.files.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[length:var(--font-size-11)] shadow-none"
                    onClick={() => setExpanded(isExpanded ? null : b.label)}
                  >
                    <FileTextIcon className="size-3 mr-1" />
                    {isExpanded ? "Hide" : "Files"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[length:var(--font-size-11)] shadow-none"
                    disabled={actionDisabled}
                    onClick={() => setConfirmRestore(b.label)}
                  >
                    <RotateCcwIcon className="size-3 mr-1" />
                    {isRestoring ? "Restoring…" : "Restore"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[length:var(--font-size-11)] shadow-none text-muted-foreground hover:text-destructive"
                    disabled={actionDisabled}
                    onClick={() => setConfirmDelete(b.label)}
                  >
                    <Trash2Icon className="size-3" />
                    {isDeleting ? "…" : null}
                  </Button>
                </div>
                {isExpanded && (
                  <div className="border-t px-3 py-2 space-y-0.5">
                    {b.files.map((f) => (
                      <div key={f} className="flex items-center gap-1.5 text-[length:var(--font-size-11)] text-muted-foreground">
                        <FileTextIcon className="size-3 opacity-50" />
                        <code>{f}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!confirmRestore} onOpenChange={(o) => { if (!o) { setConfirmRestore(null); setRestoreError(null); } }}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Restore Backup</DialogTitle>
            <DialogDescription>
              This will overwrite current manuscript files with the backup. A new backup of your current files will NOT be created automatically.
            </DialogDescription>
          </DialogHeader>
          {restoreError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[length:var(--font-size-12)] text-destructive">
              {restoreError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setConfirmRestore(null)}>
              Cancel
            </Button>
            <Button size="sm" className="shadow-none" onClick={() => confirmRestore && handleRestore(confirmRestore)}>
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) { setConfirmDelete(null); setDeleteError(null); } }}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Backup</DialogTitle>
            <DialogDescription>
              Permanently remove this snapshot from{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 rounded">.prismnext/backups/</code>.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[length:var(--font-size-12)] text-destructive">
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="shadow-none"
              disabled={!!deleting}
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
