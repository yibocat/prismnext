import { useCallback, useEffect, useRef, memo } from "react";
import { ChevronRightIcon, Undo2Icon } from "lucide-react";
import { Icon } from "@iconify/react";
import { useGitStore, type GitFileItem } from "@/stores/git-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GitDiffView } from "./git-diff-view";
import { getFileIconName } from "@/lib/files/file-icon-class";
import {
  GitChangeDiscardSlot,
  GitChangeLineCounts,
  GitChangeNewLabel,
  GitChangeStageCheckbox,
  gitChangeRowShellClass,
  gitChangeRowTextClass,
  gitPanelExpandedRowStickyClass,
} from "./git-change-row-chrome";
import { isGitChangeNewFile } from "./git-change-status";
import { preserveGitChangesScroll } from "./git-changes-tree";
import { navigateFileTreeToPath } from "@/lib/files/navigate-file-tree";

export interface GitChangeFileRowProps {
  gitRoot: string;
  file: GitFileItem;
  isExpanded: boolean;
}

export const GitChangeFileRow = memo(function GitChangeFileRow({
  gitRoot,
  file,
  isExpanded,
}: GitChangeFileRowProps) {
  const loadDiff = useGitStore((s) => s.loadDiff);
  const toggleChangeExpanded = useGitStore((s) => s.toggleChangeExpanded);
  const iconName = getFileIconName(file.path.split("/").pop() || file.path);
  const wasDiffLoading = useRef(false);

  useEffect(() => {
    if (isExpanded && file.diff === null && !file.diffLoading) {
      loadDiff(gitRoot, file.id, file.path);
    }
  }, [isExpanded, file.id, file.path, file.diff, file.diffLoading, loadDiff, gitRoot]);

  // Diff height arriving async must not yank scroll / push rows above.
  useEffect(() => {
    if (wasDiffLoading.current && !file.diffLoading && isExpanded) {
      preserveGitChangesScroll(() => {});
    }
    wasDiffLoading.current = file.diffLoading;
  }, [file.diffLoading, isExpanded]);

  const handleStageToggle = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const store = useGitStore.getState();
      if (file.staged) {
        store.unstageFile(gitRoot, file.path);
      } else {
        store.stageFile(gitRoot, file.path);
      }
    },
    [file.staged, file.path, gitRoot],
  );

  const handleDiscard = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      useGitStore
        .getState()
        .discardFile(
          gitRoot,
          file.path,
          file.staged,
          file.untracked,
          file.worktreeStatus,
        );
    },
    [gitRoot, file.path, file.staged, file.untracked, file.worktreeStatus],
  );

  const handleRowClick = useCallback(() => {
    preserveGitChangesScroll(() => toggleChangeExpanded(file.id));
  }, [toggleChangeExpanded, file.id]);

  const handleOpenInEditor = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      navigateFileTreeToPath(file.path);
      await useDocumentStore.getState().openFile(file.path);
      useRightPanelStore.getState().openFile(
        file.path,
        file.path,
        file.path.split("/").pop() || file.path,
      );
    },
    [file.path],
  );

  const isChecked = file.staged;
  const showDiscard = !file.staged && (file.unstaged || file.untracked);
  const showNew = isGitChangeNewFile(file);

  return (
    <div
      id={`git-change-${file.id}`}
      className="flex flex-col"
    >
      <div
        className={cn(
          gitChangeRowShellClass,
          "transition-colors",
          isExpanded && gitPanelExpandedRowStickyClass,
          isExpanded ? "bg-background" : "hover:bg-accent/50",
        )}
      >
        <div
          className="flex shrink-0 cursor-pointer items-center gap-2"
          onClick={handleRowClick}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-90",
            )}
          />
          <Icon icon={iconName} className="size-3 shrink-0" />
        </div>
        <div
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 overflow-hidden"
          onClick={handleRowClick}
        >
          <button
            type="button"
            className={cn(
              "w-fit max-w-full truncate min-w-0 shrink text-left font-medium text-foreground hover:underline",
              gitChangeRowTextClass,
            )}
            onClick={handleOpenInEditor}
            title={`Open ${file.path} in editor`}
          >
            {file.path}
          </button>
          <GitChangeLineCounts added={file.added} deleted={file.deleted} />
        </div>

        {showNew ? <GitChangeNewLabel /> : null}

        <GitChangeDiscardSlot>
          {showDiscard && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Discard changes"
                >
                  <Undo2Icon className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[length:var(--font-size-11)]">
                Discard
              </TooltipContent>
            </Tooltip>
          )}
        </GitChangeDiscardSlot>

        <GitChangeStageCheckbox
          checked={isChecked}
          onClick={handleStageToggle}
          title={isChecked ? "Unstage" : "Stage"}
        />
      </div>

      {isExpanded && (
        <div>
          {file.diffLoading ? (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              Loading diff...
            </div>
          ) : file.diff ? (
            <GitDiffView
              oldContent={file.diff.oldContent}
              newContent={file.diff.newContent}
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
