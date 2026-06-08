import { useEffect, useState, useCallback, useMemo, memo } from "react";
import {
  Loader2Icon,
  ClockIcon,
  Undo2Icon,
  RotateCcwIcon,
  AlertTriangleIcon,
  GitCommitHorizontalIcon,
} from "lucide-react";
import { Icon } from "@iconify/react";
import { useGitStore, type GitCommitData } from "@/stores/git-store";
import { GitDiffView } from "./git-diff-view";
import { getFileIconName } from "@/lib/file-icon-class";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Types ───

interface CommitFile {
  path: string;
  added: number;
  deleted: number;
}

// ─── Helpers ───

function parseStatFiles(raw: string): CommitFile[] {
  // Detect format: diff-tree --numstat uses tab-separated "added\tdeleted\tpath".
  // Old git show --stat uses "path | added+++deleted---".
  const isNumstat = raw.includes("\t");

  if (isNumstat) {
    const files: CommitFile[] = [];
    for (const line of raw.split("\n")) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        files.push({
          path: parts[2],
          added: parseInt(parts[0], 10) || 0,
          deleted: parseInt(parts[1], 10) || 0,
        });
      }
    }
    return files;
  }

  // Legacy format: git show --stat
  const files: CommitFile[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git")) break;
    const bar = line.indexOf(" | ");
    if (bar === -1) continue;
    const path = line.slice(0, bar).trim();
    const changes = line.slice(bar + 3).trim();
    let added = 0;
    let deleted = 0;
    for (const ch of changes) {
      if (ch === "+") added++;
      else if (ch === "-") deleted++;
    }
    files.push({ path, added, deleted });
  }
  return files;
}

function formatRelativeTime(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 0) return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (diff < 60) return "just now";
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Parse `git log --format=%D` refs into colored JSX spans */
function renderRefs(refs: string) {
  if (!refs) return null;
  const parts = refs.split(",").map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();

  return parts.map((part, i) => {
    let label: string;
    let color: string;

    if (part.startsWith("tag:")) {
      label = part.slice(4).trim();
      color = "text-pink-500 dark:text-pink-400";
    } else if (part === "HEAD") {
      label = "HEAD";
      color = "text-amber-500 dark:text-amber-400";
    } else if (part.includes("->")) {
      // "HEAD -> main"
      const branch = part.split("->")[1].trim();
      if (seen.has(branch)) return null;
      seen.add(branch);
      return (
        <span key={i} className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-semibold text-amber-500 dark:text-amber-400">HEAD</span>
          <span className="text-[10px] font-medium text-sky-500 dark:text-sky-400">{branch}</span>
        </span>
      );
    } else if (part.includes("/")) {
      label = part;
      color = "text-emerald-500 dark:text-emerald-400";
    } else {
      label = part;
      color = "text-sky-500 dark:text-sky-400";
    }

    if (seen.has(label)) return null;
    seen.add(label);

    return (
      <span key={i} className={`text-[10px] font-medium shrink-0 ${color}`}>
        {label}
      </span>
    );
  });
}

function groupByDate(commits: GitCommitData[]) {
  const groups = new Map<string, { dateKey: string; label: string; commits: GitCommitData[] }>();
  const now = new Date();
  const todayKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = [yesterday.getFullYear(), String(yesterday.getMonth() + 1).padStart(2, "0"), String(yesterday.getDate()).padStart(2, "0")].join("-");

  for (const c of commits) {
    const d = new Date(c.date);
    const key = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
    if (!groups.has(key)) {
      let label: string;
      if (key === todayKey) label = "Today";
      else if (key === yesterdayKey) label = "Yesterday";
      else label = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      groups.set(key, { dateKey: key, label, commits: [] });
    }
    groups.get(key)!.commits.push(c);
  }

  return [...groups.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// ─── Component ───

interface GitHistoryProps {
  gitRoot: string;
}

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
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (diff) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.gitCommitFileDiff(gitRoot, hash, file.path);
      setDiff({ oldContent: result.oldContent, newContent: result.newContent });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 h-6 cursor-pointer hover:bg-accent/50 rounded text-[length:var(--font-size-12)]"
        onClick={handleToggle}
      >
        <Icon icon={iconName} className="size-3 shrink-0" />
        <span className="truncate">{file.path}</span>
        <span className="text-[11px] tabular-nums ml-auto shrink-0 flex items-center gap-0.5">
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
            <GitDiffView oldContent={diff.oldContent} newContent={diff.newContent} filePath={file.path} />
          ) : null}
        </div>
      )}
    </div>
  );
});

export const GitHistory = memo(function GitHistory({ gitRoot }: GitHistoryProps) {
  const commits = useGitStore((s) => s.commits);
  const commitsLoading = useGitStore((s) => s.commitsLoading);

  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [statContent, setStatContent] = useState<string | null>(null);
  const [fullMessage, setFullMessage] = useState<string | null>(null);
  const [statLoading, setStatLoading] = useState(false);

  // ── Revert / Reset dialog state ──
  const [revertTarget, setRevertTarget] = useState<{ hash: string; message: string } | null>(null);
  const [reverting, setReverting] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ hash: string; message: string } | null>(null);
  const [resetMode, setResetMode] = useState<"soft" | "mixed" | "hard">("mixed");
  const [resetting, setResetting] = useState(false);

  const handleRevert = useCallback(async () => {
    if (!revertTarget || !gitRoot) return;
    setReverting(true);
    try {
      await useGitStore.getState().revertCommit(gitRoot, revertTarget.hash);
    } finally {
      setReverting(false);
      setRevertTarget(null);
      setExpandedHash(null);
      setStatContent(null);
      setFullMessage(null);
    }
  }, [revertTarget, gitRoot]);

  const handleReset = useCallback(async () => {
    if (!resetTarget || !gitRoot) return;
    setResetting(true);
    try {
      await useGitStore.getState().resetToCommit(gitRoot, resetTarget.hash, resetMode);
    } finally {
      setResetting(false);
      setResetTarget(null);
      setExpandedHash(null);
      setStatContent(null);
      setFullMessage(null);
    }
  }, [resetTarget, resetMode, gitRoot]);

  useEffect(() => {
    if (!gitRoot) return;
    useGitStore.getState().loadHistory(gitRoot);
  }, [gitRoot]);

  const dateGroups = useMemo(() => groupByDate(commits), [commits]);

  if (commitsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground/30" />
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <ClockIcon className="size-10 mx-auto mb-3 opacity-20" />
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            No commits yet
          </p>
          <p className="text-[length:var(--font-hint)] text-muted-foreground/60 mt-1">
            Changes you commit will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-4 h-8 border-b text-[length:var(--font-size-12)] text-muted-foreground shrink-0">
        <ClockIcon className="size-3 shrink-0" />
        <span className="font-medium">Commits</span>
        <span className="tabular-nums opacity-40">{commits.length}</span>
      </div>

      <div className="flex-1 overflow-auto">
        {dateGroups.map((group) => (
          <div key={group.dateKey}>
            {/* Date header — icon sits on the timeline */}
            <div className="flex items-center gap-1.5 pt-3 pb-0.5 text-[length:var(--font-size-11)] font-medium text-muted-foreground sticky top-0 bg-transparent z-10 ml-4 -ml-[7px]">
              <GitCommitHorizontalIcon className="size-4 shrink-0 text-muted-foreground" />
              {group.label}
              <span className="font-normal text-muted-foreground/60 tabular-nums">
                {group.commits.length} commit{group.commits.length > 1 ? "s" : ""}
              </span>
            </div>

            {/* Commit list container */}
            <div className="mx-4 border border-border/40 rounded-lg overflow-hidden">
            {group.commits.map((c, i) => {
              const isExpanded = expandedHash === c.hash;
              const statFiles = isExpanded && statContent ? parseStatFiles(statContent) : [];

              return (
                <div key={c.hash}>
                  {i > 0 && <Separator className="bg-border/40" />}
                  {/* Commit row */}
                  <div
                    className="pl-4 pr-4 py-1.5 cursor-pointer hover:bg-accent/40 group/commit"
                    onClick={() => {
                      if (expandedHash === c.hash) {
                        setExpandedHash(null);
                        setStatContent(null);
                        setFullMessage(null);
                      } else {
                        setExpandedHash(c.hash);
                        setStatLoading(true);
                        // Lightweight: diff-tree --numstat returns just file list + line counts.
                        // Full file diffs are lazy-loaded on click via getCommitFileDiff.
                        window.electronAPI.gitCommitFiles(gitRoot, c.hash).then((files) => {
                          setStatContent(JSON.stringify(files)); // store serialized for parseStatFiles compat
                        }).catch(() => {
                          setStatContent(null);
                        }).finally(() => setStatLoading(false));
                      }
                    }}
                  >
                    {/* Row 1: message + stats + action buttons */}
                    <div className="flex items-start gap-1.5">
                      <span className="truncate flex-1 text-[length:var(--font-size-12)]">
                        {c.message}
                      </span>
                      {(c.insertions > 0 || c.deletions > 0) && (
                        <span className="text-[11px] font-mono tabular-nums shrink-0 flex items-center gap-0.5">
                          {c.insertions > 0 && <span className="text-emerald-500">+{c.insertions}</span>}
                          {c.deletions > 0 && <span className="text-red-400">-{c.deletions}</span>}
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/commit:opacity-100 transition-all">
                        {/* Revert */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="size-4 rounded hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center"
                              onClick={(e) => { e.stopPropagation(); setRevertTarget({ hash: c.hash, message: c.message }); }}
                            >
                              <Undo2Icon className="size-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-[11px]">Revert</TooltipContent>
                        </Tooltip>
                        {/* Reset */}
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="size-4 rounded hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <RotateCcwIcon className="size-3" />
                                </button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-[11px]">Reset</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setResetMode("soft"); setResetTarget({ hash: c.hash, message: c.message }); }}
                              className="cursor-pointer text-xs"
                            >
                              --soft
                              <span className="ml-auto text-[11px] text-muted-foreground">staged</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setResetMode("mixed"); setResetTarget({ hash: c.hash, message: c.message }); }}
                              className="cursor-pointer text-xs"
                            >
                              --mixed
                              <span className="ml-auto text-[11px] text-muted-foreground">unstaged</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setResetMode("hard"); setResetTarget({ hash: c.hash, message: c.message }); }}
                              className="cursor-pointer text-xs text-destructive"
                            >
                              --hard
                              <span className="ml-auto text-[11px]">discard</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    </div>

                    {/* Row 2: metadata + refs */}
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground/60">
                      <span className="font-mono">{c.hash}</span>
                      <span className="text-muted-foreground/20">·</span>
                      <span>{c.author}</span>
                      <span className="text-muted-foreground/20">·</span>
                      <span>{formatRelativeTime(c.date)}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {renderRefs(c.refs)}
                      </span>
                    </div>
                  </div>

                  {/* Expanded area */}
                  {isExpanded && (
                    <div className="pl-4 pr-4 pb-2 bg-muted/40">
                      <div className="text-[length:var(--font-size-12)] text-muted-foreground whitespace-pre-wrap break-all leading-relaxed mb-2">
                        {fullMessage || c.message}
                      </div>
                      {statLoading ? (
                        <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                          Loading diff...
                        </div>
                      ) : statFiles.length > 0 ? (
                        <div>
                          <div className="text-[11px] text-muted-foreground/50 mb-0.5">
                            {statFiles.length} file{statFiles.length > 1 ? "s" : ""} changed
                          </div>
                          {statFiles.map((f) => (
                            <CommitFileRow key={f.path} gitRoot={gitRoot} hash={c.hash} file={f} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Revert confirmation dialog ── */}
      <Dialog open={revertTarget !== null} onOpenChange={(open) => { if (!open) setRevertTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revert commit</DialogTitle>
            <DialogDescription className="text-xs">
              This will create a new commit that reverses the changes from:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="rounded bg-muted/50 px-3 py-2 text-xs font-mono">
              <span className="text-muted-foreground">{revertTarget?.hash}</span>
              {" "}
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

      {/* ── Reset confirmation dialog ── */}
      <Dialog open={resetTarget !== null} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset to commit</DialogTitle>
            <DialogDescription className="text-xs">
              This will move the branch pointer to this commit.
              {resetMode === "hard" && (
                <span className="flex items-center gap-1 mt-1 text-destructive font-medium">
                  <AlertTriangleIcon className="size-3.5" />
                  --hard: all changes after this commit will be permanently discarded.
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
              <span className="text-muted-foreground">{resetTarget?.hash}</span>
              {" "}
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
              {resetting ? "Resetting..." : `Reset ${resetMode === "mixed" ? "" : "--" + resetMode}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
