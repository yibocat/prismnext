import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  FolderIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { zoteroLinkedPapersWithNotes } from "@/lib/literature/paper-notes";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import type { ZoteroCollection, ZoteroStatus } from "@/types/electron.d";

type ZoteroDialogStep = "select" | "disconnect";

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

function connectionSummary(status: ZoteroStatus): { ok: boolean; label: string } {
  if (status.mode === "offline") {
    return { ok: false, label: status.error ?? "Zotero is not reachable" };
  }
  if (status.mode === "local") {
    const parts = ["Zotero desktop"];
    if (status.bbtInstalled) parts.push("Better BibTeX");
    if (status.webReachable) parts.push("Web API");
    return { ok: true, label: parts.join(" · ") };
  }
  return { ok: true, label: "Zotero web API" };
}

export function ZoteroConnectDialog({
  open,
  onOpenChange,
  projectRoot,
  currentCollectionId,
  onBound,
}: ZoteroConnectDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(currentCollectionId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [zoteroStatus, setZoteroStatus] = useState<ZoteroStatus | null>(null);
  const [step, setStep] = useState<ZoteroDialogStep>("select");

  const papers = useLiteratureStore((s) => s.papers);
  const boundCollectionName = useLiteratureStore((s) => s.boundCollectionName);
  const setBoundCollection = useLiteratureStore((s) => s.setBoundCollection);
  const files = useDocumentStore((s) => s.files);
  const workspaceDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const notebookDir = resolveNotebookDir(workspaceDirs);

  const zoteroPapersWithNotes = useMemo(
    () => zoteroLinkedPapersWithNotes(papers, files, notebookDir),
    [papers, files, notebookDir],
  );

  useEffect(() => {
    if (!open) {
      setStep("select");
      return;
    }
    setSelectedKey(currentCollectionId ?? null);
    setStep("select");
    setLoading(true);
    setError(null);
    setZoteroStatus(null);
    void window.electronAPI.zoteroProbe().then((status) => {
      setZoteroStatus(status);
      if (status.mode === "offline") {
        setError(status.error ?? "Zotero is not reachable.");
        setCollections([]);
        setLoading(false);
        return;
      }
      return window.electronAPI
        .zoteroListCollections()
        .then((rows) => setCollections(rows))
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load collections");
          setCollections([]);
        })
        .finally(() => setLoading(false));
    });
  }, [open, currentCollectionId]);

  const sorted = useMemo(
    () =>
      [...collections].sort((a, b) =>
        indentLabel(collections, a).localeCompare(indentLabel(collections, b)),
      ),
    [collections],
  );

  const connection = zoteroStatus ? connectionSummary(zoteroStatus) : null;

  const handleOpenChange = (next: boolean) => {
    if (!next) setStep("select");
    onOpenChange(next);
  };

  const handleSave = async () => {
    if (!selectedKey) return;
    const col = collections.find((c) => c.key === selectedKey);
    if (!col) return;
    setSaving(true);
    try {
      await window.electronAPI.zoteroSetProjectBinding(projectRoot, selectedKey, col.name);
      onBound(selectedKey, col.name);
      toast.success(`Bound to Zotero collection “${col.name}”`);
      handleOpenChange(false);
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
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect Zotero");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        {step === "select" ? (
          <>
            <div className="space-y-4 px-6 pt-6 pb-4">
              <DialogHeader className="gap-1.5">
                <DialogTitle className="text-[length:var(--font-dialog-title)] font-semibold">
                  {currentCollectionId
                    ? t("literature.dialogs.zoteroSync")
                    : t("literature.dialogs.connectZotero")}
                </DialogTitle>
                <DialogDescription className="text-[length:var(--font-dialog-label)]">
                  {currentCollectionId
                    ? t("literature.dialogs.zoteroSyncDesc")
                    : t("literature.dialogs.connectZoteroDesc")}
                </DialogDescription>
              </DialogHeader>

              {loading ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/20 py-10 text-[length:var(--font-size-12)] text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin shrink-0" />
                  {t("literature.dialogs.loadingCollections")}
                </div>
              ) : (
                <div className="space-y-3">
                  {connection ? (
                    <div
                      className={cn(
                        "flex items-start gap-2 rounded-md px-3 py-2.5 text-[length:var(--font-dialog-label)]",
                        connection.ok
                          ? "border border-emerald-500/25 bg-emerald-500/8 text-emerald-900 dark:text-emerald-200"
                          : "border border-destructive/30 bg-destructive/10 text-destructive",
                      )}
                    >
                      {connection.ok ? (
                        <CheckCircle2Icon className="size-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircleIcon className="size-3.5 shrink-0 mt-0.5" />
                      )}
                      <span className="min-w-0 leading-snug">{connection.label}</span>
                    </div>
                  ) : null}

                  {currentCollectionId && boundCollectionName ? (
                    <div className="flex items-center gap-2 rounded-md bg-muted/45 px-3 py-2 text-[length:var(--font-size-12)] text-muted-foreground">
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                      <span className="min-w-0 truncate">
                        {t("literature.dialogs.linkedCollection", { name: boundCollectionName })}
                      </span>
                    </div>
                  ) : null}

                  {error ? (
                    <p className="text-[length:var(--font-size-12)] text-destructive px-0.5">{error}</p>
                  ) : sorted.length === 0 ? (
                    <p className="text-[length:var(--font-size-12)] text-muted-foreground px-0.5 py-2">
                      No collections found in Zotero.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-[length:var(--font-dialog-label)] font-medium text-muted-foreground">
                        {t("literature.dialogs.collection")}
                      </Label>
                      <div className="max-h-[min(18rem,45vh)] overflow-auto rounded-lg border border-border/60 bg-muted/15">
                        {sorted.map((col) => {
                          const selected = selectedKey === col.key;
                          return (
                            <button
                              key={col.key}
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-2.5 border-b border-border/40 px-3 py-2 text-left text-[length:var(--font-size-13)] transition-colors last:border-b-0",
                                "hover:bg-accent/45",
                                selected && "bg-accent/60",
                              )}
                              onClick={() => setSelectedKey(col.key)}
                            >
                              <span
                                className={cn(
                                  "size-3.5 shrink-0 rounded-full border-2 transition-colors",
                                  selected
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground/35 bg-background",
                                )}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate text-foreground/90">
                                {indentLabel(collections, col)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 border-t border-border/60 bg-muted/15 px-6 py-4 sm:justify-between">
              <div className="flex sm:mr-auto">
                {currentCollectionId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shadow-none text-muted-foreground hover:text-destructive"
                    onClick={() => setStep("disconnect")}
                    disabled={saving || loading}
                  >
                    {t("literature.dialogs.disconnect")}
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  className="shadow-none"
                  onClick={() => handleOpenChange(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  className="shadow-none"
                  onClick={() => void handleSave()}
                  disabled={!selectedKey || saving || loading || Boolean(error)}
                >
                  {saving
                    ? t("common.saving")
                    : currentCollectionId
                      ? t("literature.dialogs.changeCollection")
                      : t("literature.dialogs.connect")}
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4 px-6 pt-6 pb-4">
              <DialogHeader className="gap-1.5">
                <DialogTitle className="text-[length:var(--font-dialog-title)] font-semibold">
                  {t("literature.dialogs.disconnectTitle")}
                </DialogTitle>
                <DialogDescription className="text-[length:var(--font-dialog-label)]">
                  {t("literature.dialogs.disconnectBody")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-[length:var(--font-size-12)] text-muted-foreground">
                <p>{t("literature.dialogs.mirrorKeep")}</p>
                {zoteroPapersWithNotes.length > 0 ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-amber-950 dark:text-amber-100">
                    <p className="font-medium">
                      {t("literature.dialogs.disconnectNotes", {
                        count: zoteroPapersWithNotes.length,
                      })}
                    </p>
                    <ul className="mt-2 list-inside list-disc space-y-0.5 text-amber-900/85 dark:text-amber-200/85">
                      {zoteroPapersWithNotes.slice(0, 4).map(({ paper, noteCount }) => (
                        <li key={paper.id} className="truncate">
                          {paper.bibkey ?? paper.title} ({noteCount})
                        </li>
                      ))}
                      {zoteroPapersWithNotes.length > 4 ? (
                        <li>…+{zoteroPapersWithNotes.length - 4}</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="gap-2 border-t border-border/60 bg-muted/15 px-6 py-4 sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="shadow-none text-muted-foreground"
                onClick={() => setStep("select")}
                disabled={saving}
              >
                <ArrowLeftIcon className="size-3.5 mr-1.5" />
                {t("common.back")}
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  className="shadow-none"
                  onClick={() => setStep("select")}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="shadow-none"
                  onClick={() => void handleDisconnect()}
                  disabled={saving}
                >
                  {saving
                    ? t("literature.dialogs.disconnecting")
                    : t("literature.dialogs.disconnect")}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
