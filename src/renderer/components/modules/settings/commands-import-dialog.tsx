import { useState } from "react";
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
  const importPack = useCommandStore((s) => s.importPack);
  const [strategy, setStrategy] = useState<CommandImportConflictStrategy>("skip");
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await importPack(projectRoot, pack, strategy);
      const parts = [`${result.imported} imported`];
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      if (result.renamed.length > 0) {
        parts.push(`${result.renamed.length} renamed`);
      }
      toast.success(`Commands: ${parts.join(", ")}.`);
      onOpenChange(false);
      onComplete();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle>Import commands</DialogTitle>
          <DialogDescription>
            {incomingCount} command(s) in file.
            {invalidCount > 0
              ? ` ${invalidCount} invalid name(s) will be skipped.`
              : null}
            {conflictCount > 0
              ? ` ${conflictCount} name conflict(s) with existing commands.`
              : null}
          </DialogDescription>
        </DialogHeader>

        {conflictCount > 0 ? (
          <div className="space-y-2 text-[length:var(--font-size-12)]">
            <p className="text-muted-foreground">When names collide:</p>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="import-strategy"
                  checked={strategy === "skip"}
                  onChange={() => setStrategy("skip")}
                />
                Skip conflicting commands
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="import-strategy"
                  checked={strategy === "replace"}
                  onChange={() => setStrategy("replace")}
                />
                Replace existing commands
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="import-strategy"
                  checked={strategy === "rename"}
                  onChange={() => setStrategy("rename")}
                />
                Import as renamed copies (e.g. name-2)
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
            Cancel
          </Button>
          <Button
            size="sm"
            className="shadow-none"
            disabled={importing || incomingCount === 0}
            onClick={() => void handleImport()}
          >
            {importing ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
