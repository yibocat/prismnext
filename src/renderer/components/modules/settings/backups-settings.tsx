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
import { HistoryIcon, RotateCcwIcon, FileTextIcon, CalendarIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { clearPdfCache } from "@/stores/compile-store";
import { toast } from "sonner";

interface BackupEntry {
  label: string;
  timestamp: string;
  files: string[];
}

function formatLabel(label: string): { date: string; from: string; to: string } {
  // label format: "2026-06-10T15-30-00-000Z_academic-paper_to_ieee-paper"
  const firstUnderscore = label.indexOf("_");
  const datePart = firstUnderscore > 0 ? label.slice(0, firstUnderscore) : label;
  const rest = firstUnderscore > 0 ? label.slice(firstUnderscore + 1) : "";
  const toIdx = rest.lastIndexOf("_to_");
  const from = toIdx > 0 ? rest.slice(0, toIdx) : rest;
  const to = toIdx > 0 ? rest.slice(toIdx + 4) : "";

  // Display raw timestamp in readable form — parsing with new Date()
  // fails because colons are replaced with dashes in the backup label
  const readable = datePart.replace("T", " ").replace(/Z$/, "");

  return {
    date: readable,
    from: from || "unknown",
    to: to || "unknown",
  };
}

export function BackupsSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const manuscriptDir = useDocumentStore((s) => s.manuscriptDir);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

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
    loadBackups();
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
      setConfirmRestore(null);
      toast.success("Backup restored — files recovered");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      setRestoreError(msg);
      toast.error(`Restore failed: ${msg}`);
    }
    setRestoring(null);
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <HistoryIcon className="size-8 opacity-30" />
        <p className="text-[length:var(--font-size-13)]">Open a project to manage backups</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[length:var(--font-size-15)] font-semibold">Backups</h2>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mt-0.5">
            Template backups are stored in <code className="text-[length:var(--font-size-11)] bg-accent px-1 rounded">.prismnext/backups/</code>
          </p>
        </div>
        <Button variant="outline" size="sm" className="shadow-none" onClick={loadBackups} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-[length:var(--font-size-13)]">Loading backups…</p>
        </div>
      ) : backups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <HistoryIcon className="size-10 opacity-20" />
          <p className="text-[length:var(--font-size-13)]">No backups yet</p>
          <p className="text-[length:var(--font-size-12)]">Backups are created automatically when you switch templates.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {backups.map((b) => {
            const { date, from, to } = formatLabel(b.label);
            const isExpanded = expanded === b.label;
            const isRestoring = restoring === b.label;

            return (
              <div
                key={b.label}
                className="rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <HistoryIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[length:var(--font-size-13)] font-medium truncate">
                        {from} → {to}
                      </span>
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
                    disabled={isRestoring}
                    onClick={() => setConfirmRestore(b.label)}
                  >
                    <RotateCcwIcon className="size-3 mr-1" />
                    {isRestoring ? "Restoring…" : "Restore"}
                  </Button>
                </div>

                {isExpanded && (
                  <div className="border-t px-3 py-2 space-y-0.5">
                    {b.files.map((f) => (
                      <div key={f} className="flex items-center gap-1.5 text-[length:var(--font-size-11)] text-muted-foreground">
                        <FileTextIcon className="size-3 opacity-50" />
                        <code className="text-[length:var(--font-size-11)]">{f}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Restore confirmation dialog */}
      <Dialog open={!!confirmRestore} onOpenChange={(o) => { if (!o) { setConfirmRestore(null); setRestoreError(null); } }}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Restore Backup</DialogTitle>
            <DialogDescription>
              This will overwrite current files with the backup contents. A new backup of your current files will NOT be created automatically.
            </DialogDescription>
          </DialogHeader>

          {restoreError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[length:var(--font-size-12)] text-destructive mb-3">
              {restoreError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setConfirmRestore(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="shadow-none"
              onClick={() => confirmRestore && handleRestore(confirmRestore)}
            >
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
