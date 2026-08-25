import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCwIcon,
  Loader2Icon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
} from "lucide-react";
import { useGitStore, type GitCommitData } from "@/stores/git-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { groupByDate, formatRelativeTime, parseRefs, type RefBadge } from "./git-utils";
import { GitSidebarViewTabs } from "./git-sidebar-view-tabs";
import { GitChangesTreeSidebar } from "./git-changes-tree-sidebar";
import { workingLens } from "@shared/git";
import { useLastAgentTurnLens } from "@/lib/git/agent-turn-lens";
import { filterGitFilesByLens } from "./git-changes-tree";
import {
  SidebarHeader,
  SidebarContent,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";

// ─── Main Component ───

export function GitSidebar() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const files = useGitStore((s) => s.files);
  const filterMode = useGitStore((s) => s.filterMode);
  const changesLens = useGitStore((s) => s.changesLens);
  const lastTurn = useLastAgentTurnLens();
  const selectUnit = useGitStore((s) => s.selectUnit);
  const refreshStatus = useGitStore((s) => s.refreshStatus);
  const refreshBranches = useGitStore((s) => s.refreshBranches);
  const sidebarView = useGitStore((s) => s.sidebarView);
  const branch = useGitStore((s) => s.branch);
  const commits = useGitStore((s) => s.commits);
  const commitsLoading = useGitStore((s) => s.commitsLoading);
  const selectedCommitHash = useGitStore((s) => s.selectedCommitHash);
  const selectCommit = useGitStore((s) => s.selectCommit);
  const clearSelectedCommit = useGitStore((s) => s.clearSelectedCommit);

  // ── Worktree detection ──
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const checkoutRoot = useDocumentStore((s) => s.checkoutRoot);

  const gitRoot = unitRoot ?? projectRoot;

  // Auto-select unit on mount — respect checkoutRoot in case a worktree
  // is already active when the Git panel is opened.
  useEffect(() => {
    const root = checkoutRoot || projectRoot;
    if (!root) return;
    selectUnit(root);
  }, [projectRoot, checkoutRoot, selectUnit]);

  const handleRefresh = useCallback(async () => {
    if (!gitRoot) return;
    await refreshStatus(gitRoot);
    await refreshBranches(gitRoot);
  }, [gitRoot, refreshStatus, refreshBranches]);

  // ── Filtered files ──

  const filteredFiles = useMemo(
    () =>
      filterGitFilesByLens(
        files,
        changesLens.kind === "commit" || changesLens.kind === "branch-changes"
          ? workingLens(filterMode)
          : changesLens,
        lastTurn.paths,
      ),
    [files, changesLens, filterMode, lastTurn.paths],
  );

  // ── Not a git repo ──

  if (!isGitRepo && !checkingRepo) {
    return (
      <>
        <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between px-3">
          <span className="truncate text-[length:var(--font-size-12)] font-medium text-muted-foreground">
            {t("modes.git.label")}
          </span>
        </SidebarHeader>
        <SidebarContent className="px-2 py-1">
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
            <GitBranchIcon className="size-5 text-muted-foreground/50" />
            <div className="space-y-1">
              <p className="text-[length:var(--font-size-13)] font-medium text-foreground/90">
                {t("modes.git.noRepo")}
              </p>
              <p className="text-[length:var(--font-size-12)] text-muted-foreground max-w-[14rem]">
                {t("modes.git.noRepoHint")}
              </p>
            </div>
          </div>
        </SidebarContent>
      </>
    );
  }

  // ── Normal git view ──

  return (
    <>
      {/* ─── Header: view tabs + context row ─── */}
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center gap-2 px-3 min-w-0">
        <GitSidebarViewTabs />

        {sidebarView === "history" ? (
          <>
            <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs font-medium text-muted-foreground">
              {branch && branch.startsWith("wt-")
                ? (activeWorktree?.baseBranch || branch)
                : branch || "(no branch)"}
            </span>
            <span className="text-muted-foreground/30 shrink-0 select-none">·</span>
            <span className="text-xs text-muted-foreground/60 shrink-0 tabular-nums">
              {commits.length}
            </span>
          </>
        ) : null}

        <div className="flex-1" />

        {/* Refresh */}
        <Hint shortcutId="workspace.gitRefresh">
          <button
            type="button"
            onClick={handleRefresh}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <RefreshCwIcon className="size-3.5" />
          </button>
        </Hint>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-auto">
        {/* ─── Checking / loading state ─── */}
        {checkingRepo ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground/30" />
          </div>
        ) : (sidebarView === "history") ? (
          /* ─── History view ─── */
          <HistoryList
            commits={commits}
            commitsLoading={commitsLoading}
            selectedCommitHash={selectedCommitHash}
            onSelect={(hash) => {
              if (selectedCommitHash === hash) clearSelectedCommit();
              else selectCommit(hash);
            }}
          />
        ) : (
          <GitChangesTreeSidebar files={filteredFiles} />
        )}
      </SidebarContent>
    </>
  );
}

// ─── History List ───

function HistoryList({
  commits,
  commitsLoading,
  selectedCommitHash,
  onSelect,
}: {
  commits: GitCommitData[];
  commitsLoading: boolean;
  selectedCommitHash: string | null;
  onSelect: (hash: string) => void;
}) {
  const { t } = useTranslation();
  const dateGroups = useMemo(() => groupByDate(commits), [commits]);

  if (commitsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground/30" />
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="px-3 py-8 text-center">
        <p className="text-[length:var(--font-hint)] text-muted-foreground/60">
          {t("modes.git.noCommitsYet")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      {dateGroups.map((group) => (
        <div key={group.dateKey}>
          <div className="flex items-center gap-1.5 px-3.5 py-1 text-[length:var(--font-size-12)] font-medium text-muted-foreground/70">
            {group.label}
          </div>
          <div className="space-y-0.5 px-2 mb-2">
          {group.commits.map((c) => {
            const refs: RefBadge[] = parseRefs(c.refs);
            const isMerge = /^Merge(\s|$)/i.test(c.message);
            const isSelected = selectedCommitHash === c.hash;
            const hasRefs = refs.length > 0;
            return (
              <button
                key={c.hash}
                type="button"
                onClick={() => onSelect(c.hash)}
                className={cn(
                  "flex items-center gap-1.5 h-6 px-1.5 rounded-sm w-full cursor-pointer transition-colors overflow-hidden text-left",
                  isSelected ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                {isMerge ? (
                  <GitMergeIcon className="size-3 shrink-0 text-violet-500 dark:text-violet-400" />
                ) : hasRefs ? (
                  <span className="flex items-center gap-0.5 shrink-0">
                    {refs.map((r, i) => {
                      const dotColor = r.colorClass.includes("amber") ? "bg-amber-500 dark:bg-amber-400"
                        : r.colorClass.includes("sky") ? "bg-sky-500 dark:bg-sky-400"
                        : r.colorClass.includes("pink") ? "bg-pink-500 dark:bg-pink-400"
                        : "bg-emerald-500 dark:bg-emerald-400";
                      return <span key={i} className={cn("size-1.5 rounded-full shrink-0", dotColor)} />;
                    })}
                  </span>
                ) : (
                  <GitCommitHorizontalIcon className="size-3 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate flex-1 text-[length:var(--font-size-12)]">
                  {c.message}
                </span>
                <span className="shrink-0 text-[length:var(--font-timestamp)] text-muted-foreground/70 tabular-nums">
                  {formatRelativeTime(c.date)}
                </span>
              </button>
            );
          })}
          </div>
        </div>
      ))}
    </div>
  );
}
