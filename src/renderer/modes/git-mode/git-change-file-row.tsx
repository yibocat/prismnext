import { useCallback, useEffect, useRef, memo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon, Undo2Icon } from "lucide-react";
import { Icon } from "@iconify/react/offline";
import { useGitStore, type GitFileItem } from "@/stores/git-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { GitDiffView } from "./git-diff-view";
import { getFileIconName } from "@/lib/files/file-icon-class";
import {
  GitChangeDiscardSlot,
  GitChangeLineCounts,
  GitChangeNewLabel,
  GitChangeDeletedLabel,
  GitChangeStageCheckbox,
  gitChangeRowShellClass,
  gitChangeRowTextClass,
  gitPanelExpandedRowStickyClass,
  gitPanelListRowClass,
  gitPanelExpandedDiffClass,
} from "./git-change-row-chrome";
import { isGitChangeDeletedFile, isGitChangeNewFile } from "./git-change-status";
import { preserveGitChangesScroll } from "./git-changes-tree";
import { navigateFileTreeToPath } from "@/lib/files/navigate-file-tree";
import { setComposerDragData } from "@/lib/chat/composer-drag";
import { gitDiffDragPayload } from "@/lib/chat/git-diff-drag";
import { buildFullFileGitDiffSnippet } from "@/lib/git/diff-hunk-snippet";
import { useGitDiffPrefsStore } from "@/stores/git-diff-prefs-store";
import { toast } from "sonner";

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
  const { t } = useTranslation();
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
  const showDeleted = !showNew && isGitChangeDeletedFile(file);

  const prefetchDiff = useCallback(() => {
    if (file.diff === null && !file.diffLoading) {
      void loadDiff(gitRoot, file.id, file.path);
    }
  }, [file.diff, file.diffLoading, file.id, file.path, gitRoot, loadDiff]);

  const handleRowDragStart = useCallback(
    (e: React.DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, button")) {
        e.preventDefault();
        return;
      }
      if (!file.diff) {
        e.preventDefault();
        void loadDiff(gitRoot, file.id, file.path);
        toast.info(t("git.changes.loadingDiffDrag", { defaultValue: "Loading diff… try dragging again" }));
        return;
      }
      const layout = useGitDiffPrefsStore.getState().layout;
      const snippet = buildFullFileGitDiffSnippet(
        file.path,
        file.diff.oldContent,
        file.diff.newContent,
        layout,
      );
      if (!snippet) {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      setComposerDragData(e.dataTransfer, [gitDiffDragPayload(snippet)]);
    },
    [file, gitRoot, loadDiff, t],
  );

  return (
    <div
      id={`git-change-${file.id}`}
      className={gitPanelListRowClass}
    >
      <div
        className={cn(
          gitChangeRowShellClass,
          isExpanded && gitPanelExpandedRowStickyClass,
          isExpanded && "bg-background",
        )}
        draggable
        onMouseDown={prefetchDiff}
        onDragStart={handleRowDragStart}
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
          <div className="min-w-0 w-fit max-w-full overflow-hidden">
            <Hint
              label={t("git.changes.openInEditor", { path: file.path })}
              triggerClassName="max-w-full justify-start"
            >
              <button
                type="button"
                className={cn(
                  "block max-w-full truncate text-left font-medium text-foreground hover:underline",
                  gitChangeRowTextClass,
                )}
                onClick={handleOpenInEditor}
              >
                {file.path}
              </button>
            </Hint>
          </div>
          <GitChangeLineCounts added={file.added} deleted={file.deleted} />
        </div>

        {showNew ? <GitChangeNewLabel /> : null}
        {showDeleted ? <GitChangeDeletedLabel /> : null}

        <GitChangeDiscardSlot>
          {showDiscard && (
            <Hint label={t("git.changes.discard")}>
              <button
                type="button"
                onClick={handleDiscard}
                className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Undo2Icon className="size-3" />
              </button>
            </Hint>
          )}
        </GitChangeDiscardSlot>

        <GitChangeStageCheckbox
          checked={isChecked}
          onClick={handleStageToggle}
          title={isChecked ? t("git.changes.unstage") : t("git.changes.stage")}
        />
      </div>

      {isExpanded && (
        <div className={gitPanelExpandedDiffClass}>
          {file.diffLoading ? (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              {t("git.changes.loadingDiff")}
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
              {t("git.changes.noDiff")}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
