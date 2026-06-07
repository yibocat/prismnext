import { useEffect, useMemo, useCallback } from "react";
import { GitBranchIcon, LockIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { cn } from "@/lib/utils";

const WT_PREFIX = "wt-";

export function BranchSelector() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const currentBranch = useGitStore((s) => s.branch);
  const branches = useGitStore((s) => s.branches);
  const refreshBranches = useGitStore((s) => s.refreshBranches);
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);

  useEffect(() => {
    if (projectRoot && isGitRepo) {
      refreshBranches(projectRoot);
    }
  }, [projectRoot, isGitRepo, refreshBranches]);

  const visibleBranches = useMemo(
    () => branches.filter((b) => !b.startsWith(WT_PREFIX)),
    [branches],
  );

  const locked = activeWorktree !== null;
  const displayBranch = locked ? activeWorktree.baseBranch : currentBranch;

  const handleSelectBranch = useCallback(
    async (branchName: string) => {
      if (locked) return;
      if (branchName === currentBranch) return;
      if (!projectRoot) return;
      await useGitStore.getState().switchBranch(projectRoot, branchName);
    },
    [projectRoot, currentBranch, locked],
  );

  const handleInitGit = useCallback(async () => {
    if (!projectRoot) return;
    try {
      await useGitStore.getState().initRepo(projectRoot);
      toast.success("Git repository initialized");
    } catch (err: any) {
      toast.error(`Failed to init git: ${err?.message}`);
    }
  }, [projectRoot]);

  if (!projectRoot) return null;

  const buttonLabel = isGitRepo ? (displayBranch || "...") : "Init Git";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1",
            "text-[length:var(--font-chat-meta)] transition-colors",
            locked
              ? "bg-muted text-muted-foreground/70 cursor-not-allowed"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          <GitBranchIcon className="size-3.5" />
          <span className="max-w-[100px] truncate">{buttonLabel}</span>
          {locked && <LockIcon className="size-3" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {!isGitRepo ? (
          <DropdownMenuItem
            onClick={handleInitGit}
            className="text-[length:var(--font-chat-meta)]"
          >
            <PlusIcon className="size-3.5" />
            <span>Init Git</span>
          </DropdownMenuItem>
        ) : visibleBranches.length > 0 ? (
          visibleBranches.map((b) => {
            const isSelf = b === displayBranch;
            return (
              <DropdownMenuItem
                key={b}
                onClick={() => handleSelectBranch(b)}
                disabled={locked || isSelf}
                className={cn(
                  "text-[length:var(--font-chat-meta)]",
                  (locked || isSelf) && "opacity-50",
                )}
              >
                <GitBranchIcon className="size-3.5 shrink-0" />
                <span className="truncate flex-1">{b}</span>
                {isSelf && (
                  <span className="text-[length:var(--font-badge)] text-primary shrink-0 ml-1">
                    current
                  </span>
                )}
              </DropdownMenuItem>
            );
          })
        ) : (
          <div className="px-2 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
            No branches
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
