import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, AlertTriangleIcon, GitBranchIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useDocumentStore } from "@/stores/document-store";
import { gitDesktop } from "@/lib/desktop-api/git";
import { cn } from "@/lib/utils";
import {
  buildMergeToBranchStepLabels,
  canMergeWorktree,
  loadWorktreeChangedFiles,
  mergeWorktreeToBase,
  type WorktreeChangedFile,
} from "@/lib/git/git-orchestrator";
import { useResolvedWorktree } from "@/lib/git/use-resolved-worktree";
import { syncAfterWorktreeMerge } from "@/lib/git/git-sync";

interface GitWorktreeMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRoot: string;
}

export function GitWorktreeMergeDialog({ open, onOpenChange, projectRoot }: GitWorktreeMergeDialogProps) {
  const { t } = useTranslation();
  const resolvedWorktree = useResolvedWorktree({ refreshOnMount: open });

  const [files, setFiles] = useState<WorktreeChangedFile[]>([]);
  const [merging, setMerging] = useState(false);
  const [mergeStep, setMergeStep] = useState(-1);
  const [mergeSteps, setMergeSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const worktreeRoot = resolvedWorktree?.path;
  const baseBranch = resolvedWorktree?.baseBranch || "main";
  const aheadCount = resolvedWorktree?.aheadCount ?? 0;
  const canMerge = canMergeWorktree(files.length, aheadCount);

  const loadFiles = useCallback(async () => {
    if (!worktreeRoot) return;
    setFiles(await loadWorktreeChangedFiles(worktreeRoot));
  }, [worktreeRoot]);

  useEffect(() => {
    if (open) {
      loadFiles();
      setError(null);
    }
  }, [open, loadFiles]);

  const handleMerge = useCallback(async () => {
    if (!worktreeRoot || !projectRoot || !canMerge || !resolvedWorktree) return;

    setMerging(true);
    setError(null);
    setMergeStep(0);

    const currentBranch = await gitDesktop.gitStatus(projectRoot)
      .then((s) => s.branch)
      .catch(() => "");
    const labels = buildMergeToBranchStepLabels(baseBranch, currentBranch === baseBranch);
    setMergeSteps(labels);

    const result = await mergeWorktreeToBase(
      {
        projectRoot,
        worktree: resolvedWorktree,
        changedFiles: files.map((f) => f.path),
        aheadCount,
      },
      (progress) => setMergeStep(progress.index),
    );

    if (result.success) {
      if (result.rollbackWarnings?.length) {
        for (const warning of result.rollbackWarnings) {
          toast.warning(warning, { duration: 8000 });
        }
      }
      await syncAfterWorktreeMerge(projectRoot, worktreeRoot, resolvedWorktree.name);
      toast.success(`Merged ${result.changeSummary} into ${baseBranch}`);
      onOpenChange(false);
    } else {
      setError(result.error || "Merge failed");
      if (result.rollbackWarnings?.length) {
        toast.warning("Merge rolled back with warnings", {
          description: result.rollbackWarnings.join(" "),
          duration: 10000,
        });
      }
      toast.error(`Merge failed: ${result.error}`);
    }

    setMerging(false);
  }, [worktreeRoot, projectRoot, files, baseBranch, resolvedWorktree, onOpenChange, canMerge, aheadCount]);

  if (!resolvedWorktree) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialogs.git.mergeWorktreeTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Integrates worktree commits into the target branch locally. This is not a remote <code className="text-xs bg-muted px-1 rounded">git push</code>.
          </p>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranchIcon className="size-3.5" />
            <span className="truncate">{resolvedWorktree.branch}</span>
            <span className="text-primary font-semibold">→</span>
            <GitBranchIcon className="size-3.5 text-primary" />
            <span className="truncate text-primary">{baseBranch}</span>
          </div>

          {!canMerge ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No changes to merge
            </p>
          ) : (
            <>
              {files.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {files.map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border last:border-0"
                    >
                      <span
                        className={cn(
                          "font-mono text-[length:var(--font-size-10)] shrink-0 w-3",
                          f.status === "M" && "text-amber-500",
                          f.status === "A" && "text-emerald-500",
                          f.status === "D" && "text-red-500",
                          f.status === "?" && "text-muted-foreground",
                        )}
                      >
                        {f.status}
                      </span>
                      <span className="truncate">{f.path}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground px-1">
                  {aheadCount} commit{aheadCount !== 1 ? "s" : ""} ready to merge into {baseBranch}
                </p>
              )}

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded text-xs text-destructive bg-destructive/5">
                  <AlertTriangleIcon className="size-3 shrink-0" />
                  <span className="truncate">{error}</span>
                </div>
              )}

              {merging && mergeSteps.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2Icon className="size-3 animate-spin shrink-0" />
                    <span className="truncate">{mergeSteps[mergeStep] || mergeSteps[mergeSteps.length - 1]}</span>
                  </div>
                  <Progress value={((mergeStep + 1) / mergeSteps.length) * 100} />
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  {files.length > 0
                    ? `${files.length} file${files.length !== 1 ? "s" : ""}`
                    : `${aheadCount} commit${aheadCount !== 1 ? "s" : ""}`}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    disabled={merging}
                    className="flex items-center h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleMerge}
                    disabled={merging || !canMerge}
                    className="flex items-center gap-1.5 h-8 px-4 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {merging ? (
                      <>
                        <Loader2Icon className="size-3 animate-spin" />
                        Merging…
                      </>
                    ) : (
                      <>Merge → {baseBranch}</>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
