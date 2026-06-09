import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCwIcon,
  Loader2Icon,
  GitBranchIcon,
  CheckIcon,
  Undo2Icon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
  ChevronDownIcon,
} from "lucide-react";
import { useGitStore, type GitFileItem, type GitCommitData } from "@/stores/git-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { groupByDate, formatRelativeTime, parseRefs, type RefBadge } from "./git-utils";
import {
  SidebarHeader,
  SidebarContent,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Helpers ───

/** Returns a Tailwind background color class for a file's git status dot. */
function statusDotColor(file: GitFileItem): string {
  if (file.untracked) return "bg-slate-400 dark:bg-slate-500";
  const status = file.staged ? file.indexStatus : file.worktreeStatus;
  switch (status) {
    case "A": return "bg-emerald-500 dark:bg-emerald-400";
    case "M": return "bg-amber-500 dark:bg-amber-400";
    case "D": return "bg-red-500 dark:bg-red-400";
    case "R": return "bg-violet-500 dark:bg-violet-400";
    case "U": return "bg-red-500 dark:bg-red-400";
    case "T": return "bg-violet-500 dark:bg-violet-400";
    case "C": return "bg-sky-500 dark:bg-sky-400";
    default: return "bg-muted-foreground/40";
  }
}

// ─── Main Component ───

export function GitSidebar() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const files = useGitStore((s) => s.files);
  const filterMode = useGitStore((s) => s.filterMode);
  const selectedFilePaths = useGitStore((s) => s.selectedFilePaths);
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
  const isWorktreeView = !!(
    activeWorktree &&
    checkoutRoot &&
    checkoutRoot === activeWorktree.path
  );

  const gitRoot = unitRoot ?? projectRoot;

  // ── Auto-select unit on mount ──

  // Auto-select unit on mount — respect checkoutRoot in case a worktree
  // is already active when the Git panel is opened.
  useEffect(() => {
    const root = checkoutRoot || projectRoot;
    if (!root) return;
    selectUnit(root);
  }, [projectRoot, checkoutRoot, selectUnit]);

  // Reset to changes view when entering worktree mode
  useEffect(() => {
    if (isWorktreeView && sidebarView === "history") {
      useGitStore.getState().setSidebarView("changes");
    }
  }, [isWorktreeView, sidebarView]);

  // ── Refresh handler ──

  const handleRefresh = useCallback(async () => {
    if (!gitRoot) return;
    await refreshStatus(gitRoot);
    await refreshBranches(gitRoot);
  }, [gitRoot, refreshStatus, refreshBranches]);

  const stagedCount = useMemo(
    () => files.filter((f) => f.staged).length,
    [files],
  );

  // ── Filtered files ──

  const filteredFiles = useMemo(() => {
    switch (filterMode) {
      case "staged":
        return files.filter((f) => f.staged);
      case "unstaged":
        return files.filter((f) => f.unstaged || f.untracked);
      case "all":
        return files;
    }
  }, [files, filterMode]);

  const totalAdded = useMemo(
    () => filteredFiles.reduce((s, f) => s + f.added, 0),
    [filteredFiles],
  );
  const totalDeleted = useMemo(
    () => filteredFiles.reduce((s, f) => s + f.deleted, 0),
    [filteredFiles],
  );
  const allStaged = filteredFiles.length > 0 && filteredFiles.every((f) => f.staged || f.worktreeStatus === "D");
  const someStaged = !allStaged && filteredFiles.some((f) => f.staged);

  const unitDisplay =
    gitRoot && projectRoot
      ? gitRoot.replace(projectRoot, "").replace(/^\//, "") || gitRoot.split(/[/\\]/).pop() || ""
      : (gitRoot || "").split(/[/\\]/).pop() || "";

  // ── Not a git repo ──

  if (!isGitRepo && !checkingRepo) {
    return (
      <>
        <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between px-3">
          <span className="truncate text-[length:var(--font-size-12)] font-medium text-muted-foreground">
            Git
          </span>
        </SidebarHeader>
        <SidebarContent className="px-2 py-1">
          <div className="px-2 py-4 text-[length:var(--font-size-12)] text-muted-foreground text-center">
            <p>{unitDisplay || "No git repository"}</p>
          </div>
        </SidebarContent>
      </>
    );
  }

  // ── Normal git view ──

  return (
    <>
      {/* ─── Header — filter dropdown (changes) or branch info (history) ─── */}
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center gap-1 px-3">
        {sidebarView === "history" && !isWorktreeView ? (
          <>
            <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs font-medium text-muted-foreground">
              {branch && branch.startsWith("wt-")
                ? (activeWorktree?.baseBranch || branch)
                : branch || "(no branch)"}
            </span>
            <span className="text-muted-foreground/30 shrink-0 select-none">·</span>
            <span className="text-xs text-muted-foreground/60 shrink-0">
              {commits.length} commit{commits.length !== 1 ? "s" : ""}
            </span>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <span>
                  {filterMode === "all" ? "All Changes" : filterMode === "staged" ? "Staged" : "Unstaged"}
                </span>
                <ChevronDownIcon className="size-3 opacity-40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuItem
                onClick={() => useGitStore.getState().setFilterMode("all")}
                className={cn("cursor-pointer text-xs gap-2", filterMode === "all" && "bg-accent font-medium")}
              >
                <span className="flex-1">All Changes</span>
                {filterMode === "all" && <CheckIcon className="size-3" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => useGitStore.getState().setFilterMode("staged")}
                className={cn("cursor-pointer text-xs gap-2", filterMode === "staged" && "bg-accent font-medium")}
              >
                <span className="flex-1">Staged</span>
                {filterMode === "staged" && <CheckIcon className="size-3" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => useGitStore.getState().setFilterMode("unstaged")}
                className={cn("cursor-pointer text-xs gap-2", filterMode === "unstaged" && "bg-accent font-medium")}
              >
                <span className="flex-1">Unstaged</span>
                {filterMode === "unstaged" && <CheckIcon className="size-3" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex-1" />

        {/* Refresh */}
        <button
          type="button"
          onClick={handleRefresh}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCwIcon className="size-3.5" />
        </button>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-auto">
        {/* ─── Checking / loading state ─── */}
        {checkingRepo ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground/30" />
          </div>
        ) : (sidebarView === "history" && !isWorktreeView) ? (
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
          <>
            {/* ─── Changes file list ─── */}

            {/* Section header — sticky, stays pinned while file list scrolls */}
            <div className="flex items-center gap-1.5 px-3.5 py-1 sticky top-0 bg-sidebar z-10">
              {/* Select all checkbox */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (allStaged) {
                    const paths = filteredFiles.filter((f) => f.staged).map((f) => f.path);
                    useGitStore.getState().unstageAll(gitRoot!, paths);
                  } else {
                    const paths = filteredFiles.filter((f) => !f.staged).map((f) => f.path);
                    useGitStore.getState().stageAll(gitRoot!, paths);
                  }
                }}
                className={cn(
                  "size-3 rounded-sm border shrink-0 flex items-center justify-center transition-colors",
                  someStaged && !allStaged
                    ? "bg-primary/40 border-primary"
                    : allStaged
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40 hover:border-muted-foreground",
                )}
                title={allStaged ? "Unstage all" : "Stage all"}
              >
                {allStaged && <CheckIcon className="size-2" />}
              </button>
              <span className="text-[length:var(--font-size-12)] font-medium text-muted-foreground/70">
                {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}{" "}
                {filterMode === "all" ? "Changes" : filterMode === "staged" ? "Staged" : "Unstaged"}
              </span>
              {(totalAdded > 0 || totalDeleted > 0) && (
                <span className="text-[11px] tabular-nums flex items-center gap-0.5 ml-auto">
                  {totalAdded > 0 && (
                    <span className="text-emerald-500">+{totalAdded}</span>
                  )}
                  {totalDeleted > 0 && (
                    <span className="text-red-400">-{totalDeleted}</span>
                  )}
                </span>
              )}
            </div>

            {/* File rows */}
            {filteredFiles.length === 0 ? (
              <div className="px-3 py-3 text-center">
                <p className="text-[length:var(--font-hint)] text-muted-foreground/60">
                  No changes — working tree clean
                </p>
              </div>
            ) : (
              <div className="space-y-0.5 px-2 mb-2">
                {filteredFiles.map((file) => (
                  <FileRow
                    key={file.id}
                    file={file}
                    gitRoot={gitRoot!}
                    isSelected={selectedFilePaths.includes(file.id)}
                  />
                ))}
              </div>
            )}

          </>
        )}
      </SidebarContent>
    </>
  );
}

// ─── File Row ───

function FileRow({
  file,
  gitRoot,
  isSelected,
}: {
  file: GitFileItem;
  gitRoot: string;
  isSelected: boolean;
}) {
  const fileName = file.path.split("/").pop() || file.path;
  const [hovered, setHovered] = useState(false);

  const handleClick = useCallback(() => {
    useGitStore.getState().toggleFile(file.id);
  }, [file.id]);

  const handleStageToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (file.staged) {
        useGitStore.getState().unstageFile(gitRoot, file.path);
      } else {
        useGitStore.getState().stageFile(gitRoot, file.path);
      }
    },
    [file.staged, file.path, gitRoot],
  );

  const handleDiscard = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm(`Discard changes to ${file.path}?`)) return;
      useGitStore.getState().discardFile(
        gitRoot,
        file.path,
        file.staged,
        file.untracked,
        file.worktreeStatus,
      );
    },
    [file.path, file.staged, file.untracked, file.worktreeStatus, gitRoot],
  );

  const showDiscard = hovered && (file.unstaged || file.untracked);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 h-6 px-1.5 rounded-sm group/file-row cursor-pointer transition-colors",
        isSelected
          ? "bg-accent"
          : "hover:bg-accent/50",
      )}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Stage checkbox — left side */}
      <button
        type="button"
        onClick={handleStageToggle}
        className={cn(
          "size-3 rounded-sm border shrink-0 flex items-center justify-center transition-colors",
          file.staged
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-muted-foreground",
        )}
        title={file.staged ? "Unstage" : "Stage"}
      >
        {file.staged && <CheckIcon className="size-2" />}
      </button>

      {/* Status dot */}
      <span
        className={cn(
          "size-1.5 rounded-full shrink-0",
          statusDotColor(file),
        )}
      />

      {/* File name */}
      <span className="truncate flex-1 text-[length:var(--font-size-12)]">
        {fileName}
      </span>

      {/* +/- counts */}
      {(file.added > 0 || file.deleted > 0) && (
        <span className="text-[10px] tabular-nums shrink-0 flex items-center gap-0.5">
          {file.added > 0 && (
            <span className="text-emerald-500">+{file.added}</span>
          )}
          {file.deleted > 0 && (
            <span className="text-red-400">-{file.deleted}</span>
          )}
        </span>
      )}

      {/* Discard button (visible on hover, only for unstaged/untracked) */}
      {showDiscard && (
        <button
          type="button"
          onClick={handleDiscard}
          className="size-3.5 rounded-sm flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
          title="Discard changes"
        >
          <Undo2Icon className="size-2.5" />
        </button>
      )}
    </div>
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
          No commits yet
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
