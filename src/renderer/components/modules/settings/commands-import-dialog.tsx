import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import type { CommandImportConflictStrategy } from "@commands/export-import";
import { useCommandStore } from "@/stores/command-store";

interface CommandsImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRoot: string;
  conflictCount: number;
  invalidCount: number;
  incomingCount: number;
  pack: unknown;
  onComplete: () => void;
}

export function CommandsImportDialog({
  open,
  onOpenChange,
  projectRoot,
  conflictCount,
  invalidCount,
  incomingCount,
  pack,
  onComplete,
}: CommandsImportDialogProps) {
  const { t } = useTranslation();
  const importPack = useCommandStore((s) => s.importPack);
  const [strategy, setStrategy] = useState<CommandImportConflictStrategy>("skip");
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await importPack(projectRoot, pack, strategy);
      const parts = [t("settings.commandsPage.import.imported", { count: result.imported })];
      if (result.skipped > 0) {
        parts.push(t("settings.commandsPage.import.skipped", { count: result.skipped }));
      }
      if (result.renamed.length > 0) {
        parts.push(t("settings.commandsPage.import.renamed", { count: result.renamed.length }));
      }
      toast.success(t("settings.commandsPage.import.toastSummary", { parts: parts.join(", ") }));
      onOpenChange(false);
      onComplete();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.commandsPage.import.failed"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.commandsPage.import.title")}</DialogTitle>
          <DialogDescription>
            {t("settings.commandsPage.import.countInFile", { count: incomingCount })}
            {invalidCount > 0
              ? ` ${t("settings.commandsPage.import.invalidSkipped", { count: invalidCount })}`
              : null}
            {conflictCount > 0
              ? ` ${t("settings.commandsPage.import.conflicts", { count: conflictCount })}`
              : null}
          </DialogDescription>
        </DialogHeader>

        {conflictCount > 0 ? (
          <div className="space-y-2 text-[length:var(--font-size-12)]">
            <p className="text-muted-foreground">{t("settings.commandsPage.import.whenCollide")}</p>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="import-strategy"
                  checked={strategy === "skip"}
                  onChange={() => setStrategy("skip")}
                />
                {t("settings.commandsPage.import.skip")}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="import-strategy"
                  checked={strategy === "replace"}
                  onChange={() => setStrategy("replace")}
                />
                {t("settings.commandsPage.import.replace")}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="import-strategy"
                  checked={strategy === "rename"}
                  onChange={() => setStrategy("rename")}
                />
                {t("settings.commandsPage.import.rename")}
              </label>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="shadow-none"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="shadow-none"
            onClick={() => void handleImport()}
            disabled={importing}
          >
            {importing ? t("settings.commandsPage.import.importing") : t("settings.commandsPage.import.import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
