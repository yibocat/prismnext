import { useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useGitStore, type GitFileItem } from "@/stores/git-store";
import { GitChangeFileRow } from "./git-change-file-row";
import { GitChangesFilterDropdown } from "./git-changes-filter-dropdown";
import {
  GitChangeHeaderDiscardButton,
  GitChangeLineCounts,
  GitChangeStageCheckbox,
  gitPanelListBodyClass,
  gitPanelListHeaderClass,
} from "./git-change-row-chrome";

interface GitChangesDiffListProps {
  files: GitFileItem[];
  gitRoot: string;
}

function discardableFiles(files: GitFileItem[]): GitFileItem[] {
  return files.filter((f) => !f.staged && (f.unstaged || f.untracked));
}

export function GitChangesDiffList({ files, gitRoot }: GitChangesDiffListProps) {
  const { t } = useTranslation();
  const expandedChangeIds = useGitStore((s) => s.expandedChangeIds);
  const expandedSet = useMemo(() => new Set(expandedChangeIds), [expandedChangeIds]);

  const { totalAdded, totalDeleted } = useMemo(
    () => ({
      totalAdded: files.reduce((s, f) => s + f.added, 0),
      totalDeleted: files.reduce((s, f) => s + f.deleted, 0),
    }),
    [files],
  );

  const allStaged =
    files.length > 0 && files.every((f) => f.staged);
  const someStaged = !allStaged && files.some((f) => f.staged);
  const canDiscardAll = discardableFiles(files).length > 0;

  const handleStageAllToggle = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (allStaged) {
        const paths = files.filter((f) => f.staged).map((f) => f.path);
        useGitStore.getState().unstageAll(gitRoot, paths);
      } else {
        const paths = files.filter((f) => !f.staged).map((f) => f.path);
        useGitStore.getState().stageAll(gitRoot, paths);
      }
    },
    [allStaged, files, gitRoot],
  );

  const handleDiscardAll = useCallback(() => {
    const targets = discardableFiles(files);
    if (targets.length === 0) return;
    if (
      !confirm(
        targets.length === 1
          ? t("git.changes.discardConfirmOne", { count: targets.length })
          : t("git.changes.discardConfirm", { count: targets.length }),
      )
    ) {
      return;
    }
    const store = useGitStore.getState();
    void Promise.all(
      targets.map((f) =>
        store.discardFile(
          gitRoot,
          f.path,
          f.staged,
          f.untracked,
          f.worktreeStatus,
        ),
      ),
    );
  }, [files, gitRoot, t]);

  return (
    <div
      className="flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overflow-anchor-none"
      data-git-changes-scroll
    >
      <div className={gitPanelListHeaderClass}>
        <GitChangesFilterDropdown fileCount={files.length} />
        <GitChangeLineCounts added={totalAdded} deleted={totalDeleted} />
        <span className="flex-1 min-w-0" />
        <GitChangeHeaderDiscardButton
          visible={canDiscardAll}
          onClick={handleDiscardAll}
        />
        <GitChangeStageCheckbox
          checked={allStaged}
          indeterminate={someStaged}
          onClick={handleStageAllToggle}
          title={allStaged ? t("git.changes.unstageAll") : t("git.changes.stageAll")}
        />
      </div>

      {files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            {t("modes.git.emptyChanges")}
          </p>
        </div>
      ) : (
        <div className={gitPanelListBodyClass}>
          {files.map((file) => (
            <GitChangeFileRow
              key={file.id}
              gitRoot={gitRoot}
              file={file}
              isExpanded={expandedSet.has(file.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
