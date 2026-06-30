import { useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { zoteroLinkedPapersWithNotes } from "@/lib/literature/paper-notes";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import type { ZoteroCollection } from "@/types/electron.d";

interface ZoteroConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRoot: string;
  currentCollectionId?: string | null;
  onBound: (collectionId: string | null, collectionName: string | null) => void;
}

function indentLabel(collections: ZoteroCollection[], col: ZoteroCollection): string {
  let depth = 0;
  let parent = col.parentKey;
  const byKey = new Map(collections.map((c) => [c.key, c]));
  while (parent && depth < 8) {
    depth += 1;
    parent = byKey.get(parent)?.parentKey ?? null;
  }
  return `${"  ".repeat(depth)}${col.name}`;
}

export function ZoteroConnectDialog({
  open,
  onOpenChange,
  projectRoot,
  currentCollectionId,
  onBound,
}: ZoteroConnectDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(currentCollectionId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);

  const papers = useLiteratureStore((s) => s.papers);
  const setBoundCollection = useLiteratureStore((s) => s.setBoundCollection);
  const files = useDocumentStore((s) => s.files);
  const workspaceDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const notebookDir = resolveNotebookDir(workspaceDirs);

  const zoteroPapersWithNotes = useMemo(
    () => zoteroLinkedPapersWithNotes(papers, files, notebookDir),
    [papers, files, notebookDir],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedKey(currentCollectionId ?? null);
    setLoading(true);
    setError(null);
    void window.electronAPI.zoteroProbe().then((status) => {
      if (status.mode === "offline") {
        setError(status.error ?? "Zotero is not reachable.");
        setCollections([]);
        setLoading(false);
        return;
      }
      return window.electronAPI.zoteroListCollections()
        .then((rows) => setCollections(rows))
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load collections");
          setCollections([]);
        })
        .finally(() => setLoading(false));
    });
  }, [open, currentCollectionId]);

  const sorted = useMemo(
    () => [...collections].sort((a, b) => indentLabel(collections, a).localeCompare(indentLabel(collections, b))),
    [collections],
  );

  const handleSave = async () => {
    if (!selectedKey) return;
    const col = collections.find((c) => c.key === selectedKey);
    if (!col) return;
    setSaving(true);
    try {
      await window.electronAPI.zoteroSetProjectBinding(projectRoot, selectedKey, col.name);
      onBound(selectedKey, col.name);
      toast.success(`Bound to Zotero collection “${col.name}”`);
      onOpenChange(false);
      await useLiteratureStore.getState().pullFromZotero(projectRoot);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to bind collection");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await setBoundCollection(projectRoot, null, null);
      onOpenChange(false);
      setDisconnectConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect Zotero");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {currentCollectionId ? "Zotero collection" : "Connect Zotero"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {currentCollectionId
            ? "Change the Zotero collection linked to this project, or disconnect."
            : "Optionally link a Zotero collection to sync references into this project."}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin mr-2" />
            Loading collections…
          </div>
        ) : error ? (
          <p className="text-[length:var(--font-size-12)] text-destructive py-4">{error}</p>
        ) : sorted.length === 0 ? (
          <p className="text-[length:var(--font-size-12)] text-muted-foreground py-4">
            No collections found in Zotero.
          </p>
        ) : (
          <div className="max-h-[min(20rem,50vh)] overflow-auto border border-border rounded-md divide-y divide-border/60">
            {sorted.map((col) => (
              <button
                key={col.key}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-2 text-[length:var(--font-size-13)] hover:bg-accent/50 transition-colors",
                  selectedKey === col.key && "bg-accent text-foreground",
                )}
                onClick={() => setSelectedKey(col.key)}
              >
                {indentLabel(collections, col)}
              </button>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {currentCollectionId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDisconnectConfirmOpen(true)}
              disabled={saving}
            >
              Disconnect Zotero
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={!selectedKey || saving || loading}>
            {saving ? "Saving…" : currentCollectionId ? "Change collection" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={disconnectConfirmOpen} onOpenChange={setDisconnectConfirmOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect Zotero?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-[length:var(--font-size-13)] text-muted-foreground">
          <p>
            Zotero-synced entries that were not <span className="text-foreground/90">imported to local</span>{" "}
            will be removed from this project&apos;s literature library. Local entries and imported papers are kept.
          </p>
          {zoteroPapersWithNotes.length > 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[length:var(--font-size-12)] text-amber-900 dark:text-amber-200">
              <p className="font-medium text-amber-950 dark:text-amber-100">
                {zoteroPapersWithNotes.length} entr
                {zoteroPapersWithNotes.length === 1 ? "y has" : "ies have"} reading notes
              </p>
              <p className="mt-1">
                Note files stay on disk, but literature links and <span className="font-mono">@paper</span> context
                for these entries will break until you re-sync or re-import them.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-0.5">
                {zoteroPapersWithNotes.slice(0, 4).map(({ paper, noteCount }) => (
                  <li key={paper.id} className="truncate">
                    {paper.bibkey ?? paper.title} ({noteCount} note{noteCount === 1 ? "" : "s"})
                  </li>
                ))}
                {zoteroPapersWithNotes.length > 4 ? (
                  <li>…and {zoteroPapersWithNotes.length - 4} more</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => setDisconnectConfirmOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => void handleDisconnect()}
            disabled={saving}
          >
            {saving ? "Disconnecting…" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}
