import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDownIcon, FileTextIcon, BookMarkedIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureExtractStore } from "@/stores/literature-extract-store";
import { useSettingsStore } from "@/stores/settings-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PaperExtractSource } from "@/types/electron.d";
import { EXTRACT_BATCH_MAX_PAPERS } from "../../../shared/literature/paper-extract";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

const batchToolbarBtnClass = (compact: boolean) =>
  cn("h-6 shrink-0", compact ? "size-6 px-0 justify-center" : "px-1.5");

export function useLiteratureBatchSelectionActions() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const checkedPaperIds = useLiteratureStore((s) => s.checkedPaperIds);
  const clearCheckedPapers = useLiteratureStore((s) => s.clearCheckedPapers);
  const deletePapers = useLiteratureStore((s) => s.deletePapers);
  const exportPapersBibTeX = useLiteratureStore((s) => s.exportPapersBibTeX);
  const syncLibraryPapersToManuscriptBib = useLiteratureStore((s) => s.syncLibraryPapersToManuscriptBib);
  const papers = useLiteratureStore((s) => s.papers);
  const enqueueBatch = useLiteratureExtractStore((s) => s.enqueueBatch);
  const settings = useSettingsStore((s) => s.settings);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleBatchDelete = async () => {
    if (!projectRoot || checkedPaperIds.length === 0) return;
    setDeleting(true);
    try {
      await deletePapers(projectRoot, checkedPaperIds);
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleBatchExport = async () => {
    if (!projectRoot || checkedPaperIds.length === 0) return;
    try {
      await exportPapersBibTeX(projectRoot, checkedPaperIds);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleBatchAddToManuscriptBib = async () => {
    if (!projectRoot || checkedPaperIds.length === 0) return;
    const bibkeys = checkedPaperIds
      .map((id) => papers.find((p) => p.id === id)?.bibkey?.trim())
      .filter((k): k is string => Boolean(k));
    if (bibkeys.length === 0) {
      toast.error("Selected entries have no cite keys");
      return;
    }
    try {
      await syncLibraryPapersToManuscriptBib(projectRoot, bibkeys);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync to manuscript .bib failed");
    }
  };

  const handleBatchExtract = async () => {
    if (!projectRoot || checkedPaperIds.length === 0) return;
    const source =
      (settings.literatureExtractEngineDefault as PaperExtractSource | undefined) ?? "pdfjs";
    try {
      const result = await enqueueBatch(projectRoot, checkedPaperIds, source);
      const parts = [`Queued ${result.enqueued} paper${result.enqueued === 1 ? "" : "s"}`];
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      if (result.capped) parts.push(`capped at ${EXTRACT_BATCH_MAX_PAPERS}`);
      toast.message(parts.join(" · "));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Batch extract failed");
    }
  };

  return {
    checkedPaperIds,
    clearCheckedPapers,
    deleteOpen,
    setDeleteOpen,
    deleting,
    handleBatchDelete,
    handleBatchExport,
    handleBatchAddToManuscriptBib,
    handleBatchExtract,
  };
}

export function LiteratureBatchSelectionActions({
  actions,
  compact = false,
}: {
  actions: ReturnType<typeof useLiteratureBatchSelectionActions>;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const {
    checkedPaperIds,
    deleteOpen,
    setDeleteOpen,
    deleting,
    handleBatchDelete,
    handleBatchExport,
    handleBatchAddToManuscriptBib,
    handleBatchExtract,
  } = actions;

  if (checkedPaperIds.length === 0) return null;

  const selectedLabel = t("literature.batch.selected", { count: checkedPaperIds.length });

  return (
    <>
      <span
        className={cn(
          "inline-flex h-6 shrink-0 items-center rounded-md bg-primary/10 text-[length:var(--font-menu-item)] text-primary tabular-nums",
          compact ? "min-w-6 justify-center px-1.5" : "px-2",
        )}
        title={selectedLabel}
      >
        {compact ? checkedPaperIds.length : selectedLabel}
      </span>
      <Hint label={t("literature.batch.extract")}>
        <Button
          size="xs"
          variant="ghost"
          className={batchToolbarBtnClass(compact)}
          onClick={() => void handleBatchExtract()}
        >
          <FileTextIcon className={cn("size-3.5 shrink-0", !compact && "mr-1")} />
          {!compact ? <span>{t("literature.batch.extract")}</span> : null}
        </Button>
      </Hint>
      <Hint label={t("literature.batch.toBib")}>
        <Button
          size="xs"
          variant="ghost"
          className={batchToolbarBtnClass(compact)}
          onClick={() => void handleBatchAddToManuscriptBib()}
        >
          <BookMarkedIcon className={cn("size-3.5 shrink-0", !compact && "mr-1")} />
          {!compact ? <span>{t("literature.batch.toBib")}</span> : null}
        </Button>
      </Hint>
      <Hint label={t("literature.batch.exportBib")}>
        <Button
          size="xs"
          variant="ghost"
          className={batchToolbarBtnClass(compact)}
          onClick={() => void handleBatchExport()}
        >
          <FileDownIcon className={cn("size-3.5 shrink-0", !compact && "mr-1")} />
          {!compact ? <span>{t("literature.batch.exportBib")}</span> : null}
        </Button>
      </Hint>
      <Hint label={t("common.delete")}>
        <Button
          size="xs"
          variant="ghost"
          className={cn(
            batchToolbarBtnClass(compact),
            "text-muted-foreground hover:text-destructive",
          )}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon className={cn("size-3.5 shrink-0", !compact && "mr-1")} />
          {!compact ? <span>{t("common.delete")}</span> : null}
        </Button>
      </Hint>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("literature.dialogs.deleteEntries", { count: checkedPaperIds.length })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            {t("literature.dialogs.deleteEntriesBody")}
          </p>
          <DialogFooter>
            <Button variant="outline" size="xs" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="xs"
              onClick={() => void handleBatchDelete()}
              disabled={deleting}
            >
              {deleting ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
