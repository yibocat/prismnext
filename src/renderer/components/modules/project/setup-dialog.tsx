import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProjectDialogStore } from "@/stores/project-dialog-store";
import { FolderOpenIcon } from "lucide-react";

function shortenPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const unix = normalized.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
  if (unix) return `~${unix[1] || ""}`;
  const win = normalized.match(/^[A-Za-z]:\/Users\/[^/]+(\/.*)?$/i);
  if (win) return `~${win[1] || ""}`;
  return normalized;
}

function projectFolderName(projectPath: string): string {
  const parts = projectPath.replace(/[/\\]+$/, "").split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

/** `ceshi/.workbench/` — project name + relative missing path, one trailing slash for dirs. */
export function formatMissingEntry(projectPath: string, rel: string): string {
  const name = projectFolderName(projectPath);
  const isDir = rel.endsWith("/") || rel.endsWith("\\");
  const clean = rel.replace(/^[/\\]+/, "").replace(/[/\\]+$/, "");
  if (!clean) return `${name}/`;
  return `${name}/${clean}${isDir ? "/" : ""}`;
}

export function ProjectSetupDialog() {
  const { t } = useTranslation();
  const open = useProjectDialogStore((s) => s.open);
  const projectPath = useProjectDialogStore((s) => s.projectPath);
  const missing = useProjectDialogStore((s) => s.missing);
  const close = useProjectDialogStore((s) => s.close);

  return (
    <Dialog open={open} onOpenChange={() => close("cancel")}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[length:var(--font-dialog-title)]">
            {t("project.setup.title")}
          </DialogTitle>
          <DialogDescription className="text-[length:var(--font-dialog-label)]">
            {t("project.setup.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-[length:var(--font-dialog-label)] text-muted-foreground">
            <FolderOpenIcon className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate font-mono" title={projectPath}>
              {shortenPath(projectPath)}
            </span>
          </div>

          <div>
            <p className="mb-1.5 text-[length:var(--font-dialog-label)] text-muted-foreground">
              {t("project.setup.missing")}
            </p>
            <div className="flex flex-wrap gap-1">
              {missing.map((d) => (
                <span
                  key={d}
                  className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[length:var(--font-dialog-label)] text-muted-foreground"
                >
                  {formatMissingEntry(projectPath, d)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => close("skip")}>
            {t("project.setup.openAnyway")}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={() => close("cancel")}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={() => close("create")}>
              {t("project.setup.createAndOpen")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
