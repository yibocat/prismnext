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

export function ProjectSetupDialog() {
  const open = useProjectDialogStore((s) => s.open);
  const projectPath = useProjectDialogStore((s) => s.projectPath);
  const missing = useProjectDialogStore((s) => s.missing);
  const close = useProjectDialogStore((s) => s.close);

  return (
    <Dialog open={open} onOpenChange={() => close("cancel")}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[length:var(--font-dialog-title)]">Setup Project</DialogTitle>
          <DialogDescription className="text-[length:var(--font-dialog-label)]">
            This folder is missing the standard Prism Next project structure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-[length:var(--font-dialog-label)] text-muted-foreground">
            <FolderOpenIcon className="size-3.5 shrink-0" />
            <span className="truncate">{projectPath.split("/").pop() || projectPath}</span>
          </div>

          <div>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mb-1.5">Missing directories:</p>
            <div className="flex flex-wrap gap-1">
              {missing.map((d) => (
                <span
                  key={d}
                  className="rounded bg-muted px-1.5 py-0.5 text-[length:var(--font-dialog-label)] font-mono text-muted-foreground"
                >
                  {d}/
                </span>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => close("cancel")}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={() => close("skip")}>
            Open Anyway
          </Button>
          <Button size="sm" onClick={() => close("create")}>
            Create & Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
