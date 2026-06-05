import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import {
  GitBranchIcon,
  Loader2Icon,
  FolderGit2Icon,
  PencilIcon,
  CheckCheckIcon,
  LayersIcon,
  EllipsisIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useGitStore, type GitFileItem } from "@/stores/git-store";

import { GitFileAccordion } from "./git-file-accordion";
import { GitHistory } from "./git-history";
import { cn } from "@/lib/utils";

// ─── Tree Node View ───

interface FileTreeNode {
  name: string;
  path: string;
  kind: "folder" | "file";
  file?: GitFileItem;
  children: FileTreeNode[];
}

function FileTreeNodeView({
  node,
  gitRoot,
  depth,
  expandedPaths,
  onTogglePath,
}: {
  node: FileTreeNode;
  gitRoot: string;
  depth: number;
  expandedPaths: Set<string>;
  onTogglePath: (path: string) => void;
}) {
  const isOpen = expandedPaths.has(node.path);

  if (node.kind === "file" && node.file) {
    return (
      <div style={{ paddingLeft: `${12 + depth * 12}px` }}>
        <GitFileAccordion projectRoot={gitRoot} file={node.file} />
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-3 h-7 cursor-pointer hover:bg-accent/50 rounded text-[length:var(--font-size-12)] text-muted-foreground"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        onClick={() => onTogglePath(node.path)}
      >
        <ChevronRightIcon
          className={cn("size-3 shrink-0 transition-transform", isOpen && "rotate-90")}
        />
        {isOpen ? (
          <FolderOpenIcon className="size-3 shrink-0" />
        ) : (
          <FolderIcon className="size-3 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        <span className="tabular-nums text-[length:var(--font-size-12)] opacity-40">
          {node.children.length}
        </span>
      </div>
      {isOpen && node.children.map((child) => (
        <FileTreeNodeView
          key={child.kind === "file" && child.file ? child.file.id : child.path}
          node={child}
          gitRoot={gitRoot}
          depth={depth + 1}
          expandedPaths={expandedPaths}
          onTogglePath={onTogglePath}
        />
      ))}
    </div>
  );
}

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function CommitPopover({
  gitRoot,
  stagedCount,
}: {
  gitRoot: string;
  stagedCount: number;
}) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCommit = async () => {
    if (!msg.trim() || !gitRoot) return;
    setLoading(true);
    try {
      await useGitStore.getState().commitChanges(gitRoot, msg.trim());
      setMsg("");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
        >
          Commit ({stagedCount})
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <textarea
          className="w-full bg-muted/50 border rounded px-2 py-1 text-xs resize-none outline-none focus:ring-1 focus:ring-ring"
          placeholder="Commit message"
          rows={3}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleCommit();
            }
          }}
          autoFocus
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-muted-foreground">
            {stagedCount} file{stagedCount !== 1 ? "s" : ""} staged
          </span>
          <button
            type="button"
            onClick={handleCommit}
            disabled={!msg.trim() || loading}
            className="flex items-center gap-1 h-6 px-2 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Committing..." : "Commit"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface GitOverviewProps {
  projectRoot: string;
}

export function GitOverview({ projectRoot }: GitOverviewProps) {
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const loading = useGitStore((s) => s.loading);
  const files = useGitStore((s) => s.files);
  const filterMode = useGitStore((s) => s.filterMode);
  const error = useGitStore((s) => s.error);
  const branch = useGitStore((s) => s.branch);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const viewMode = useGitStore((s) => s.viewMode);
  const listMode = useGitStore((s) => s.listMode);
  const gitRoot = unitRoot ?? projectRoot;

  const [initLoading, setInitLoading] = useState(false);

  // Persist git tree folder expand state across status refreshes
  const [gitExpandedPaths, setGitExpandedPaths] = useState<Set<string>>(new Set());
  const handleGitTreeToggle = useCallback((path: string) => {
    setGitExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const filteredFiles = useMemo<GitFileItem[]>(() => {
    switch (filterMode) {
      case "staged":
        return files.filter((f) => f.staged);
      case "unstaged":
        return files.filter((f) => f.unstaged || f.untracked);
      case "all":
        return files;
    }
  }, [files, filterMode]);

  const sectionCheckRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = sectionCheckRef.current;
    if (!el) return;
    const all = filteredFiles.length > 0 &&
      filteredFiles.every((f) => f.staged || f.worktreeStatus === "D");
    const some = !all && filteredFiles.some((f) => f.staged || f.worktreeStatus === "D");
    el.indeterminate = some;
  }, [filteredFiles]);

  const fileTree = useMemo(() => {
    if (listMode !== "tree") return null;
    const root: FileTreeNode = { name: "", path: "", kind: "folder", children: [] };
    for (const f of filteredFiles) {
      const parts = f.path.split("/");
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        const name = parts[i];
        const fullPath = parts.slice(0, i + 1).join("/");
        if (isLast) {
          node.children.push({ name, path: fullPath, kind: "file", file: f, children: [] });
        } else {
          let folder = node.children.find((c) => c.kind === "folder" && c.name === name);
          if (!folder) {
            folder = { name, path: fullPath, kind: "folder", children: [] };
            node.children.push(folder);
          }
          node = folder;
        }
      }
    }
    const sort = (nodes: FileTreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach((n) => sort(n.children));
    };
    sort(root.children);
    return root.children;
  }, [filteredFiles, listMode]);

  const handleInit = useCallback(async () => {
    if (!gitRoot) return;
    setInitLoading(true);
    try {
      await useGitStore.getState().initRepo(gitRoot);
    } finally {
      setInitLoading(false);
    }
  }, [gitRoot]);

  // ── State: checking repo ──
  if (checkingRepo) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Loader2Icon className="size-8 mx-auto mb-3 animate-spin text-muted-foreground" />
            <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
              Checking repository...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── State: not a git repo ──
  if (!isGitRepo) {
    const unitName = gitRoot.split(/[/\\]/).pop() || gitRoot;
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <FolderGit2Icon className="size-10 mx-auto mb-3 opacity-30" />
            <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
              {unitName} is not a git repository
            </p>
            <p className="text-[length:var(--font-hint)] text-muted-foreground/60 mt-1 mb-4">
              Initialize to start tracking changes.
            </p>
            <button
              onClick={handleInit}
              disabled={initLoading}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              {initLoading ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <GitBranchIcon className="size-3" />
              )}
              Initialize Git
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── State: loading with no files ──
  if (loading && files.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Loader2Icon className="size-8 mx-auto mb-3 animate-spin text-muted-foreground" />
            <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
              Loading changes...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── State: history view ──
  if (viewMode === "history") {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <GitHistory gitRoot={gitRoot} />
      </div>
    );
  }

  const sectionTitle =
    filterMode === "unstaged" ? "Unstaged changes" :
    filterMode === "staged" ? "Staged changes" : "Uncommitted changes";

  const SectionIcon =
    filterMode === "unstaged" ? PencilIcon :
    filterMode === "staged" ? CheckCheckIcon :
    LayersIcon;

  const totalAdded = filteredFiles.reduce((s, f) => s + f.added, 0);
  const totalDeleted = filteredFiles.reduce((s, f) => s + f.deleted, 0);

  const sectionAllChecked = filteredFiles.length > 0 &&
    filteredFiles.every((f) => f.staged || f.worktreeStatus === "D");

  const handleSectionCheck = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const root = unitRoot ?? projectRoot;
    if (!root) return;
    const store = useGitStore.getState();
    if (sectionAllChecked) {
      const paths = filteredFiles.filter((f) => f.staged).map((f) => f.path);
      store.unstageAll(root, paths);
    } else {
      const paths = filteredFiles.filter((f) => !f.staged).map((f) => f.path);
      store.stageAll(root, paths);
    }
  };

  // ── State: normal (files present) ──
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded m-3">
          {error}
        </div>
      )}
      {/* Section header — matches file row grid */}
      <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-1.5 px-4 h-8 border-b text-[length:var(--font-size-12)] text-muted-foreground">
        <span /> {/* no dot/chevron */}
        <SectionIcon className="size-3 shrink-0" />
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-xs font-medium">{sectionTitle}</span>
          <span className="tabular-nums text-[length:var(--font-size-12)] opacity-50">
            {filteredFiles.length} files
          </span>
          {(totalAdded > 0 || totalDeleted > 0) && (
            <span className="text-[11px] flex items-center gap-0.5 tabular-nums">
              {totalAdded > 0 && (
                <span className="text-emerald-500">+{totalAdded}</span>
              )}
              {totalDeleted > 0 && (
                <span className="text-red-400">-{totalDeleted}</span>
              )}
            </span>
          )}
        </div>
        <span /> {/* no discard */}
        <input
          ref={sectionCheckRef}
          type="checkbox"
          checked={sectionAllChecked}
          onClick={handleSectionCheck}
          readOnly
          className="size-3 shrink-0 cursor-pointer accent-primary rounded-sm justify-self-end"
          title={sectionAllChecked ? "Unstage all" : "Stage all"}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
              title="More actions"
            >
              <EllipsisIcon className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => useGitStore.getState().setListMode(listMode === "tree" ? "list" : "tree")}
              className="cursor-pointer text-xs"
            >
              {listMode === "tree" ? "View as list" : "View as file tree"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs">Stage all</DropdownMenuItem>
            <DropdownMenuItem disabled className="text-xs">Unstage all</DropdownMenuItem>
            <DropdownMenuItem disabled className="text-xs">Discard all</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 overflow-auto p-1 space-y-0.5" key={`${listMode}-${filterMode}`}>
        {filteredFiles.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
              {filterMode === "all"
                ? "No changes — working tree clean"
                : filterMode === "staged"
                  ? "No staged changes"
                  : "No unstaged changes — working tree clean"}
            </p>
          </div>
        ) : listMode === "tree" && fileTree ? (
          fileTree.map((node) => (
            <FileTreeNodeView
              key={node.path}
              node={node}
              gitRoot={gitRoot}
              depth={0}
              expandedPaths={gitExpandedPaths}
              onTogglePath={handleGitTreeToggle}
            />
          ))
        ) : (
          filteredFiles.map((file) => (
            <GitFileAccordion
              key={file.id}
              projectRoot={gitRoot}
              file={file}
            />
          ))
        )}
      </div>
    </div>
  );
}
