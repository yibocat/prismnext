import { useCallback, useEffect, useRef, useState, memo } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Icon } from "@iconify/react/offline";
import { useGitStore } from "@/stores/git-store";
import { gitDesktop } from "@/lib/desktop-api/git";
import { cn } from "@/lib/utils";
import { GitDiffView } from "./git-diff-view";
import { getFileIconName } from "@/lib/files/file-icon-class";
import {
  GitChangeLineCounts,
  gitChangeRowShellClass,
  gitChangeRowTextClass,
  gitPanelExpandedRowInScrollerStickyClass,
  gitPanelListRowClass,
  gitPanelExpandedDiffClass,
} from "./git-change-row-chrome";
import { preserveGitCommitScroll } from "./git-changes-tree";
import type { CommitFile } from "./git-utils";

export interface GitCommitFileRowProps {
  gitRoot: string;
  commitHash: string;
  file: CommitFile;
  isExpanded: boolean;
}

export const GitCommitFileRow = memo(function GitCommitFileRow({
  gitRoot,
  commitHash,
  file,
  isExpanded,
}: GitCommitFileRowProps) {
  const toggleCommitFileExpanded = useGitStore((s) => s.toggleCommitFileExpanded);
  const iconName = getFileIconName(file.path.split("/").pop() || file.path);

  const [diff, setDiff] = useState<{
    oldContent: string;
    newContent: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const wasLoading = useRef(false);

  useEffect(() => {
    if (!isExpanded) return;
    if (diff) return;
    let cancelled = false;
    setLoading(true);
    gitDesktop
      .gitCommitFileDiff(gitRoot, commitHash, file.path)
      .then((result) => {
        if (!cancelled) {
          setDiff({ oldContent: result.oldContent, newContent: result.newContent });
        }
      })
      .catch(() => {
        if (!cancelled) setDiff(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isExpanded, diff, gitRoot, commitHash, file.path]);

  useEffect(() => {
    if (wasLoading.current && !loading && isExpanded) {
      preserveGitCommitScroll(() => {});
    }
    wasLoading.current = loading;
  }, [loading, isExpanded]);

  const handleRowClick = useCallback(() => {
    preserveGitCommitScroll(() => toggleCommitFileExpanded(file.path));
  }, [toggleCommitFileExpanded, file.path]);

  const rowId = `git-commit-file-${encodeURIComponent(file.path)}`;

  return (
    <div id={rowId} className={gitPanelListRowClass}>
      <div
        className={cn(
          gitChangeRowShellClass,
          "cursor-pointer",
          isExpanded && gitPanelExpandedRowInScrollerStickyClass,
          isExpanded && "bg-background",
        )}
        onClick={handleRowClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick();
          }
        }}
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "rotate-90",
          )}
        />
        <Icon icon={iconName} className="size-3 shrink-0" />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <span
            className={cn(
              "min-w-0 truncate font-medium text-foreground",
              gitChangeRowTextClass,
            )}
          >
            {file.path}
          </span>
          <GitChangeLineCounts added={file.added} deleted={file.deleted} />
        </div>
      </div>

      {isExpanded && (
        <div className={gitPanelExpandedDiffClass}>
          {loading ? (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              Loading diff...
            </div>
          ) : diff ? (
            <GitDiffView
              oldContent={diff.oldContent}
              newContent={diff.newContent}
              filePath={file.path}
              fillViewport={false}
            />
          ) : (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              No diff available
            </div>
          )}
        </div>
      )}
    </div>
  );
});
