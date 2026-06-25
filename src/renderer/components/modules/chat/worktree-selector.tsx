import { useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  GitBranchIcon,
  Loader2Icon,
  LaptopIcon,
  LockIcon,
  Trash2Icon,
} from "lucide-react";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { applyCheckoutTransition } from "@/lib/git/checkout-context";
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
    removeWorktree,
  } = useWorktreeStore();

  useEffect(() => {
    if (projectRoot) {
      refreshWorktrees(projectRoot);
    }
  }, [projectRoot, refreshWorktrees]);

  const handleSetLocal = useCallback(() => {
    void applyCheckoutTransition({ type: "local" });
  }, []);

  const handleSetNewWorktree = useCallback(async () => {
    const gs = useGitStore.getState();
    const wtStore = useWorktreeStore.getState();
    let baseBranch = wtStore.activeWorktree?.baseBranch ?? null;
    if (!baseBranch && projectRoot && gs.isGitRepo) {
      if (!gs.branch) {
        await gs.refreshStatus(projectRoot);
        await gs.refreshBranches(projectRoot);
      }
      baseBranch = useGitStore.getState().branch;
    }
    if (!baseBranch) {
      toast.error("Cannot determine base branch — is Git initialized?");
      return;
    }
    void applyCheckoutTransition({ type: "worktree-intent", baseBranch });
  }, [projectRoot]);

  const handleSelectExisting = useCallback(
    (wtName: string) => {
      const wt = worktrees.find((w) => w.name === wtName);
      if (wt) void applyCheckoutTransition({ type: "worktree-existing", worktree: wt });
    },
    [worktrees],
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

  if (!isGitRepo) return null;

  if (hasMessages) {
    return (
      <span
        className={cn(
          "flex items-center gap-0 @md:gap-1.5 rounded-full border border-border px-1.5 @md:px-2.5 py-1 cursor-default",
          "text-[length:var(--font-chat-meta)]",
          mode === "worktree"
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-card text-muted-foreground",
        )}
        title={`Worktree mode is locked: ${triggerLabel}`}
      >
        {mode === "local" ? <LaptopIcon className="size-3.5 shrink-0" /> : <GitBranchIcon className="size-3.5 shrink-0" />}
        <span className="max-w-[100px] truncate hidden @md:inline">{triggerLabel}</span>
        <LockIcon className="size-3 text-muted-foreground/50" />
      </span>
    );
  }

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-0 @md:gap-1.5 rounded-full border border-border px-1.5 @md:px-2.5 py-1",
            "text-[length:var(--font-chat-meta)] transition-colors",
            mode === "worktree"
              ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          onMouseDown={(e) => e.preventDefault()}
          title={triggerLabel}
        >
          {mode === "local" ? <LaptopIcon className="size-3.5 shrink-0" /> : <GitBranchIcon className="size-3.5 shrink-0" />}
          <span className="max-w-[100px] truncate hidden @md:inline">{triggerLabel}</span>
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="start" className="w-56">
        <AppMenuCheckItem selected={mode === "local"} onClick={handleSetLocal}>
          Local
        </AppMenuCheckItem>

        {worktrees.length > 0 && (
          <>
            <AppMenuSeparator />
            <AppMenuLabel>Existing worktrees</AppMenuLabel>
            {worktrees.map((wt) => (
              <AppMenuItem
                key={wt.name}
                onClick={() => handleSelectExisting(wt.name)}
                className="group"
                trailing={
                  <span className="flex items-center gap-0.5 shrink-0">
                    {wt.aheadCount > 0 && (
                      <span className="text-[length:var(--font-hint)] text-muted-foreground/50">
                        {wt.aheadCount}↑
                      </span>
                    )}
                    {wt.behindCount > 0 && (
                      <span
                        className="text-[length:var(--font-hint)] text-amber-500"
                        title={`${wt.behindCount} commits behind base`}
                      >
                        {wt.behindCount}↓
                      </span>
                    )}
                    {activeWorktree?.name === wt.name && (
                      <span className="text-[length:var(--font-badge)] text-primary">active</span>
                    )}
                    <button
                      type="button"
                      className="flex size-4 items-center justify-center rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                      onClick={(e) => void handleRemove(wt.name, e)}
                      title={`Remove ${wt.name}`}
                    >
                      <Trash2Icon className="size-2.5" />
                    </button>
                  </span>
                }
              >
                {wt.name}
              </AppMenuItem>
            ))}
          </>
        )}

        <AppMenuSeparator />
        <AppMenuItem
          onClick={handleSetNewWorktree}
          disabled={loading}
          trailing={
            loading ? (
              <Loader2Icon className="size-3 animate-spin opacity-80" />
            ) : mode === "worktree" && !isActive ? (
              <span className="text-[length:var(--font-badge)] text-primary">selected</span>
            ) : null
          }
        >
          New Worktree
        </AppMenuItem>
      </AppMenuContent>
    </AppMenu>
  );
}
