import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

function getLevelConfig(t: TFunction): Record<
  SwitchDialogLevel,
  {
    title: string;
    message: string;
  }
> {
  return {
    L1: {
      title: t("templates.switch.switchTitle"),
      message: t("templates.switch.l1"),
    },
    L2: {
      title: t("templates.switch.switchTitle"),
      message: t("templates.switch.l2"),
    },
    L3: {
      title: t("templates.switch.switchTitle"),
      message: t("templates.switch.l3"),
    },
    reset: {
      title: t("templates.switch.resetTitle"),
      message: t("templates.switch.reset"),
    },
    firstUse: {
      title: t("templates.switch.applyTitle"),
      message: t("templates.switch.firstUse"),
    },
  };
}

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
  const { t } = useTranslation();
  const config = getLevelConfig(t)[level];
  const isDestructive = level === "L3" || level === "reset" || level === "firstUse";
  const isWarning = level === "L2";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription className="text-[length:var(--font-size-13)]">
            {level === "firstUse"
              ? t("templates.switch.applyNamed", { name: newName, category: newCategory })
              : t("templates.switch.arrow", {
                  oldName,
                  oldCategory,
                  newName,
                  newCategory,
                })}
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
              <span className="text-muted-foreground">{t("templates.switch.affected")} </span>
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
            {t("common.cancel")}
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
              {t("templates.switch.backupReplace")}
            </Button>
          )}
          {dialogActions.includes("merge") && (
            <Button
              size="sm"
              className="shadow-none"
              disabled={submitting}
              onClick={() => onConfirm("merge")}
            >
              {t("templates.switch.backupMerge")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
