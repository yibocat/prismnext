import { useCallback, useState } from "react";
import {
  ChevronDownIcon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
  Loader2Icon,
} from "lucide-react";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useGitStore } from "@/stores/git-store";
import { cn } from "@/lib/utils";

export type GitToolbarChangesMode = "local" | "worktree";

interface GitToolbarChangesActionProps {
  mode: GitToolbarChangesMode;
  projectRoot: string;
  compact?: boolean;
  stagedCount: number;
  onMerge: () => void;
  onCommit: () => void;
}

const primaryBtnClass = cn(
  "flex items-center gap-1 px-2 transition-colors",
  "hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none",
);

const shellClass = cn(
  "flex shrink-0 items-stretch h-6 rounded-md overflow-hidden",
  "bg-primary text-primary-foreground text-[length:var(--font-menu-item)] font-medium shadow-sm",
);

/** Local: Cursor-style split button (Commit + Merge / Push menu). Worktree: single Merge to Branch. */
export function GitToolbarChangesAction({
  mode,
  projectRoot,
  compact,
  stagedCount,
  onMerge,
  onCommit,
}: GitToolbarChangesActionProps) {
  const [pushing, setPushing] = useState(false);

  const handlePush = useCallback(async () => {
    if (!projectRoot || pushing) return;
    setPushing(true);
    try {
      await useGitStore.getState().pushRemote(projectRoot);
    } finally {
      setPushing(false);
    }
  }, [projectRoot, pushing]);

  if (mode === "worktree") {
    return (
      <button
        type="button"
        onClick={onMerge}
        className={cn(shellClass, primaryBtnClass)}
        title="Merge to Branch"
      >
        <GitMergeIcon className="size-3.5 shrink-0" />
        {!compact && <span>Merge to Branch</span>}
      </button>
    );
  }

  return (
    <div className={shellClass}>
      <button
        type="button"
        onClick={onCommit}
        disabled={stagedCount === 0}
        className={primaryBtnClass}
        title="Commit"
      >
        <GitCommitHorizontalIcon className="size-3.5 shrink-0" />
        {!compact && <span>Commit</span>}
      </button>

      <AppMenu>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center justify-center w-6 border-l border-primary-foreground/20",
              "hover:bg-primary/90 transition-colors",
            )}
            aria-label="More git actions"
          >
            <ChevronDownIcon className="size-3 shrink-0" />
          </button>
        </AppMenuTrigger>
        <AppMenuContent align="end" className="min-w-[7rem]">
          <AppMenuItem onClick={onMerge}>Merge</AppMenuItem>
          <AppMenuItem onClick={onCommit} disabled={stagedCount === 0}>
            Commit
          </AppMenuItem>
          <AppMenuItem
            onClick={() => void handlePush()}
            disabled={pushing}
            trailing={
              pushing ? <Loader2Icon className="size-3 animate-spin opacity-80" /> : null
            }
          >
            Push
          </AppMenuItem>
        </AppMenuContent>
      </AppMenu>
    </div>
  );
}
