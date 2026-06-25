import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SwitchDialogLevel } from "@/lib/templates/template-merge";

export interface TemplateSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: SwitchDialogLevel;
  oldName?: string;
  newName: string;
  oldCategory?: string;
  newCategory: string;
  changedFiles: string[];
  deletedFiles: string[];
  dialogActions: ("merge" | "replace")[];
  onConfirm: (action: "merge" | "replace") => void;
  submitting?: boolean;
}

const LEVEL_CONFIG: Record<
  SwitchDialogLevel,
  {
    title: string;
    message: string;
  }
> = {
  L1: {
    title: "Switch Template",
    message:
      "Same document family — matching sections and the abstract/front matter will be preserved where possible. Preamble and packages come from the new template.",
  },
  L2: {
    title: "Switch Template",
    message:
      "Related document types (paper ↔ thesis) — section merge will be attempted. Review the result after switching.",
  },
  L3: {
    title: "Switch Template",
    message:
      "These template types cannot be merged automatically. Your existing template files will be fully replaced. A backup will be saved.",
  },
  reset: {
    title: "Reset Template",
    message:
      "Reset to the template original? Your modifications will be lost. A backup will be saved.",
  },
  firstUse: {
    title: "Apply Template",
    message:
      "This project already contains files that overlap with the template. Applying will overwrite them. A backup will be saved.",
  },
};

export function TemplateSwitchDialog({
  open,
  onOpenChange,
  level,
  oldName,
  newName,
  oldCategory,
  newCategory,
  changedFiles,
  deletedFiles,
  dialogActions,
  onConfirm,
  submitting = false,
}: TemplateSwitchDialogProps) {
  const config = LEVEL_CONFIG[level];
  const isDestructive = level === "L3" || level === "reset" || level === "firstUse";
  const isWarning = level === "L2";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription className="text-[length:var(--font-size-13)]">
            {level === "firstUse"
              ? `Apply ${newName} (${newCategory})`
              : `${oldName} (${oldCategory}) → ${newName} (${newCategory})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            className={`rounded-md border px-3 py-2.5 text-[length:var(--font-size-12)] ${
              isDestructive
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : isWarning
                  ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                  : "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
            }`}
          >
            {config.message}
          </div>

          {(changedFiles.length > 0 || deletedFiles.length > 0) && (
            <div className="text-[length:var(--font-size-12)]">
              <span className="text-muted-foreground">Affected files: </span>
              {changedFiles.map((f) => (
                <code
                  key={f}
                  className="mr-1 rounded bg-accent px-1 py-0.5 text-[length:var(--font-size-11)]"
                >
                  {f}
                </code>
              ))}
              {deletedFiles.map((f) => (
                <code
                  key={f}
                  className="mr-1 rounded bg-destructive/10 px-1 py-0.5 text-[length:var(--font-size-11)] line-through"
                >
                  {f}
                </code>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="shadow-none"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {dialogActions.includes("replace") && (
            <Button
              variant={isDestructive ? "default" : "outline"}
              size="sm"
              className={
                isDestructive
                  ? "shadow-none bg-destructive hover:bg-destructive/90"
                  : "shadow-none"
              }
              disabled={submitting}
              onClick={() => onConfirm("replace")}
            >
              {level === "reset"
                ? "Backup & Reset"
                : level === "firstUse"
                  ? "Backup & Apply"
                  : "Backup & Replace"}
            </Button>
          )}
          {dialogActions.includes("merge") && (
            <Button
              size="sm"
              className="shadow-none"
              disabled={submitting}
              onClick={() => onConfirm("merge")}
            >
              {level === "L2" ? "Backup & Merge" : "Backup & Switch"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
