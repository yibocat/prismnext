import { useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  GitBranchIcon,
  PlusIcon,
  Trash2Icon,
  Loader2Icon,
  FolderIcon,
  LockIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";

export function WorktreeSelector() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const {
    worktrees,
    activeWorktree,
    mode,
    loading,
    refreshWorktrees,
    setMode,
    selectExistingWorktree,
    removeWorktree,
  } = useWorktreeStore();

  // ── All hooks must be called unconditionally (React rules of hooks) ──

  useEffect(() => {
    if (projectRoot) {
      refreshWorktrees(projectRoot);
    }
  }, [projectRoot, refreshWorktrees]);

  const handleSetLocal = useCallback(() => {
    setMode("local");
  }, [setMode]);

  const handleSetNewWorktree = useCallback(async () => {
    const gs = useGitStore.getState();
    // Ensure git state is loaded before reading the current branch.
    if (!gs.branch && projectRoot && gs.isGitRepo) {
      await gs.refreshStatus(projectRoot);
      await gs.refreshBranches(projectRoot);
    }
    const currentBranch = useGitStore.getState().branch;
    if (!currentBranch) {
      toast.error("Cannot determine current branch — is Git initialized?");
      return;
    }
    // Lazy: worktree is created when the first message is sent.
    // Progress is shown in-chat while the worktree initialises.
    setMode("worktree", currentBranch);
  }, [setMode, projectRoot]);

  const handleSelectExisting = useCallback(
    (wtName: string) => {
      const wt = worktrees.find((w) => w.name === wtName);
      if (wt) selectExistingWorktree(wt);
    },
    [worktrees, selectExistingWorktree],
  );

  const handleRemove = useCallback(
    async (name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!projectRoot) return;
      try {
        await removeWorktree(projectRoot, name);
      } catch {}
    },
    [projectRoot, removeWorktree],
  );

  const isActive = activeWorktree !== null;

  const triggerLabel = isActive
    ? activeWorktree.name
    : mode === "worktree"
      ? "New Worktree"
      : "Local";

  // ── Conditional render — only after ALL hooks ──
  if (!isGitRepo) return null;

  // When chat has messages, the worktree mode is locked — show a non-interactive
  // badge so the user can still see their current context.
  if (hasMessages) {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 cursor-default",
          "text-[length:var(--font-chat-meta)]",
          mode === "worktree"
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-card text-muted-foreground",
        )}
        title="Worktree mode is locked for this conversation"
      >
        <GitBranchIcon className="size-3.5" />
        <span className="max-w-[100px] truncate">{triggerLabel}</span>
        <LockIcon className="size-3 text-muted-foreground/50" />
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1",
            "text-[length:var(--font-chat-meta)] transition-colors",
            mode === "worktree"
              ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          <GitBranchIcon className="size-3.5" />
          <span className="max-w-[100px] truncate">{triggerLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {/* Local option */}
        <DropdownMenuItem
          onClick={handleSetLocal}
          className="text-[length:var(--font-chat-meta)]"
        >
          <FolderIcon className="size-3.5" />
          <span>Local</span>
          {mode === "local" && (
            <span className="ml-auto text-[length:var(--font-badge)] text-primary">
              active
            </span>
          )}
        </DropdownMenuItem>

        {/* Existing worktrees — only if any exist */}
        {worktrees.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1 text-[length:var(--font-hint)] text-muted-foreground uppercase tracking-wider">
              Existing worktrees
            </div>
            {worktrees.map((wt) => (
              <DropdownMenuItem
                key={wt.name}
                onClick={() => handleSelectExisting(wt.name)}
                className="text-[length:var(--font-chat-meta)] group"
              >
                <GitBranchIcon className="size-3.5 shrink-0" />
                <span className="truncate flex-1">{wt.name}</span>
                {wt.aheadCount > 0 && (
                  <span className="text-[length:var(--font-hint)] text-muted-foreground/50 shrink-0 ml-1">
                    {wt.aheadCount}↑
                  </span>
                )}
                {wt.behindCount > 0 && (
                  <span
                    className="text-[length:var(--font-hint)] text-amber-500 shrink-0 ml-0.5"
                    title={`${wt.behindCount} commits behind base — consider merging main into this worktree first`}
                  >
                    {wt.behindCount}↓
                  </span>
                )}
                {activeWorktree?.name === wt.name && (
                  <span className="text-[length:var(--font-badge)] text-primary shrink-0 ml-1">
                    active
                  </span>
                )}
                <button
                  type="button"
                  className="ml-1 flex size-5 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                  onClick={(e) => handleRemove(wt.name, e)}
                  title={`Remove ${wt.name}`}
                >
                  <Trash2Icon className="size-3" />
                </button>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />

        {/* New Worktree option — sets intent, does NOT create */}
        <DropdownMenuItem
          onClick={handleSetNewWorktree}
          className="text-[length:var(--font-chat-meta)]"
          disabled={loading}
        >
          {loading ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <PlusIcon className="size-3.5" />
          )}
          <span>New Worktree</span>
          {mode === "worktree" && !isActive && (
            <span className="ml-auto text-[length:var(--font-badge)] text-primary">
              selected
            </span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
