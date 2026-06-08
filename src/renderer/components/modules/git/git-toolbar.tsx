import { useMemo, useState, useCallback } from "react";
import {
  GitBranchIcon,
  GitMergeIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  SearchIcon,
  GitCommitHorizontalIcon,
  GitCommitVerticalIcon,
  FolderIcon,
  FolderGit2Icon,
  FileDiffIcon,
  FileCodeIcon,
  Maximize2Icon,
  Minimize2Icon,
  SparklesIcon,
  SettingsIcon,
} from "lucide-react";
import { useGitStore, type GitFilterMode, type GitViewMode } from "@/stores/git-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useDocumentStore } from "@/stores/document-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ───

interface GitToolbarProps {
  projectRoot: string;
}

const FILTER_OPTIONS: { mode: GitFilterMode; label: string }[] = [
  { mode: "all", label: "Uncommitted" },
  { mode: "staged", label: "Staged" },
  { mode: "unstaged", label: "Unstaged" },
];

// ─── Component ───

/** Internal worktree branches are managed by Prism — hide them from the git UI. */
const WT_PREFIX = "wt-";

export function GitToolbar({ projectRoot }: GitToolbarProps) {
  const branch = useGitStore((s) => s.branch);
  const allBranches = useGitStore((s) => s.branches);
  // Filter out internal wt-* worktree branches — they belong to Prism, not the user
  const branches = useMemo(() => allBranches.filter((b) => !b.startsWith(WT_PREFIX)), [allBranches]);
  const filterMode = useGitStore((s) => s.filterMode);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const files = useGitStore((s) => s.files);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const viewMode = useGitStore((s) => s.viewMode);
  const switching = useGitStore((s) => s.switching);
  const gitRoot = unitRoot ?? projectRoot;

  const [branchSearch, setBranchSearch] = useState("");
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Merge state
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeConfirmBranch, setMergeConfirmBranch] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const stagedCount = useMemo(() => files.filter((f) => f.staged).length, [files]);
  const totalStagedAdded = useMemo(
    () => files.filter((f) => f.staged).reduce((s, f) => s + f.added, 0),
    [files],
  );
  const totalStagedDeleted = useMemo(
    () => files.filter((f) => f.staged).reduce((s, f) => s + f.deleted, 0),
    [files],
  );

  const handleCommit = useCallback(async () => {
    if (!gitRoot || !commitMsg.trim()) return;
    setCommitting(true);
    try {
      await useGitStore.getState().commitChanges(gitRoot, commitMsg.trim());
      setCommitMsg("");
      setCommitOpen(false);
    } finally {
      setCommitting(false);
    }
  }, [gitRoot, commitMsg]);

  const branchLabel = checkingRepo ? "..." : (branch || "(no branch)");

  // ── Counts ──

  const counts = useMemo(() => {
    const staged = files.filter((f) => f.staged).length;
    const unstaged = files.filter((f) => f.unstaged || f.untracked).length;
    return { stagedCount: staged, unstagedCount: unstaged, allCount: files.length };
  }, [files]);

  // ── Filtered branches ──

  const filteredBranches = useMemo(() => {
    if (!branchSearch.trim()) return branches;
    const q = branchSearch.toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, branchSearch]);

  // ── Handlers ──

  const handleBranchOpenChange = useCallback((open: boolean) => {
    setBranchOpen(open);
  }, []);

  const handleBranchSelect = useCallback(
    (branchName: string) => {
      setBranchOpen(false);
      setBranchSearch("");
      if (!gitRoot || !branchName || branchName === branch) return;
      useGitStore.getState().switchBranch(gitRoot, branchName);
    },
    [gitRoot, branch],
  );

  // ── Merge handlers ──

  const mergeCandidates = useMemo(
    () => branches.filter((b) => b !== branch),
    [branches, branch],
  );

  const filteredMergeCandidates = useMemo(() => {
    if (!mergeSearch.trim()) return mergeCandidates;
    const q = mergeSearch.toLowerCase();
    return mergeCandidates.filter((b) => b.toLowerCase().includes(q));
  }, [mergeCandidates, mergeSearch]);

  // Step 1: select a branch → show confirmation
  const handleMergeSelect = useCallback((sourceBranch: string) => {
    setMergeConfirmBranch(sourceBranch);
  }, []);

  // Step 2: confirm and execute
  const handleMergeConfirm = useCallback(async () => {
    if (!gitRoot || !mergeConfirmBranch) return;
    setMerging(true);
    try {
      await useGitStore.getState().mergeBranch(gitRoot, mergeConfirmBranch);
      setMergeOpen(false);
      setMergeSearch("");
      setMergeConfirmBranch(null);
    } finally {
      setMerging(false);
    }
  }, [gitRoot, mergeConfirmBranch]);

  // Cancel confirmation → back to selection
  const handleMergeCancel = useCallback(() => {
    setMergeConfirmBranch(null);
  }, []);

  // Reset everything when dialog opens/closes
  const handleMergeOpenChange = useCallback((open: boolean) => {
    setMergeOpen(open);
    if (!open) {
      setMergeConfirmBranch(null);
      setMergeSearch("");
    }
  }, []);

  const handleCreateBranch = useCallback(async () => {
    const name = newBranchName.trim();
    if (!name || !gitRoot) return;
    setCreatingBranch(true);
    try {
      await useGitStore.getState().createBranch(gitRoot, name);
      setBranchDialogOpen(false);
      setBranchOpen(false);
      setNewBranchName("");
    } catch {
      // error is set in the store
    } finally {
      setCreatingBranch(false);
    }
  }, [newBranchName, gitRoot]);

  const handleFilterMode = useCallback((mode: GitFilterMode) => {
    useGitStore.getState().setFilterMode(mode);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!gitRoot) return;
    // Run sequentially — avoid race between refreshStatus & refreshBranches
    await useGitStore.getState().refreshStatus(gitRoot);
    await useGitStore.getState().refreshBranches(gitRoot);
  }, [gitRoot]);

  const handleToggleView = useCallback(() => {
    const next: GitViewMode = viewMode === "changes" ? "history" : "changes";
    useGitStore.getState().setViewMode(next);
    if (next === "history") {
      useGitStore.getState().loadHistory(gitRoot);
    }
  }, [viewMode, gitRoot]);

  if (!isGitRepo) {
    // Non-git unit: show minimal toolbar
    const unitDisplay = gitRoot && projectRoot
    ? gitRoot.replace(projectRoot, "").replace(/^\//, "") || gitRoot.split(/[/\\]/).pop() || ""
    : (gitRoot || "").split(/[/\\]/).pop() || "";
    return (
      <div className="flex flex-1 items-center gap-1.5 min-h-8 text-xs text-muted-foreground">
        <FolderIcon className="size-3.5 shrink-0" />
        <span className="truncate">{unitDisplay}</span>
        <span className="opacity-50">— not a git repository</span>
      </div>
    );
  }

  const unitDisplay = gitRoot && projectRoot
    ? gitRoot.replace(projectRoot, "").replace(/^\//, "") || gitRoot.split(/[/\\]/).pop() || ""
    : (gitRoot || "").split(/[/\\]/).pop() || "";

  return (
    <div className="flex flex-1 items-center gap-0.5 min-h-8">
      {/* ── Unit name ── */}
      <span className="flex items-center gap-1.5 pr-2 text-xs text-muted-foreground shrink-0">
        <FolderGit2Icon className="size-3.5 shrink-0" />
        <span className="truncate max-w-[180px]">{unitDisplay}</span>
      </span>
      <div className="h-4 w-px bg-border/60 shrink-0" />

      {/* ── Branch Selector ── */}
      <DropdownMenu open={branchOpen} onOpenChange={handleBranchOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 h-6 px-2 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors max-w-[160px]"
          >
            {switching ? (
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <GitBranchIcon className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{switching ? "Switching…" : branchLabel}</span>
            <ChevronsUpDownIcon className="size-3 shrink-0 opacity-40" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground/50 outline-none"
              placeholder="Filter branches..."
              value={branchSearch}
              onChange={(e) => setBranchSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <DropdownMenuSeparator />
          <div className="max-h-48 overflow-y-auto">
            {filteredBranches.length === 0 ? (
              <p className="px-2 py-3 text-xs text-center text-muted-foreground">
                No branches found
              </p>
            ) : (
              filteredBranches.map((b) => {
                const isCurrent = b === branch;
                return (
                  <DropdownMenuItem
                    key={b}
                    onClick={() => handleBranchSelect(b)}
                    className={cn(
                      "cursor-pointer gap-2",
                      isCurrent && "bg-accent font-medium",
                    )}
                  >
                    <GitBranchIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        isCurrent ? "text-foreground" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate flex-1">{b}</span>
                    {isCurrent && <CheckIcon className="size-3.5 shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </div>
          <DropdownMenuSeparator />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => {
              setBranchOpen(false);
              setBranchDialogOpen(true);
            }}
          >
            <span className="text-base leading-none">+</span>
            <span>New Branch</span>
          </button>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Create branch dialog (outside DropdownMenu to avoid Radix nesting issues) ── */}
      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create new branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderGit2Icon className="size-3.5 shrink-0" />
              <span className="truncate">{unitDisplay}</span>
            </div>
            <input
              className="w-full bg-muted/50 border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Branch name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateBranch();
                }
              }}
              autoFocus
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || creatingBranch}
                className="flex items-center gap-2 h-8 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creatingBranch ? "Creating..." : "Create branch"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Merge Button ── */}
      <Dialog open={mergeOpen} onOpenChange={handleMergeOpenChange}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 h-6 px-1.5 rounded text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            title={`Merge another branch into ${branch || "current"}`}
          >
            <GitMergeIcon className="size-3.5" />
            <span className="hidden xl:inline">Merge</span>
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          {mergeConfirmBranch ? (
            /* ── Step 2: Confirmation ── */
            <>
              <DialogHeader>
                <DialogTitle>Confirm merge</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Visual flow */}
                <div className="flex items-center justify-center gap-3 py-2">
                  <span className="flex items-center gap-2 text-[length:var(--font-size-13)] text-foreground">
                    <GitBranchIcon className="size-4 shrink-0" />
                    <span className="truncate max-w-[120px]">{mergeConfirmBranch}</span>
                  </span>
                  <GitMergeIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex items-center gap-2 text-[length:var(--font-size-13)] text-primary">
                    <GitBranchIcon className="size-4 shrink-0" />
                    <span className="truncate max-w-[120px]">{branch || "current"}</span>
                  </span>
                </div>
                {/* Description */}
                <p className="text-[length:var(--font-size-12)] text-muted-foreground text-center leading-relaxed">
                  Merge all commits from{" "}
                  <span className="font-medium text-foreground">{mergeConfirmBranch}</span>
                  {" "}into{" "}
                  <span className="font-medium text-primary">{branch || "the current branch"}</span>.
                </p>
                {/* Actions */}
                <div className="flex gap-2 justify-end pt-1">
                  <Button variant="outline" size="sm" onClick={handleMergeCancel} disabled={merging}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleMergeConfirm} disabled={merging}>
                    {merging ? (
                      "Merging..."
                    ) : (
                      <>
                        <GitMergeIcon className="size-3.5" />
                        Merge
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* ── Step 1: Branch selection ── */
            <>
              <DialogHeader>
                <DialogTitle>Merge branch</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {/* Direction indicator */}
                <p className="text-[length:var(--font-size-12)] text-muted-foreground text-center">
                  Select a branch to merge into{" "}
                  <span className="font-medium text-foreground">{branch || "the current branch"}</span>
                </p>
                {/* Search */}
                <div className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-3 py-2">
                  <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    className="flex-1 bg-transparent text-[length:var(--font-size-12)] placeholder:text-muted-foreground/50 outline-none"
                    placeholder="Filter branches..."
                    value={mergeSearch}
                    onChange={(e) => setMergeSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                {/* Branch list */}
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {filteredMergeCandidates.length === 0 ? (
                    <p className="px-3 py-6 text-[length:var(--font-size-12)] text-center text-muted-foreground">
                      {mergeCandidates.length === 0 ? "No other branches to merge" : "No branches match"}
                    </p>
                  ) : (
                    filteredMergeCandidates.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => handleMergeSelect(b)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <GitBranchIcon className="size-3.5 shrink-0" />
                        <span className="truncate flex-1 text-left">{b}</span>
                        <span className="text-[length:var(--font-size-10)] text-muted-foreground/50 shrink-0 tabular-nums">
                          → {branch || "current"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Filter Toggle (changes mode only) ── */}
      {viewMode === "changes" && (
        <div className="flex items-center gap-0.5">
          {FILTER_OPTIONS.map((opt) => {
            const active = filterMode === opt.mode;
            const count =
              opt.mode === "unstaged"
                ? counts.unstagedCount
                : opt.mode === "staged"
                  ? counts.stagedCount
                  : counts.allCount;
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => handleFilterMode(opt.mode)}
                className={`flex items-center gap-1 h-6 px-2 rounded text-xs transition-colors ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {opt.label}
                <span className="tabular-nums opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Commit ── */}
      <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={stagedCount === 0}
            className="flex items-center justify-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0 disabled:opacity-30"
            title="Commit staged changes"
          >
            <GitCommitHorizontalIcon className="size-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Commit changes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <FolderGit2Icon className="size-3.5 shrink-0" />
                <span className="truncate">{unitDisplay}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <GitBranchIcon className="size-3.5 shrink-0" />
                <span className="truncate">{branch}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileDiffIcon className="size-3.5 shrink-0" />
                <span>{stagedCount} file{stagedCount !== 1 ? "s" : ""}</span>
              </div>
              {(totalStagedAdded > 0 || totalStagedDeleted > 0) && (
                <div className="flex items-center gap-1.5 tabular-nums">
                  <span className="text-emerald-500">+{totalStagedAdded}</span>
                  <span className="text-red-400">-{totalStagedDeleted}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-center size-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? (
                  <Minimize2Icon className="size-3" />
                ) : (
                  <Maximize2Icon className="size-3" />
                )}
              </button>
              <div className="flex-1" />
              {/* TODO: AI-powered commit message generation.
                  Call an LLM with the staged diff to produce a
                  conventional-commit style message, then populate
                  the textarea with the result. */}
              <button
                type="button"
                disabled
                className="flex items-center justify-center size-5 rounded text-muted-foreground opacity-30 cursor-not-allowed"
                title="AI generate message (coming soon)"
              >
                <SparklesIcon className="size-3" />
              </button>
              {/* TODO: Open settings panel scrolled to the commit-message
                  formatting section so users can configure templates,
                  sign-off behaviour, or character limits. */}
              <button
                type="button"
                disabled
                className="flex items-center justify-center size-5 rounded text-muted-foreground opacity-30 cursor-not-allowed"
                title="Commit message settings (coming soon)"
              >
                <SettingsIcon className="size-3" />
              </button>
            </div>
            <textarea
              className="w-full bg-muted/50 border rounded-md px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-ring"
              placeholder="Commit message"
              rows={expanded ? 10 : 4}
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleCommit();
                }
              }}
              autoFocus
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCommit}
                disabled={!commitMsg.trim() || committing}
                className="flex items-center gap-2 h-8 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {committing ? "Committing..." : "Commit"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── .gitignore ── */}
      <button
        type="button"
        onClick={async () => {
          const ignorePath = `${gitRoot}/.gitignore`;
          const exists = await window.electronAPI.fsExists(ignorePath);
          if (!exists) {
            const defaults = [
              "*.aux", "*.log", "*.out", "*.toc", "*.bbl", "*.blg",
              "*.synctex.gz", "*.fdb_latexmk", "*.fls", "*.xdv",
              ".prismnext/compile/", ".prism-worktree-meta", ".DS_Store",
            ].join("\n");
            await window.electronAPI.fsWrite(ignorePath, defaults);
            if (projectRoot) {
              try {
                const result = await window.electronAPI.fsScan(projectRoot);
                useDocumentStore.setState({
                  files: result.files.map((f: any) => ({
                    id: f.relativePath,
                    name: f.relativePath.split("/").pop() || f.relativePath,
                    relativePath: f.relativePath,
                    absolutePath: f.absolutePath,
                    type: f.type,
                    fileSize: f.fileSize,
                  })),
                  folders: result.folders,
                } as any);
              } catch { /* ok */ }
            }
          }
          const relPath = projectRoot
            ? ignorePath.replace(projectRoot, "").replace(/^\//, "")
            : ".gitignore";
          useRightPanelStore.getState().openFile(relPath, relPath, ".gitignore");
        }}
        className="flex items-center justify-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title="Edit .gitignore"
      >
        <FileCodeIcon className="size-3.5" />
      </button>

      {/* ── History Toggle ── */}
      <button
        type="button"
        onClick={handleToggleView}
        className={`flex items-center justify-center size-6 rounded transition-colors shrink-0 ${
          viewMode === "history"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
        title={viewMode === "history" ? "View changes" : "View history"}
      >
        {viewMode === "history" ? (
          <FileDiffIcon className="size-3.5" />
        ) : (
          <GitCommitVerticalIcon className="size-3.5" />
        )}
      </button>
    </div>
  );
}
