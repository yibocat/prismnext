import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  GitBranchIcon,
  GitMergeIcon,
  GitCommitHorizontalIcon,
  GitCommitVerticalIcon,
  EllipsisIcon,
  ArrowUpIcon,
  WorkflowIcon,
  SearchIcon,
  CheckIcon,
  Loader2Icon,
  LaptopIcon,
  PlusIcon,
} from "lucide-react";
import { useGitStore } from "@/stores/git-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GitPushDialog } from "./git-push-dialog";

// ─── Constants ───

const WT_PREFIX = "wt-";

// ─── Component ───

export function GitToolbar({ projectRoot }: { projectRoot: string }) {
  const branch = useGitStore((s) => s.branch);
  const allBranches = useGitStore((s) => s.branches);
  const branches = useMemo(
    () => allBranches.filter((b) => !b.startsWith(WT_PREFIX)),
    [allBranches],
  );
  const unitRoot = useGitStore((s) => s.unitRoot);
  const switching = useGitStore((s) => s.switching);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const files = useGitStore((s) => s.files);
  const sidebarView = useGitStore((s) => s.sidebarView);

  const gitRoot = unitRoot ?? projectRoot;

  // ── Worktree mode detection ──
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const allWorktrees = useWorktreeStore((s) => s.worktrees);
  const checkoutRoot = useDocumentStore((s) => s.checkoutRoot);
  const isWorktreeView = !!(
    activeWorktree &&
    checkoutRoot &&
    checkoutRoot === activeWorktree.path
  );

  // Cache the project branch so wt-* never flashes during transitions.
  const lastProjectBranch = useRef(
    branch && !branch.startsWith(WT_PREFIX)
      ? branch
      : activeWorktree?.baseBranch || ""
  );
  useEffect(() => {
    if (branch && !branch.startsWith(WT_PREFIX)) {
      lastProjectBranch.current = branch;
    }
  }, [branch]);

  // Resolve branch label — wt-* branch names are NEVER shown.
  const branchLabel = (() => {
    if (checkingRepo) return "...";
    const raw = branch || "";
    if (!raw.startsWith(WT_PREFIX)) return raw || "(no branch)";
    // raw is wt-*: show base branch or cached project branch
    return activeWorktree?.baseBranch
      || lastProjectBranch.current
      || "(no branch)";
  })();

  // Worktrees whose base branch matches the current project branch.
  // When gitStore.branch is a wt-* worktree branch (e.g. during view
  // transitions), fall back to activeWorktree.baseBranch so the Local
  // dropdown doesn't disappear.
  const worktreesOnBranch = useMemo(
    () => {
      const projectBranch = branch.startsWith(WT_PREFIX) && activeWorktree
        ? activeWorktree.baseBranch
        : branch;
      return allWorktrees.filter((w) => w.baseBranch === projectBranch);
    },
    [allWorktrees, branch, activeWorktree],
  );

  // Branch selector state
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);

  const filteredBranches = useMemo(() => {
    if (!branchSearch.trim()) return branches;
    const q = branchSearch.toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, branchSearch]);

  const handleBranchSelect = useCallback(
    (branchName: string) => {
      setBranchOpen(false);
      setBranchSearch("");
      if (!projectRoot || !branchName || branchName === branchLabel) return;
      useGitStore.getState().switchBranch(projectRoot, branchName);
    },
    [projectRoot, branchLabel],
  );

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

  // Merge state
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeConfirmBranch, setMergeConfirmBranch] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const mergeCandidates = useMemo(() => branches.filter((b) => b !== branchLabel), [branches, branchLabel]);
  const filteredMergeCandidates = useMemo(() => {
    if (!mergeSearch.trim()) return mergeCandidates;
    return mergeCandidates.filter((b) => b.toLowerCase().includes(mergeSearch.toLowerCase()));
  }, [mergeCandidates, mergeSearch]);

  // Commit state
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const stagedCount = useMemo(() => files.filter((f) => f.staged).length, [files]);

  // ── Compact mode: hide button labels when toolbar is too narrow ──
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setCompact(el.clientWidth < 420);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleCommit = useCallback(async () => {
    if (!gitRoot || !commitMsg.trim()) return;
    setCommitting(true);
    try {
      await useGitStore.getState().commitChanges(gitRoot, commitMsg.trim());
      setCommitMsg("");
      setCommitOpen(false);
    } finally { setCommitting(false); }
  }, [gitRoot, commitMsg]);

  // ── Worktree mode toolbar ──
  if (isWorktreeView && activeWorktree) {
    return (
      <div ref={toolbarRef} className="flex flex-1 items-center gap-1 min-h-8 min-w-0 overflow-hidden">
        {/* Branch selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 h-6 px-2 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors max-w-[140px]">
              {switching ? <Loader2Icon className="size-3.5 shrink-0 animate-spin" /> : <GitBranchIcon className="size-3.5 shrink-0" />}
              <span className="truncate">{switching ? "Switching…" : branchLabel}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
              <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <input className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground/50 outline-none" placeholder="Filter branches..." value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)} onClick={(e) => e.stopPropagation()} />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-48 overflow-y-auto">
              {filteredBranches.length === 0 ? (
                <p className="px-2 py-3 text-xs text-center text-muted-foreground">No branches found</p>
              ) : (
                filteredBranches.map((b) => (
                  <DropdownMenuItem key={b} onClick={() => {
                    if (!projectRoot || b === branchLabel) return;
                    useGitStore.getState().switchBranch(projectRoot, b);
                    useWorktreeStore.getState().setMode("local");
                    useDocumentStore.getState().switchCheckoutRoot(projectRoot);
                  }} className={cn("cursor-pointer gap-2", b === branchLabel && "bg-accent font-medium")}>
                    <GitBranchIcon className={cn("size-3.5 shrink-0", b === branchLabel ? "text-foreground" : "text-muted-foreground")} />
                    <span className="truncate flex-1">{b}</span>
                    {b === branchLabel && <CheckIcon className="size-3.5 shrink-0" />}
                  </DropdownMenuItem>
                ))
              )}
            </div>
            <DropdownMenuSeparator />
            <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => setBranchDialogOpen(true)}>
              <PlusIcon className="size-3.5" /><span>New Branch</span>
            </button>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-muted-foreground/50 shrink-0 text-xs select-none">/</span>

        {/* Worktree indicator */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1 h-6 px-1 rounded text-xs hover:bg-accent transition-colors">
              <WorkflowIcon className="size-3.5 shrink-0 text-primary" />
              <span className="truncate max-w-[80px] text-primary font-medium">{activeWorktree.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => {
              if (projectRoot) {
                useWorktreeStore.getState().setMode("local");
                useDocumentStore.getState().switchCheckoutRoot(projectRoot);
              }
            }}>
              <LaptopIcon className="size-3.5 shrink-0" /><span className="flex-1">Local</span>
            </DropdownMenuItem>
            {worktreesOnBranch.filter((w) => w.name !== activeWorktree.name).length > 0 && (
              <>
                <DropdownMenuSeparator />
                {worktreesOnBranch.filter((w) => w.name !== activeWorktree.name).map((w) => (
                  <DropdownMenuItem key={w.name} className="cursor-pointer gap-2 text-xs" onClick={() => {
                    useWorktreeStore.getState().selectExistingWorktree(w);
                    useDocumentStore.getState().switchCheckoutRoot(w.path);
                  }}>
                    <WorkflowIcon className="size-3.5 shrink-0" /><span className="truncate flex-1">{w.name}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        <button type="button" onClick={() => setPushDialogOpen(true)} className="flex items-center gap-1 h-6 px-2 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <ArrowUpIcon className="size-3.5" />{!compact && <span>Push</span>}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center justify-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="More actions"><EllipsisIcon className="size-3.5" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem className="cursor-pointer text-xs" disabled>Stash changes</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-xs" disabled>Pop stash</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <GitPushDialog open={pushDialogOpen} onOpenChange={setPushDialogOpen} projectRoot={projectRoot} />

        {/* Create branch dialog — shared with normal mode */}
        <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Create new branch</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <input className="w-full bg-muted/50 border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder="Branch name" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateBranch(); } }} autoFocus />
              <div className="flex justify-end">
                <button type="button" onClick={handleCreateBranch} disabled={!newBranchName.trim() || creatingBranch} className="flex items-center gap-2 h-8 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {creatingBranch ? "Creating..." : "Create branch"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (!isGitRepo) {
    return (
      <div className="flex flex-1 items-center gap-1.5 min-h-8 text-xs text-muted-foreground">
        <GitBranchIcon className="size-3.5 shrink-0 opacity-40" />
        <span>Not a git repository</span>
      </div>
    );
  }

  return (
    <div ref={toolbarRef} className="flex flex-1 items-center gap-1 min-h-8 min-w-0 overflow-hidden">
      {/* Branch selector */}
      <DropdownMenu open={branchOpen} onOpenChange={setBranchOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-1.5 h-6 px-2 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors max-w-[140px]">
            {switching ? <Loader2Icon className="size-3.5 shrink-0 animate-spin" /> : <GitBranchIcon className="size-3.5 shrink-0" />}
            <span className="truncate">{switching ? "Switching…" : branchLabel}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <input className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground/50 outline-none" placeholder="Filter branches..." value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)} onClick={(e) => e.stopPropagation()} />
          </div>
          <DropdownMenuSeparator />
          <div className="max-h-48 overflow-y-auto">
            {filteredBranches.length === 0 ? (
              <p className="px-2 py-3 text-xs text-center text-muted-foreground">No branches found</p>
            ) : (
              filteredBranches.map((b) => {
                const isCurrent = b === branchLabel;
                return (
                  <DropdownMenuItem key={b} onClick={() => handleBranchSelect(b)} className={cn("cursor-pointer gap-2", isCurrent && "bg-accent font-medium")}>
                    <GitBranchIcon className={cn("size-3.5 shrink-0", isCurrent ? "text-foreground" : "text-muted-foreground")} />
                    <span className="truncate flex-1">{b}</span>
                    {isCurrent && <CheckIcon className="size-3.5 shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </div>
          <DropdownMenuSeparator />
          <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { setBranchOpen(false); setBranchDialogOpen(true); }}>
            <PlusIcon className="size-3.5" /><span>New Branch</span>
          </button>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="text-muted-foreground/50 shrink-0 text-xs select-none">/</span>

      {/* Local indicator */}
      {worktreesOnBranch.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1 h-6 px-1 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <LaptopIcon className="size-3.5 shrink-0" />
              <span>Local</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {worktreesOnBranch.map((w) => (
              <DropdownMenuItem key={w.name} className="cursor-pointer gap-2 text-xs" onClick={() => {
                useWorktreeStore.getState().selectExistingWorktree(w);
                useDocumentStore.getState().switchCheckoutRoot(w.path);
              }}>
                <WorkflowIcon className="size-3.5 shrink-0" /><span className="truncate flex-1">{w.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" className="flex items-center gap-1 h-6 px-1 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          <LaptopIcon className="size-3.5 shrink-0" />
          <span>Local</span>
        </button>
      )}

      {/* Create branch dialog */}
      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create new branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input className="w-full bg-muted/50 border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder="Branch name" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateBranch(); } }} autoFocus />
            <div className="flex justify-end">
              <button type="button" onClick={handleCreateBranch} disabled={!newBranchName.trim() || creatingBranch} className="flex items-center gap-2 h-8 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                {creatingBranch ? "Creating..." : "Create branch"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex-1" />

      {sidebarView !== "history" && (
      <>
      {/* Merge button */}
      <Dialog open={mergeOpen} onOpenChange={(o) => { setMergeOpen(o); if (!o) { setMergeConfirmBranch(null); setMergeSearch(""); } }}>
        <DialogTrigger asChild>
          <button type="button" className="flex items-center gap-1 h-6 px-1.5 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Merge branch">
            <GitMergeIcon className="size-3.5" />
            {!compact && <span>Merge</span>}
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          {mergeConfirmBranch ? (
            <>
              <DialogHeader><DialogTitle>Confirm merge</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 py-2">
                  <span className="flex items-center gap-2 text-sm"><GitBranchIcon className="size-4" /><span className="truncate max-w-[120px]">{mergeConfirmBranch}</span></span>
                  <GitMergeIcon className="size-4 text-muted-foreground" />
                  <span className="flex items-center gap-2 text-sm text-primary"><GitBranchIcon className="size-4" /><span className="truncate max-w-[120px]">{branchLabel}</span></span>
                </div>
                <p className="text-xs text-muted-foreground text-center">Merge <span className="font-medium text-foreground">{mergeConfirmBranch}</span> into <span className="font-medium text-primary">{branchLabel}</span>.</p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setMergeConfirmBranch(null)} disabled={merging}>Cancel</Button>
                  <Button size="sm" onClick={async () => {
                    if (!gitRoot || !mergeConfirmBranch) return;
                    setMerging(true);
                    try { await useGitStore.getState().mergeBranch(gitRoot, mergeConfirmBranch); setMergeOpen(false); setMergeSearch(""); setMergeConfirmBranch(null); }
                    finally { setMerging(false); }
                  }} disabled={merging}>{merging ? "Merging..." : "Merge"}</Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>Merge branch</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground text-center">Select a branch to merge into <span className="font-medium text-foreground">{branchLabel}</span></p>
                <div className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-3 py-2">
                  <SearchIcon className="size-3.5 text-muted-foreground" />
                  <input className="flex-1 bg-transparent text-xs outline-none" placeholder="Filter branches..." value={mergeSearch} onChange={(e) => setMergeSearch(e.target.value)} autoFocus />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {filteredMergeCandidates.length === 0 ? (
                    <p className="px-3 py-6 text-xs text-center text-muted-foreground">{mergeCandidates.length === 0 ? "No other branches" : "No matches"}</p>
                  ) : filteredMergeCandidates.map((b) => (
                    <button key={b} type="button" onClick={() => setMergeConfirmBranch(b)} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors">
                      <GitBranchIcon className="size-3.5" /><span className="truncate flex-1 text-left">{b}</span><span className="text-[length:var(--font-size-10)] text-muted-foreground/50">→ {branchLabel}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Commit button */}
      <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
        <DialogTrigger asChild>
          <button type="button" disabled={stagedCount === 0} className={cn(
            "flex items-center gap-1 h-6 px-1.5 rounded text-xs transition-colors",
            stagedCount > 0
              ? "border border-primary/40 text-primary hover:bg-primary/10"
              : "text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30",
          )} title="Commit staged changes">
            <GitCommitHorizontalIcon className="size-3.5" />
            {!compact && <span>Commit</span>}
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Commit changes</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GitBranchIcon className="size-3.5" /><span className="truncate">{branchLabel}</span>
              <span className="tabular-nums">{stagedCount} file{stagedCount !== 1 ? "s" : ""}</span>
            </div>
            <textarea className="w-full bg-muted/50 border rounded-md px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-ring" placeholder="Commit message" rows={4} value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleCommit(); } }} autoFocus />
            <div className="flex justify-end">
              <button type="button" onClick={handleCommit} disabled={!commitMsg.trim() || committing} className="flex items-center gap-2 h-8 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                {committing ? "Committing..." : "Commit"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>
      )}

      {/* History button */}
      <button
        type="button"
        onClick={() => {
          const store = useGitStore.getState();
          store.setSidebarView(store.sidebarView === "history" ? "changes" : "history");
        }}
        className={cn(
          "flex items-center gap-1 h-6 px-1.5 rounded text-xs transition-colors",
          sidebarView === "history"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        title="View history"
      >
        <GitCommitVerticalIcon className="size-3.5" />
        {!compact && <span>History</span>}
      </button>

      {/* More actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center justify-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="More actions">
            <EllipsisIcon className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem className="cursor-pointer text-xs" disabled>Stash changes</DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer text-xs" disabled>Pop stash</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer text-xs" disabled>Edit .gitignore</DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer text-xs" disabled>Abort merge</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
