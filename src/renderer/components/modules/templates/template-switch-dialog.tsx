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

function FileList({
  title,
  files,
  strike = false,
}: {
  title: string;
  files: string[];
  strike?: boolean;
}) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[length:var(--font-size-12)] text-muted-foreground">
        {title}{" "}
        <span className="tabular-nums text-foreground">({files.length})</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {files.map((f) => (
          <code
            key={f}
            className={`rounded bg-muted px-1.5 py-0.5 text-[length:var(--font-size-11)] ${
              strike ? "line-through text-muted-foreground" : ""
            }`}
          >
            {f}
          </code>
        ))}
      </div>
    </div>
  );
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>
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
                ? "border-destructive bg-muted text-destructive"
                : "border-border bg-muted text-foreground"
            }`}
          >
            {config.message}
          </div>

          <p className="text-[length:var(--font-size-12)] text-muted-foreground leading-relaxed">
            {t("templates.switch.backupNote")}
          </p>

          <FileList title={t("templates.switch.willTouch")} files={changedFiles} />
          <FileList title={t("templates.switch.willRemove")} files={deletedFiles} strike />

          {changedFiles.length === 0 && deletedFiles.length === 0 ? (
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">
              {t("templates.switch.noFileList")}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="xs"
            className="shadow-none"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          {dialogActions.includes("replace") && (
            <Button
              variant={isDestructive ? "default" : "outline"}
              size="xs"
              className={
                isDestructive
                  ? "shadow-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
              size="xs"
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
