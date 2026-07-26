import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "lucide-react";
import { i18n } from "@/lib/i18n";
import { useGitStore, type GitFilterMode } from "@/stores/git-store";
import { cn } from "@/lib/utils";
import { gitChangeRowTextClass } from "./git-change-row-chrome";
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

export function GitChangesFilterDropdown({
  fileCount,
  className,
}: GitChangesFilterDropdownProps) {
  const { t } = useTranslation();
  const filterMode = useGitStore((s) => s.filterMode);
  const setFilterMode = useGitStore((s) => s.setFilterMode);

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded px-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            gitChangeRowTextClass,
            className,
          )}
        >
          <span className="truncate">{filterModeTriggerLabel(filterMode, fileCount)}</span>
          <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="start">
        <AppMenuCheckItem
          selected={filterMode === "all"}
          onClick={() => setFilterMode("all")}
        >
          {t("git.filter.uncommitted")}
        </AppMenuCheckItem>
        <AppMenuCheckItem
          selected={filterMode === "staged"}
          onClick={() => setFilterMode("staged")}
        >
          {t("git.filter.staged")}
        </AppMenuCheckItem>
        <AppMenuCheckItem
          selected={filterMode === "unstaged"}
          onClick={() => setFilterMode("unstaged")}
        >
          {t("git.filter.unstaged")}
        </AppMenuCheckItem>
      </AppMenuContent>
    </AppMenu>
  );
}
