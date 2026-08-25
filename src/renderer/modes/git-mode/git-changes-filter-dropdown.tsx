import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "lucide-react";
import { i18n } from "@/lib/i18n";
import { useGitStore, type GitFilterMode } from "@/stores/git-store";
import { cn } from "@/lib/utils";
import { GitChangeLineCounts, gitChangeRowTextClass } from "./git-change-row-chrome";
import { gitFilterModeLineCounts } from "./git-changes-tree";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuTrigger,
} from "@/components/ui/app-menu";

export function filterModeTriggerLabel(
  mode: GitFilterMode,
  count: number,
): string {
  switch (mode) {
    case "staged":
      return count === 0
        ? i18n.t("git.filter.stagedChanges")
        : i18n.t("git.filter.stagedChangesCount", { count });
    case "unstaged":
      return count === 0
        ? i18n.t("git.filter.unstagedChanges")
        : i18n.t("git.filter.unstagedChangesCount", { count });
    case "all":
      return count === 0
        ? i18n.t("git.filter.uncommittedChanges")
        : i18n.t("git.filter.uncommittedChangesCount", { count });
  }
}

interface GitChangesFilterDropdownProps {
  fileCount: number;
  className?: string;
}

function FilterModeCounts({
  added,
  deleted,
}: {
  added: number;
  deleted: number;
}) {
  return <GitChangeLineCounts added={added} deleted={deleted} tone="hover" />;
}

export function GitChangesFilterDropdown({
  fileCount,
  className,
}: GitChangesFilterDropdownProps) {
  const { t } = useTranslation();
  const filterMode = useGitStore((s) => s.filterMode);
  const setFilterMode = useGitStore((s) => s.setFilterMode);
  const files = useGitStore((s) => s.files);
  const counts = useMemo(() => gitFilterModeLineCounts(files), [files]);
  const current = counts[filterMode];

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex h-7 shrink-0 items-center gap-1 rounded bg-transparent px-1.5 font-medium text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground",
            gitChangeRowTextClass,
            className,
          )}
        >
          <span className="truncate">{filterModeTriggerLabel(filterMode, fileCount)}</span>
          <FilterModeCounts added={current.added} deleted={current.deleted} />
          <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="start" className="min-w-[12rem]">
        <AppMenuCheckItem
          className="group"
          selected={filterMode === "all"}
          onClick={() => setFilterMode("all")}
          titleAddon={<FilterModeCounts added={counts.all.added} deleted={counts.all.deleted} />}
        >
          {t("git.filter.uncommitted")}
        </AppMenuCheckItem>
        <AppMenuCheckItem
          className="group"
          selected={filterMode === "staged"}
          onClick={() => setFilterMode("staged")}
          titleAddon={
            <FilterModeCounts added={counts.staged.added} deleted={counts.staged.deleted} />
          }
        >
          {t("git.filter.staged")}
        </AppMenuCheckItem>
        <AppMenuCheckItem
          className="group"
          selected={filterMode === "unstaged"}
          onClick={() => setFilterMode("unstaged")}
          titleAddon={
            <FilterModeCounts added={counts.unstaged.added} deleted={counts.unstaged.deleted} />
          }
        >
          {t("git.filter.unstaged")}
        </AppMenuCheckItem>
      </AppMenuContent>
    </AppMenu>
  );
}
