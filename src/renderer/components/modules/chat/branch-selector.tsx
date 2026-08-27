import { useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GitBranchIcon, Loader2Icon, LockIcon } from "lucide-react";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuTrigger,
  appMenuFontClass,
} from "@/components/ui/app-menu";
import { parseRemoteAbs } from "@shared/remote";
import { remotePhaseIsReady } from "@/lib/remote/ensure-connected";
import { resolveToolbarGitState } from "@/lib/git/git-refresh-root";
import { remoteConnectionPhaseForRoot } from "@/lib/remote/display";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { useRemoteStore } from "@/stores/remote-store";
import { CHAT_PANEL_TOOLBAR_BUTTON } from "./worktree-selector";
import { GitInitButton } from "@/modes/git-mode/git-init-button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

const WT_PREFIX = "wt-";

export function BranchSelector() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const repoKnown = useGitStore((s) => s.repoKnown);
  const currentBranch = useGitStore((s) => s.branch);
  const switching = useGitStore((s) => s.switching);
  const branches = useGitStore((s) => s.branches);
  const refreshBranches = useGitStore((s) => s.refreshBranches);
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const byProfileId = useRemoteStore((s) => s.byProfileId);
  const remoteLive = !parseRemoteAbs(projectRoot ?? "")
    || remotePhaseIsReady(remoteConnectionPhaseForRoot(projectRoot, byProfileId) ?? undefined);

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

  const inWorktree = activeWorktree !== null;
  const remoteOffline = Boolean(parseRemoteAbs(projectRoot ?? "") && !remoteLive);
  const displayBranch: string = inWorktree
    ? activeWorktree.baseBranch
    : (currentBranch && !currentBranch.startsWith(WT_PREFIX)
      ? currentBranch
      : (lastProjectBranch.current || "..."));
  const branchLocked = inWorktree || switching || remoteOffline;

  const handleSelectBranch = useCallback(
    (branchName: string) => {
      if (branchLocked) return;
      if (!projectRoot) return;
      if (branchName === currentBranch) return;
      void useGitStore.getState().switchBranch(projectRoot, branchName);
    },
    [projectRoot, currentBranch, branchLocked],
  );

  if (!projectRoot) return null;

  if (!isGitRepo) {
    if (resolveToolbarGitState({
      projectRoot,
      isGitRepo,
      repoKnown,
      remoteLive,
    }) !== "init") {
      return null;
    }
    return <GitInitButton />;
  }

  const buttonLabel = displayBranch || "...";

  return (
    <AppMenu>
      <Hint label={buttonLabel}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={CHAT_PANEL_TOOLBAR_BUTTON}
            onMouseDown={(e) => e.preventDefault()}
            disabled={switching}
          >
            {switching ? (
              <Loader2Icon className="size-3 shrink-0 animate-spin" />
            ) : (
              <GitBranchIcon className="size-3 shrink-0" />
            )}
            <span className="max-w-[140px] truncate hidden @md:inline">{buttonLabel}</span>
            {inWorktree && <LockIcon className="size-2.5" />}
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
        {visibleBranches.length > 0 ? (
          visibleBranches.map((b) => {
            const isCurrent = b === displayBranch;
            return (
              <AppMenuCheckItem
                key={b}
                selected={isCurrent}
                onClick={() => handleSelectBranch(b)}
                disabled={branchLocked}
                className={cn(branchLocked && "opacity-50")}
                trailing={
                  isCurrent ? (
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
