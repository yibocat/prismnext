import { useEffect, useCallback, useState, memo } from "react";
import {
  ArrowLeftIcon,
  Undo2Icon,
  RotateCcwIcon,
  AlertTriangleIcon,
  Loader2Icon,
  XIcon,
  ChevronRightIcon,
} from "lucide-react";
import { Icon } from "@iconify/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useGitStore, type GitFileItem, type GitCommitData } from "@/stores/git-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useDocumentStore } from "@/stores/document-store";
import { cn } from "@/lib/utils";
import { GitDiffView } from "./git-diff-view";
import { getFileIconName } from "@/lib/file-icon-class";
import {
  formatRelativeTime,
  parseRefs,
  type CommitFile,
} from "./git-utils";

// ─── Types ───

interface GitViewerProps {
  projectRoot: string;
}

// ─── CommitFileRow ───

const CommitFileRow = memo(function CommitFileRow({
  gitRoot,
  hash,
  file,
}: {
  gitRoot: string;
  hash: string;
  file: CommitFile;
}) {
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<{ oldContent: string; newContent: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const iconName = getFileIconName(file.path.split("/").pop() || file.path);

  const handleToggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (diff) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.gitCommitFileDiff(gitRoot, hash, file.path);
      setDiff({ oldContent: result.oldContent, newContent: result.newContent });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 h-6 cursor-pointer rounded-sm text-[length:var(--font-size-12)]",
          open
            ? "sticky top-0 z-10 bg-background hover:bg-muted"
            : "hover:bg-accent/50",
        )}
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle();
          }
        }}
      >
        <Icon icon={iconName} className="size-3 shrink-0" />
        <span className="truncate">{file.path}</span>
        <span className="text-[length:var(--font-size-11)] tabular-nums ml-auto shrink-0 flex items-center gap-0.5">
          {file.added > 0 && <span className="text-emerald-500">+{file.added}</span>}
          {file.deleted > 0 && <span className="text-red-400">-{file.deleted}</span>}
        </span>
      </div>
      {open && (
        <div className="pt-0.5 pb-1">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              Loading diff...
            </div>
          ) : diff ? (
            <GitDiffView
              oldContent={diff.oldContent}
              newContent={diff.newContent}
              filePath={file.path}
            />
          ) : null}
        </div>
      )}
    </div>
  );
});

// ─── GitCommitDetail ───

function GitCommitDetail({
  gitRoot,
  commit,
}: {
  gitRoot: string;
  commit: GitCommitData;
}) {
  const clearSelectedCommit = useGitStore((s) => s.clearSelectedCommit);

  const [expanded, setExpanded] = useState(false);
  const [statFiles, setStatFiles] = useState<CommitFile[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [revertTarget, setRevertTarget] = useState<{
    hash: string;
    message: string;
  } | null>(null);
  const [reverting, setReverting] = useState(false);

  const [resetTarget, setResetTarget] = useState<{
    hash: string;
    message: string;
  } | null>(null);
  const [resetMode, setResetMode] = useState<"soft" | "mixed" | "hard">("mixed");
  const [resetting, setResetting] = useState(false);

  const refs = parseRefs(commit.refs);

  useEffect(() => {
    setLoading(true);
    setStatFiles(null);
    window.electronAPI
      .gitCommitFiles(gitRoot, commit.hash)
      .then((files) => {
        setStatFiles(files);
      })
      .catch(() => {
        setStatFiles(null);
      })
      .finally(() => setLoading(false));
  }, [gitRoot, commit.hash]);

  const handleRevert = useCallback(async () => {
    if (!revertTarget || !gitRoot) return;
    setReverting(true);
    try {
      await useGitStore.getState().revertCommit(gitRoot, revertTarget.hash);
    } finally {
      setReverting(false);
      setRevertTarget(null);
      clearSelectedCommit();
    }
  }, [revertTarget, gitRoot, clearSelectedCommit]);

  const handleReset = useCallback(async () => {
    if (!resetTarget || !gitRoot) return;
    setResetting(true);
    try {
      await useGitStore.getState().resetToCommit(gitRoot, resetTarget.hash, resetMode);
    } finally {
      setResetting(false);
      setResetTarget(null);
      clearSelectedCommit();
    }
  }, [resetTarget, resetMode, gitRoot, clearSelectedCommit]);

  const totalAdded = statFiles?.reduce((s, f) => s + f.added, 0) ?? 0;
  const totalDeleted = statFiles?.reduce((s, f) => s + f.deleted, 0) ?? 0;

  const formattedDate = new Date(commit.date).toLocaleString();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Accordion header — always visible, clickable */}
      <div
        className="flex items-center gap-2 px-4 h-8 border-b shrink-0 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <button
          type="button"
          className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            clearSelectedCommit();
          }}
          title="Back to working tree"
        >
          <ArrowLeftIcon className="size-3" />
        </button>
        <span className="truncate flex-1 text-[length:var(--font-size-12)] font-medium">
          {commit.message}
        </span>
        <span className="text-[length:var(--font-size-11)] text-muted-foreground/60 shrink-0">
          {formatRelativeTime(commit.date)}
        </span>
        {(totalAdded > 0 || totalDeleted > 0) && (
          <span className="text-[length:var(--font-size-11)] tabular-nums shrink-0 flex items-center gap-0.5">
            {totalAdded > 0 && (
              <span className="text-emerald-500">+{totalAdded}</span>
            )}
            {totalDeleted > 0 && (
              <span className="text-red-400">-{totalDeleted}</span>
            )}
          </span>
        )}
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-b px-4 py-3 space-y-3 text-xs bg-muted/20">
          <div className="whitespace-pre-wrap break-all leading-relaxed text-[length:var(--font-size-12)] text-foreground/80">
            {commit.message}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[length:var(--font-size-12)] text-muted-foreground">
            <span><span className="text-muted-foreground/50">Date</span>{" "}{formattedDate}</span>
            <span className="text-muted-foreground/30">·</span>
            <span><span className="text-muted-foreground/50">Author</span>{" "}{commit.author}</span>
            <span className="text-muted-foreground/30">·</span>
            <span><span className="text-muted-foreground/50">Hash</span>{" "}<span className="font-mono">{commit.hash}</span></span>
            {refs.length > 0 && (
              <span className="flex items-center gap-0.5">
                {refs.map((r) => {
                  const bg = r.colorClass.includes("amber") ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : r.colorClass.includes("pink") ? "bg-pink-500/15 text-pink-600 dark:text-pink-400"
                    : r.colorClass.includes("sky") ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
                  return <span key={r.label} className={cn("inline-flex items-center rounded px-1 py-0 text-[length:var(--font-size-10)] font-medium", bg)}>{r.label}</span>;
                })}
              </span>
            )}
            <span className="flex-1" />
            <button type="button" onClick={() => setRevertTarget({ hash: commit.hash, message: commit.message })} className="flex items-center gap-1 h-5 px-1.5 rounded text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <Undo2Icon className="size-3" /> Revert
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-1 h-5 px-1.5 rounded text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  <RotateCcwIcon className="size-3" /> Reset
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                <DropdownMenuItem
                  onClick={() => {
                    setResetMode("soft");
                    setResetTarget({
                      hash: commit.hash,
                      message: commit.message,
                    });
                  }}
                  className="cursor-pointer text-xs"
                >
                  --soft
                  <span className="ml-auto text-[length:var(--font-size-11)] text-muted-foreground">
                    staged
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setResetMode("mixed");
                    setResetTarget({
                      hash: commit.hash,
                      message: commit.message,
                    });
                  }}
                  className="cursor-pointer text-xs"
                >
                  --mixed
                  <span className="ml-auto text-[length:var(--font-size-11)] text-muted-foreground">
                    unstaged
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setResetMode("hard");
                    setResetTarget({
                      hash: commit.hash,
                      message: commit.message,
                    });
                  }}
                  className="cursor-pointer text-xs text-destructive"
                >
                  --hard
                  <span className="ml-auto text-[length:var(--font-size-11)]">discard</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto px-2 pb-1 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground/30" />
          </div>
        ) : statFiles && statFiles.length > 0 ? (
          statFiles.map((f) => (
            <CommitFileRow
              key={f.path}
              gitRoot={gitRoot}
              hash={commit.hash}
              file={f}
            />
          ))
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
              No files changed in this commit
            </p>
          </div>
        )}
      </div>

      {/* Revert confirmation dialog */}
      <Dialog
        open={revertTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevertTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revert commit</DialogTitle>
            <DialogDescription className="text-xs">
              This will create a new commit that reverses the changes from:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="rounded bg-muted/50 px-3 py-2 text-xs font-mono">
              <span className="text-muted-foreground">
                {revertTarget?.hash}
              </span>{" "}
              <span>{revertTarget?.message}</span>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRevertTarget(null)}
              className="h-8 px-3 rounded text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRevert}
              disabled={reverting}
              className="flex items-center gap-1.5 h-8 px-4 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {reverting ? "Reverting..." : "Revert"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation dialog */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset to commit</DialogTitle>
            <DialogDescription className="text-xs">
              This will move the branch pointer to this commit.
              {resetMode === "hard" && (
                <span className="flex items-center gap-1 mt-1 text-destructive font-medium">
                  <AlertTriangleIcon className="size-3.5" />
                  --hard: all changes after this commit will be permanently
                  discarded.
                </span>
              )}
              {resetMode === "soft" && (
                <span className="block mt-1 text-muted-foreground">
                  --soft: changes will be kept in the staging area.
                </span>
              )}
              {resetMode === "mixed" && (
                <span className="block mt-1 text-muted-foreground">
                  --mixed: changes will be kept as unstaged modifications.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="rounded bg-muted/50 px-3 py-2 text-xs font-mono">
              <span className="text-muted-foreground">
                {resetTarget?.hash}
              </span>{" "}
              <span>{resetTarget?.message}</span>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="h-8 px-3 rounded text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className={`flex items-center gap-1.5 h-8 px-4 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                resetMode === "hard"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {resetting
                ? "Resetting..."
                : `Reset ${resetMode === "mixed" ? "" : "--" + resetMode}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── FileDiffView ───

function FileDiffView({
  projectRoot,
  file,
  defaultExpanded,
}: {
  projectRoot: string;
  file: GitFileItem;
  defaultExpanded?: boolean;
}) {
  const loadDiff = useGitStore((s) => s.loadDiff);
  const removeFile = useGitStore((s) => s.removeFile);
  const iconName = getFileIconName(file.path.split("/").pop() || file.path);
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);

  // Lazy-load diff
  useEffect(() => {
    if (file.diff === null && !file.diffLoading) {
      loadDiff(projectRoot, file.id, file.path);
    }
  }, [file.id, file.path, file.diff, file.diffLoading, loadDiff, projectRoot]);

  const handleStageToggle = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const store = useGitStore.getState();
      if (file.staged) {
        store.unstageFile(projectRoot, file.path);
      } else {
        store.stageFile(projectRoot, file.path);
      }
    },
    [file.staged, file.path, projectRoot],
  );

  const handleDiscard = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      useGitStore
        .getState()
        .discardFile(
          projectRoot,
          file.path,
          file.staged,
          file.untracked,
          file.worktreeStatus,
        );
    },
    [projectRoot, file.path, file.staged, file.untracked, file.worktreeStatus],
  );

  const isChecked = file.staged || file.worktreeStatus === "D";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header bar — sticky when expanded so it stays visible while
          scrolling through the diff. */}
      <div
        className={cn(
          "flex items-center gap-2 px-4 h-8 shrink-0 cursor-pointer transition-colors",
          expanded
            ? "sticky top-0 z-10 bg-background hover:bg-muted"
            : "hover:bg-accent/30",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRightIcon
          className={`size-3 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <Icon icon={iconName} className="size-3 shrink-0" />
        <span
          className="truncate text-[length:var(--font-size-12)] font-medium hover:underline cursor-pointer shrink-0 max-w-[60%]"
          onClick={async (e) => {
            e.stopPropagation();
            // Load file content from disk before creating the tab,
            // so it's ready when the CodeEditor mounts.
            await useDocumentStore.getState().openFile(file.path);
            useRightPanelStore.getState().openFile(
              file.path,
              file.path,
              file.path.split("/").pop() || file.path,
            );
          }}
          title={`Open ${file.path} in editor`}
        >
          {file.path}
        </span>
        <span className="flex-1" />
        {(file.added > 0 || file.deleted > 0) && (
          <span className="text-[length:var(--font-size-11)] font-mono tabular-nums shrink-0 flex items-center gap-0.5">
            {file.added > 0 && (
              <span className="text-emerald-500">+{file.added}</span>
            )}
            {file.deleted > 0 && (
              <span className="text-red-400">-{file.deleted}</span>
            )}
          </span>
        )}

        {!file.staged && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleDiscard}
                className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                title="Discard changes"
              >
                <Undo2Icon className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[length:var(--font-size-11)]">Discard</TooltipContent>
          </Tooltip>
        )}

        <input
          type="checkbox"
          checked={isChecked}
          onClick={handleStageToggle}
          readOnly
          className="size-3 shrink-0 cursor-pointer accent-primary rounded-sm"
          title={isChecked ? "Unstage" : "Stage"}
        />

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
          className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          title="Close"
        >
          <XIcon className="size-3" />
        </button>
      </div>

      {/* Diff content */}
      {expanded && (
        <>
          {file.diffLoading ? (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              Loading diff...
            </div>
          ) : file.diff ? (
            <GitDiffView
              oldContent={file.diff.oldContent}
              newContent={file.diff.newContent}
              filePath={file.path}
            />
          ) : (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              No diff available
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── GitViewer (default export) ───

export default function GitViewer({ projectRoot }: GitViewerProps) {
  const selectedFilePaths = useGitStore((s) => s.selectedFilePaths);
  const selectedCommitHash = useGitStore((s) => s.selectedCommitHash);
  const files = useGitStore((s) => s.files);
  const commits = useGitStore((s) => s.commits);
  const unitRoot = useGitStore((s) => s.unitRoot);

  const gitRoot = unitRoot ?? projectRoot;

  // ── State: Commit detail view ──
  if (selectedCommitHash) {
    const commit = commits.find((c) => c.hash === selectedCommitHash);

    if (!commit) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            Commit not found
          </p>
        </div>
      );
    }

    return <GitCommitDetail gitRoot={gitRoot} commit={commit} />;
  }

  // ── State: File accordion list ──
  const selectedFiles = selectedFilePaths
    .map((id) => files.find((f) => f.id === id))
    .filter(Boolean) as GitFileItem[];

  if (selectedFiles.length > 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-auto">
        {selectedFiles.map((file, i) => (
          <FileDiffView
            key={file.id}
            projectRoot={gitRoot}
            file={file}
            defaultExpanded={i === 0}
          />
        ))}
      </div>
    );
  }

  // ── State: Empty ──
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
        Select a file to view changes
      </p>
    </div>
  );
}
