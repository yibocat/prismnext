import { useCallback, useEffect, useMemo, memo } from "react";
import {
  ChevronRightIcon,
  ArrowRightLeftIcon,
  Loader2Icon,
  Undo2Icon,
  EllipsisIcon,
} from "lucide-react";
import { Icon } from "@iconify/react";
import { useGitStore, type GitFileItem } from "@/stores/git-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useDocumentStore } from "@/stores/document-store";
import { GitDiffView } from "./git-diff-view";
import { getFileIconName } from "@/lib/file-icon-class";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// ─── Props ───

interface GitFileAccordionProps {
  projectRoot: string;
  file: GitFileItem;
}

// ─── Component ───

export const GitFileAccordion = memo(function GitFileAccordion({ projectRoot, file }: GitFileAccordionProps) {
  const setFileExpanded = useGitStore((s) => s.setFileExpanded);
  const loadDiff = useGitStore((s) => s.loadDiff);
  const stageFile = useGitStore((s) => s.stageFile);
  const unstageFile = useGitStore((s) => s.unstageFile);

  const expanded = file.expanded;

  const iconName = useMemo(() => {
    const name = file.path.split("/").pop() || file.path;
    return getFileIconName(name);
  }, [file.path]);

  const statusDot = useMemo(() => {
    if (file.worktreeStatus === "D" || file.indexStatus === "D") return "bg-red-400";
    if (file.staged && !file.unstaged) return "bg-emerald-400";
    if (file.unstaged || file.untracked) return "bg-amber-400";
    return null; // no dot for edge cases
  }, [file.staged, file.unstaged, file.untracked, file.indexStatus, file.worktreeStatus]);

  // ── Auto-reload diff when filter changes (clears cache) while expanded ──
  useEffect(() => {
    if (file.expanded && file.diff === null && !file.diffLoading) {
      loadDiff(projectRoot, file.id, file.path);
    }
  }, [file.expanded, file.diff, file.diffLoading, loadDiff, projectRoot, file.id, file.path]);

  // ── Header click: toggle expanded + lazy-load diff ──

  const handleToggle = useCallback(() => {
    const nextExpanded = !expanded;
    setFileExpanded(file.id, nextExpanded);
    if (nextExpanded && file.diff === null && !file.diffLoading) {
      loadDiff(projectRoot, file.id, file.path);
    }
  }, [expanded, file.id, file.path, file.diff, file.diffLoading, setFileExpanded, loadDiff, projectRoot]);

  // ── Stage / unstage action ──

  const handleStageToggle = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (file.staged) {
        unstageFile(projectRoot, file.path);
      } else {
        stageFile(projectRoot, file.path);
      }
    },
    [file.staged, file.path, projectRoot, stageFile, unstageFile],
  );

  const isChecked = file.staged || file.worktreeStatus === "D";

  const handleDiscard = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      useGitStore
        .getState()
        .discardFile(projectRoot, file.path, file.staged, file.untracked, file.worktreeStatus);
    },
    [projectRoot, file.path, file.staged, file.untracked, file.worktreeStatus],
  );

  // ── File path display ──

  const renderFilePath = () => {
    const name = (
      <>
        {file.oldPath ? (
          <span className="truncate text-xs flex items-center gap-1 min-w-0">
            <span className="text-muted-foreground truncate">{file.oldPath}</span>
            <ArrowRightLeftIcon className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.path}</span>
          </span>
        ) : (
          <span className="truncate text-xs">{file.path}</span>
        )}
      </>
    );
    return <div className="flex items-center gap-2 min-w-0">{name}</div>;
  };

  return (
    <div>
      {/* ── Header Row ── */}
      <div
        className="group grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-1.5 px-3 h-7 cursor-pointer hover:bg-accent/50 rounded text-[length:var(--font-size-12)]"
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
        {/* Status dot / Expand chevron (swap on hover) */}
        <span className="relative size-3 shrink-0 flex items-center justify-center">
          {/* Dot */}
          {statusDot && (
            <span
              className={`block size-1.5 rounded-full transition-opacity opacity-100 group-hover:opacity-0 ${statusDot}`}
            />
          )}
          {/* Chevron */}
          <ChevronRightIcon
            className={`absolute inset-0 size-3 transition-all opacity-0 group-hover:opacity-100 ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </span>

        {/* File icon */}
        <Icon icon={iconName} className="size-3 shrink-0" />

        {/* File path + line counts */}
        <div className="min-w-0 flex items-center gap-2">
          {renderFilePath()}
          {(file.added > 0 || file.deleted > 0) && (
            <span className="shrink-0 text-[length:var(--font-size-11)] flex items-center gap-0.5 tabular-nums">
              {file.added > 0 && (
                <span className="text-emerald-500">+{file.added}</span>
              )}
              {file.deleted > 0 && (
                <span className="text-red-400">-{file.deleted}</span>
              )}
            </span>
          )}
        </div>

        {/* Discard button — only for unstaged / untracked */}
        {!file.staged ? (
          <button
            type="button"
            onClick={handleDiscard}
            className="size-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-accent transition-all shrink-0"
            title="Discard changes"
          >
            <Undo2Icon className="size-3" />
          </button>
        ) : (
          <span /> /* placeholder for grid alignment */
        )}

        {/* Stage checkbox */}
        <input
          type="checkbox"
          checked={isChecked}
          onClick={handleStageToggle}
          readOnly
          className="size-3 shrink-0 cursor-pointer accent-primary rounded-sm justify-self-end"
          title={isChecked ? "Unstage file" : "Stage file"}
        />

        {/* Kebab menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
              title="More actions"
            >
              <EllipsisIcon className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                const docRoot = useDocumentStore.getState().projectRoot;
                const absPath = `${projectRoot}/${file.path}`;
                const relPath = docRoot
                  ? absPath.replace(docRoot, "").replace(/^\//, "")
                  : file.path;
                useRightPanelStore.getState().openFile(relPath, relPath, file.path.split("/").pop() || file.path);
              }}
              className="cursor-pointer text-xs"
            >
              Open file
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async (e) => {
                e.stopPropagation();
                const ignorePath = `${projectRoot}/.gitignore`;
                try {
                  const exists = await window.electronAPI.fsExists(ignorePath);
                  const line = `\n${file.path}`;
                  if (exists) {
                    const { content } = await window.electronAPI.fsRead(ignorePath);
                    await window.electronAPI.fsWrite(ignorePath, content + line);
                  } else {
                    await window.electronAPI.fsWrite(ignorePath, line.trim());
                  }
                } catch { /* ignore */ }
              }}
              className="cursor-pointer text-xs"
            >
              Add to .gitignore
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Expanded Diff Content ── */}
      {expanded && (
        <div className="px-3 py-0.5">
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
          ) : null}
        </div>
      )}
    </div>
  );
});
