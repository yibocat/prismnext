import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  GitBranchIcon,
  GitMergeIcon,
  GitCommitVerticalIcon,
  WorkflowIcon,
  SearchIcon,
  Loader2Icon,
  LaptopIcon,
} from "lucide-react";
import { useGitStore } from "@/stores/git-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { applyCheckoutTransition } from "@/lib/git/checkout-context";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
  appMenuFontClass,
  appMenuInputClass,
} from "@/components/ui/app-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GitWorktreeMergeDialog } from "./git-worktree-merge-dialog";
import { GitToolbarChangesAction } from "./git-toolbar-changes-action";
import { GitPanelOverflowMenu } from "./git-panel-overflow-menu";
import { GitSyncBadge } from "./git-sync-badge";
import { GitRemotePicker } from "./git-remote-picker";
import { GitRemoteAddDialog } from "./git-remote-add-dialog";
import { GitPrCreateDialog } from "./git-pr-create-dialog";
import { gitToolbarChipClass } from "./git-change-row-chrome";

const WT_PREFIX = "wt-";

const toolbarBtn = gitToolbarChipClass;

export function GitToolbar({ projectRoot }: { projectRoot: string }) {
  const { t } = useTranslation();
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
  const commits = useGitStore((s) => s.commits);

  const gitRoot = unitRoot ?? projectRoot;

  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const allWorktrees = useWorktreeStore((s) => s.worktrees);
  const checkoutRoot = useDocumentStore((s) => s.checkoutRoot);
  const isWorktreeView = !!(
    activeWorktree &&
    checkoutRoot &&
    checkoutRoot === activeWorktree.path
  );

  const lastProjectBranch = useRef(
    branch && !branch.startsWith(WT_PREFIX)
      ? branch
      : activeWorktree?.baseBranch || "",
  );
  useEffect(() => {
    if (branch && !branch.startsWith(WT_PREFIX)) {
      lastProjectBranch.current = branch;
    }
  }, [branch]);

  const branchLabel = (() => {
    if (checkingRepo) return "...";
    const raw = branch || "";
    if (!raw.startsWith(WT_PREFIX)) return raw || "(no branch)";
    return activeWorktree?.baseBranch
      || lastProjectBranch.current
      || "(no branch)";
  })();

  const worktreesOnBranch = useMemo(() => {
    const projectBranch = branch.startsWith(WT_PREFIX) && activeWorktree
      ? activeWorktree.baseBranch
      : branch;
    return allWorktrees.filter((w) => w.baseBranch === projectBranch);
  }, [allWorktrees, branch, activeWorktree]);

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
      if (isWorktreeView) {
        void applyCheckoutTransition({ type: "local" });
      }
    },
    [projectRoot, branchLabel, isWorktreeView],
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

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeConfirmBranch, setMergeConfirmBranch] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const mergeCandidates = useMemo(
    () => branches.filter((b) => b !== branchLabel),
    [branches, branchLabel],
  );
  const filteredMergeCandidates = useMemo(() => {
    if (!mergeSearch.trim()) return mergeCandidates;
    return mergeCandidates.filter((b) =>
      b.toLowerCase().includes(mergeSearch.toLowerCase()),
    );
  }, [mergeCandidates, mergeSearch]);

  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const stagedCount = useMemo(() => files.filter((f) => f.staged).length, [files]);

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
    } finally {
      setCommitting(false);
    }
  }, [gitRoot, commitMsg]);

  if (!isGitRepo) {
    return (
      <div className="flex flex-1 items-center gap-1.5 min-h-8 min-w-0 text-[length:var(--font-menu-item)] text-muted-foreground">
        <GitBranchIcon className="size-3.5 shrink-0 opacity-40" />
        <span className="truncate">{t("git.toolbar.notRepo")}</span>
      </div>
    );
  }

  const isChangesView = sidebarView === "changes";
  const otherWorktrees = worktreesOnBranch.filter(
    (w) => w.name !== activeWorktree?.name,
  );

  return (
    <div ref={toolbarRef} className="flex flex-1 items-center gap-1 min-h-8 min-w-0 overflow-hidden">
      {/* ── Left: branch + checkout context (stable across views) ── */}
      <AppMenu open={branchOpen} onOpenChange={setBranchOpen}>
        <AppMenuTrigger asChild>
          <button type="button" className={cn(toolbarBtn, "max-w-[140px]")}>
            {switching ? (
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <GitBranchIcon className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{switching ? t("git.toolbar.switching") : branchLabel}</span>
          </button>
        </AppMenuTrigger>
        <AppMenuContent align="start" className="w-56">
          <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              className={appMenuInputClass}
              placeholder={t("git.toolbar.filterBranches")}
              value={branchSearch}
              onChange={(e) => setBranchSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <AppMenuSeparator />
          <div className="max-h-48 overflow-y-auto">
            {filteredBranches.length === 0 ? (
              <p className={cn("px-2 py-3 text-center text-muted-foreground", appMenuFontClass)}>
                {t("git.toolbar.noBranchesFound")}
              </p>
            ) : (
              filteredBranches.map((b) => (
                <AppMenuCheckItem
                  key={b}
                  selected={b === branchLabel}
                  onClick={() => handleBranchSelect(b)}
                  className={cn(b === branchLabel && "font-medium")}
                >
                  {b}
                </AppMenuCheckItem>
              ))
            )}
          </div>
          <AppMenuSeparator />
          <AppMenuItem
            onClick={() => {
              setBranchOpen(false);
              setBranchDialogOpen(true);
            }}
          >
            {t("git.toolbar.newBranch")}
          </AppMenuItem>
        </AppMenuContent>
      </AppMenu>

      <span className="text-muted-foreground/50 shrink-0 text-[length:var(--font-menu-item)] select-none">/</span>

      {isWorktreeView && activeWorktree ? (
        <AppMenu>
          <AppMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 h-6 px-1 rounded text-[length:var(--font-menu-item)] hover:bg-accent transition-colors"
            >
              <WorkflowIcon className="size-3.5 shrink-0 text-primary" />
              <span className="truncate max-w-[80px] text-primary font-medium">
                {activeWorktree.name}
              </span>
            </button>
          </AppMenuTrigger>
          <AppMenuContent align="start" className="min-w-[8rem]">
            <AppMenuItem
              onClick={() => {
                if (projectRoot) void applyCheckoutTransition({ type: "local" });
              }}
            >
              {t("git.toolbar.local")}
            </AppMenuItem>
            {otherWorktrees.length > 0 && (
              <>
                <AppMenuSeparator />
                {otherWorktrees.map((w) => (
                  <AppMenuItem
                    key={w.name}
                    onClick={() => {
                      void applyCheckoutTransition({ type: "worktree-existing", worktree: w });
                    }}
                  >
                    {w.name}
                  </AppMenuItem>
                ))}
              </>
            )}
          </AppMenuContent>
        </AppMenu>
      ) : worktreesOnBranch.length > 0 ? (
        <AppMenu>
          <AppMenuTrigger asChild>
            <button type="button" className={cn(toolbarBtn, "px-1 gap-1")}>
              <LaptopIcon className="size-3.5 shrink-0" />
              <span>{t("git.toolbar.local")}</span>
            </button>
          </AppMenuTrigger>
          <AppMenuContent align="start" className="min-w-[8rem]">
            {worktreesOnBranch.map((w) => (
              <AppMenuItem
                key={w.name}
                onClick={() => {
                  void applyCheckoutTransition({ type: "worktree-existing", worktree: w });
                }}
              >
                {w.name}
              </AppMenuItem>
            ))}
          </AppMenuContent>
        </AppMenu>
      ) : (
        <button type="button" className={cn(toolbarBtn, "px-1 gap-1")}>
          <LaptopIcon className="size-3.5 shrink-0" />
          <span>{t("git.toolbar.local")}</span>
        </button>
      )}

      <div className="flex-1" />

      {/* ── Right: actions follow sidebar view ── */}
      {isChangesView ? (
        <>
          {!isWorktreeView ? <GitSyncBadge compact={compact} /> : null}
          <GitPanelOverflowMenu
            projectRoot={gitRoot}
            variant="changes"
            allowHosting={!isWorktreeView}
          />
          <GitToolbarChangesAction
          mode={isWorktreeView ? "worktree" : "local"}
          projectRoot={gitRoot}
          compact={compact}
          stagedCount={stagedCount}
          onMerge={() => {
            if (isWorktreeView) setMergeDialogOpen(true);
            else setMergeOpen(true);
          }}
          onCommit={() => setCommitOpen(true)}
        />
        </>
      ) : (
        <>
          <GitPanelOverflowMenu projectRoot={gitRoot} variant="history" />
          <div className="flex items-center gap-1.5 h-6 px-1.5 shrink-0 text-[length:var(--font-menu-item)] text-muted-foreground/70">
            <GitCommitVerticalIcon className="size-3.5 shrink-0 opacity-60" />
            {!compact && <span>{t("git.toolbar.browsingHistory")}</span>}
            <span className="tabular-nums text-muted-foreground/50">{commits.length}</span>
          </div>
        </>
      )}

      <Dialog
        open={mergeOpen}
        onOpenChange={(o) => {
          setMergeOpen(o);
          if (!o) {
            setMergeConfirmBranch(null);
            setMergeSearch("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
                {mergeConfirmBranch ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>{t("dialogs.git.confirmMerge")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-3 py-2">
                        <span className="flex items-center gap-2 text-sm">
                          <GitBranchIcon className="size-4" />
                          <span className="truncate max-w-[120px]">{mergeConfirmBranch}</span>
                        </span>
                        <GitMergeIcon className="size-4 text-muted-foreground" />
                        <span className="flex items-center gap-2 text-sm text-primary">
                          <GitBranchIcon className="size-4" />
                          <span className="truncate max-w-[120px]">{branchLabel}</span>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        {t("git.toolbar.mergeInto", {
                          source: mergeConfirmBranch,
                          target: branchLabel,
                        })}
                      </p>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMergeConfirmBranch(null)}
                          disabled={merging}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!gitRoot || !mergeConfirmBranch) return;
                            setMerging(true);
                            try {
                              await useGitStore
                                .getState()
                                .mergeBranch(gitRoot, mergeConfirmBranch);
                              setMergeOpen(false);
                              setMergeSearch("");
                              setMergeConfirmBranch(null);
                            } finally {
                              setMerging(false);
                            }
                          }}
                          disabled={merging}
                        >
                          {merging
                            ? t("git.toolbar.merging")
                            : t("git.toolbar.merge")}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle>{t("dialogs.git.mergeBranch")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground text-center">
                        {t("git.toolbar.selectBranchToMerge", { branch: branchLabel })}
                      </p>
                      <div className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-3 py-2">
                        <SearchIcon className="size-3.5 text-muted-foreground" />
                        <input
                          className="flex-1 bg-transparent text-xs outline-none"
                          placeholder={t("git.toolbar.filterBranches")}
                          value={mergeSearch}
                          onChange={(e) => setMergeSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-md border">
                        {filteredMergeCandidates.length === 0 ? (
                          <p className="px-3 py-6 text-xs text-center text-muted-foreground">
                            {mergeCandidates.length === 0
                              ? t("git.toolbar.noOtherBranches")
                              : t("git.toolbar.noMatches")}
                          </p>
                        ) : (
                          filteredMergeCandidates.map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => setMergeConfirmBranch(b)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                            >
                              <GitBranchIcon className="size-3.5" />
                              <span className="truncate flex-1 text-left">{b}</span>
                              <span className="text-[length:var(--font-size-10)] text-muted-foreground/50">
                                → {branchLabel}
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

      <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
        <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t("dialogs.git.commitChanges")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <GitBranchIcon className="size-3.5" />
                    <span className="truncate">{branchLabel}</span>
                    <span className="tabular-nums">
                      {t("git.toolbar.filesCount", { count: stagedCount })}
                    </span>
                  </div>
                  <textarea
                    className="w-full bg-muted/50 border rounded-md px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-ring"
                    placeholder={t("git.toolbar.commitMessage")}
                    rows={4}
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
                      {committing
                        ? t("git.toolbar.committing")
                        : t("git.toolbar.commit")}
                    </button>
                  </div>
                </div>
        </DialogContent>
      </Dialog>

      <GitWorktreeMergeDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        projectRoot={projectRoot}
      />

      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("dialogs.git.createBranch")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input
              className="w-full bg-muted/50 border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder={t("git.toolbar.branchName")}
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
                {creatingBranch
                  ? t("git.toolbar.creating")
                  : t("git.toolbar.createBranch")}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <GitRemotePicker projectRoot={gitRoot} />
      <GitRemoteAddDialog projectRoot={gitRoot} />
      <GitPrCreateDialog projectRoot={gitRoot} />
    </div>
  );
}
