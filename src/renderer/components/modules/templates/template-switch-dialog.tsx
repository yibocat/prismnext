import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CompatibilityLevel } from "@/lib/templates/template-merge";

export interface TemplateSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: CompatibilityLevel | "reset" | "firstUse";
  oldName?: string;
  newName: string;
  oldCategory?: string;
  newCategory: string;
  changedFiles: string[];
  deletedFiles: string[];
  onConfirm: (action: "merge" | "replace") => void;
  submitting?: boolean;
}

const LEVEL_CONFIG: Record<
  CompatibilityLevel | "reset" | "firstUse",
  {
    title: string;
    icon: string;
    message: string;
    actions: ("merge" | "replace")[];
  }
> = {
  L1: {
    title: "Switch Template",
    icon: "✅",
    message:
      "Same category — your content will be preserved and merged into the new template structure.",
    actions: ["merge"],
  },
  L2: {
    title: "⚠️ Switch Template",
    icon: "⚠️",
    message:
      "Different document type — section structure may not fully transfer. We'll attempt to merge your content automatically. Review the result after switching.",
    actions: ["merge", "replace"],
  },
  L3: {
    title: "🚫 Switch Template",
    icon: "🚫",
    message:
      "Incompatible formats — content cannot be transferred automatically. Your existing files will be fully replaced. A backup will be saved.",
    actions: ["replace"],
  },
  reset: {
    title: "Reset Template",
    icon: "🔄",
    message:
      "Reset to template original? Your modifications will be lost. A backup will be saved.",
    actions: ["replace"],
  },
  firstUse: {
    title: "⚠️ Apply Template",
    icon: "⚠️",
    message:
      "This project already contains files. Applying a template will overwrite your existing content. A backup will be saved so you can restore if needed.",
    actions: ["replace"],
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
  onConfirm,
  submitting = false,
}: TemplateSwitchDialogProps) {
  const config = LEVEL_CONFIG[level];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {config.icon} {config.title}
          </DialogTitle>
          <DialogDescription className="text-[length:var(--font-size-13)]">
            {level === "firstUse"
              ? `Apply ${newName} (${newCategory}) template`
              : `${oldName} (${oldCategory}) → ${newName} (${newCategory})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Level-specific message */}
          <div
            className={`rounded-md border px-3 py-2.5 text-[length:var(--font-size-12)] ${
              level === "L3" || level === "reset" || level === "firstUse"
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : level === "L2"
                  ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                  : "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
            }`}
          >
            {config.message}
          </div>

          {/* What will happen */}
          <div className="text-[length:var(--font-size-12)] text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">What will happen:</p>
            {level === "firstUse" ? (
              <>
                <p>1. A backup of your current files will be saved to .prismnext/backups/</p>
                <p>2. All template files will be written, overwriting your content</p>
                <p>3. You can restore your original files from the backup if needed</p>
              </>
            ) : level === "L1" || level === "L2" ? (
              <>
                <p>1. Your written content (sections, paragraphs) will be preserved</p>
                <p>2. Document structure (preamble, packages) will be updated</p>
                {level === "L2" && (
                  <p>3. Unmapped sections will be appended at the end</p>
                )}
                <p>{level === "L2" ? "4" : "3"}. A backup will be saved to .prismnext/backups/</p>
              </>
            ) : (
              <>
                <p>1. All current template files will be replaced</p>
                <p>2. A full backup will be saved to .prismnext/backups/</p>
              </>
            )}
          </div>

          {/* Changed files */}
          {(changedFiles.length > 0 || deletedFiles.length > 0) && (
            <div className="text-[length:var(--font-size-12)]">
              <span className="text-muted-foreground">Modified files: </span>
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
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {config.actions.includes("replace") && (
            <Button
              variant={level === "L3" || level === "reset" ? "default" : "outline"}
              size="sm"
              className={
                level === "L3" || level === "reset"
                  ? "shadow-none bg-destructive hover:bg-destructive/90"
                  : "shadow-none"
              }
              disabled={submitting}
              onClick={() => onConfirm("replace")}
            >
              {level === "reset"
                ? "Backup & Reset"
                : level === "firstUse"
                  ? "Backup & Apply Template"
                  : "Backup & Replace All"}
            </Button>
          )}
          {config.actions.includes("merge") && (
            <Button
              size="sm"
              className="shadow-none"
              disabled={submitting}
              onClick={() => onConfirm("merge")}
            >
              {level === "L2" ? "Backup & Attempt Merge" : "Backup & Switch"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
