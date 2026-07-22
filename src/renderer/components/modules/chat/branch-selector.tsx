import { useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GitBranchIcon, LockIcon } from "lucide-react";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuTrigger,
  appMenuFontClass,
} from "@/components/ui/app-menu";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { CHAT_PANEL_TOOLBAR_BUTTON } from "./worktree-selector";
import { GitInitButton } from "@/modes/git-mode/git-init-button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

const WT_PREFIX = "wt-";

export function BranchSelector() {
  const { t } = useTranslation();
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
      if (branchName === currentBranch) {
        useGitStore.getState().setPendingBranch(null);
      } else {
        useGitStore.getState().setPendingBranch(branchName);
      }
    },
    [projectRoot, currentBranch, locked],
  );

  if (!projectRoot) return null;

  if (!isGitRepo) {
    return <GitInitButton />;
  }

  const buttonLabel = pendingBranch && !locked ? pendingBranch : (displayBranch || "...");

  return (
    <AppMenu>
      <Hint label={buttonLabel}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              CHAT_PANEL_TOOLBAR_BUTTON,
              locked
                ? "cursor-not-allowed opacity-70 hover:bg-transparent hover:text-muted-foreground/70"
                : undefined,
            )}
            onMouseDown={(e) => e.preventDefault()}
            disabled={locked}
          >
            <GitBranchIcon className="size-3 shrink-0" />
            <span className="max-w-[100px] truncate hidden @md:inline">{buttonLabel}</span>
            {locked && <LockIcon className="size-2.5" />}
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" className="w-56 max-h-56 overflow-y-auto">
        {visibleBranches.length > 0 ? (
          visibleBranches.map((b) => {
            const isCurrent = b === currentBranch;
            const isPending = b === pendingBranch;
            return (
              <AppMenuCheckItem
                key={b}
                selected={isCurrent}
                onClick={() => handleSelectBranch(b)}
                disabled={locked}
                className={cn(locked && "opacity-50")}
                trailing={
                  isPending && !isCurrent ? (
                    <span className="text-[length:var(--font-badge)] text-amber-500">
                      {t("chat.branch.next")}
                    </span>
                  ) : isCurrent ? (
                    <span className="text-[length:var(--font-badge)] text-primary">
                      {t("chat.branch.current")}
                    </span>
                  ) : null
                }
              >
                {b}
              </AppMenuCheckItem>
            );
          })
        ) : (
          <p className={cn("px-2 py-2 text-muted-foreground", appMenuFontClass)}>
            {t("chat.branch.noBranches")}
          </p>
        )}
      </AppMenuContent>
    </AppMenu>
  );
}
