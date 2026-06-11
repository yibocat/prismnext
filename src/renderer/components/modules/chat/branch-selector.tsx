import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { GitBranchIcon, LockIcon, Loader2Icon } from "lucide-react";
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
  const pendingBranch = useGitStore((s) => s.pendingBranch);
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

  // Cache the project branch so wt-* never flashes during transitions
  // (e.g. when switching from worktree back to local — the git store still
  // reports the wt-* worktree branch for a frame while it refreshes).
  const lastProjectBranch = useRef(
    currentBranch && !currentBranch.startsWith(WT_PREFIX)
      ? currentBranch
      : activeWorktree?.baseBranch || "",
  );
  useEffect(() => {
    if (currentBranch && !currentBranch.startsWith(WT_PREFIX)) {
      lastProjectBranch.current = currentBranch;
    }
  }, [currentBranch]);

  const locked = activeWorktree !== null;
  const displayBranch: string = locked
    ? activeWorktree.baseBranch
    : (pendingBranch
      || (currentBranch && !currentBranch.startsWith(WT_PREFIX)
        ? currentBranch
        : (lastProjectBranch.current || "...")));

  const handleSelectBranch = useCallback(
    (branchName: string) => {
      if (locked) return;
      if (!projectRoot) return;
      // Lazy branch selection — only stores intent.
      // Actual git checkout happens later in sendPrompt.
      if (branchName === currentBranch) {
        useGitStore.getState().setPendingBranch(null);
      } else {
        useGitStore.getState().setPendingBranch(branchName);
      }
    },
    [projectRoot, currentBranch, locked],
  );

  const [initLoading, setInitLoading] = useState(false);

  const handleInitGit = useCallback(async () => {
    if (!projectRoot) return;
    setInitLoading(true);
    try {
      await useGitStore.getState().initRepo(projectRoot);
      toast.success("Git repository initialized");
    } catch (err: any) {
      toast.error(`Failed to init git: ${err?.message}`);
    } finally {
      setInitLoading(false);
    }
  }, [projectRoot]);

  if (!projectRoot) return null;

  // ── No Git repo yet: direct-click Init Git button ──
  if (!isGitRepo) {
    return (
      <button
        type="button"
        onClick={handleInitGit}
        disabled={initLoading}
        className={cn(
          "flex items-center gap-0 @md:gap-1.5 rounded-full border border-border px-1.5 @md:px-2.5 py-1",
          "text-[length:var(--font-chat-meta)] transition-colors",
          "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          "disabled:opacity-50 disabled:cursor-wait",
        )}
        title="Initialize Git repository"
      >
        {initLoading ? (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <GitBranchIcon className="size-3.5 shrink-0" />
        )}
        <span className="max-w-[100px] truncate hidden @md:inline">Init Git</span>
      </button>
    );
  }

  // ── Git repo exists: branch selector dropdown ──
  const buttonLabel = pendingBranch && !locked ? pendingBranch : (displayBranch || "...");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-0 @md:gap-1.5 rounded-full border border-border px-1.5 @md:px-2.5 py-1",
            "text-[length:var(--font-chat-meta)] transition-colors",
            locked
              ? "bg-muted text-muted-foreground/70 cursor-not-allowed"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          onMouseDown={(e) => e.preventDefault()}
          title={buttonLabel}
        >
          <GitBranchIcon className="size-3.5 shrink-0" />
          <span className="max-w-[100px] truncate hidden @md:inline">{buttonLabel}</span>
          {locked && <LockIcon className="size-3" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {visibleBranches.length > 0 ? (
          visibleBranches.map((b) => {
            const isCurrent = b === currentBranch;
            const isPending = b === pendingBranch;
            return (
              <DropdownMenuItem
                key={b}
                onClick={() => handleSelectBranch(b)}
                disabled={locked}
                className={cn(
                  "text-[length:var(--font-chat-meta)]",
                  (locked || isCurrent) && "opacity-50",
                )}
              >
                <GitBranchIcon className="size-3.5 shrink-0" />
                <span className="truncate flex-1">{b}</span>
                {isCurrent && (
                  <span className="text-[length:var(--font-badge)] text-primary shrink-0 ml-1">
                    current
                  </span>
                )}
                {isPending && !isCurrent && (
                  <span className="text-[length:var(--font-badge)] text-amber-500 shrink-0 ml-1">
                    next
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
