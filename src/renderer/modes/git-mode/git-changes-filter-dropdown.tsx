import { useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  FilePlus2Icon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GitForkIcon,
  SquareCheckIcon,
  SquareSlashIcon,
} from "lucide-react";
import { pickDefaultBranch } from "@shared/git-hosting";
import { shouldOfferBranchCommitsMenu, type GitChangesLens } from "@shared/git";
import { i18n } from "@/lib/i18n";
import { useLastAgentTurnLens } from "@/lib/git/agent-turn-lens";
import { useGitStore, type GitCommitData, type GitFilterMode } from "@/stores/git-store";
import { cn } from "@/lib/utils";
import {
  GitChangeLineCounts,
  gitChangeRowTextClass,
  gitToolbarChipClass,
  gitToolbarIconClass,
} from "./git-change-row-chrome";
import {
  filterGitFilesByLens,
  gitFilterModeLineCounts,
  sumGitLineCounts,
} from "./git-changes-tree";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuSeparator,
  AppMenuSub,
  AppMenuSubContent,
  AppMenuSubTrigger,
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

export function changesLensTriggerLabel(
  lens: GitChangesLens,
  count: number,
  commit?: GitCommitData | null,
): string {
  if (lens.kind === "last-agent-turn") {
    return count === 0
      ? i18n.t("git.filter.lastAgentTurn")
      : i18n.t("git.filter.lastAgentTurnCount", { count });
  }
  if (lens.kind === "branch-changes") {
    return count === 0
      ? i18n.t("git.filter.branchChanges")
      : i18n.t("git.filter.branchChangesCount", { count });
  }
  if (lens.kind === "commit") {
    const subject = commit?.message.split("\n")[0]?.trim();
    return subject || lens.hash;
  }
  return filterModeTriggerLabel(lens.mode, count);
}

interface GitChangesFilterDropdownProps {
  fileCount: number;
  className?: string;
}

const lensIconClass = gitToolbarIconClass;

export interface GitChangesLensItem {
  key: string;
  lens: GitChangesLens;
  label: string;
  homeLabel: string;
  icon: ReactNode;
  added: number;
  deleted: number;
  fileCount: number;
  selected: boolean;
}

export function useGitChangesLensItems(): {
  items: GitChangesLensItem[];
  showBranchSection: boolean;
  branchCommits: GitCommitData[];
} {
  const { t } = useTranslation();
  const filterMode = useGitStore((s) => s.filterMode);
  const changesLens = useGitStore((s) => s.changesLens);
  const files = useGitStore((s) => s.files);
  const branch = useGitStore((s) => s.branch);
  const branches = useGitStore((s) => s.branches);
  const branchCommits = useGitStore((s) => s.branchCommits);
  const branchCommitsLoading = useGitStore((s) => s.branchCommitsLoading);
  const branchChanges = useGitStore((s) => s.branchChanges);
  const lastTurn = useLastAgentTurnLens();

  const counts = useMemo(() => gitFilterModeLineCounts(files), [files]);
  const lastTurnCounts = useMemo(
    () =>
      sumGitLineCounts(filterGitFilesByLens(files, { kind: "last-agent-turn" }, lastTurn.paths)),
    [files, lastTurn.paths],
  );
  const defaultBranch = pickDefaultBranch(branches);
  const showBranchSection = shouldOfferBranchCommitsMenu(
    branch,
    defaultBranch,
    branchCommitsLoading ? 1 : branchCommits.length,
  );

  const lastTurnCount = lastTurn.paths.size;
  const allCount = files.length;
  const stagedCount = files.filter((file) => file.staged).length;
  const unstagedCount = files.filter((file) => file.unstaged || file.untracked).length;

  const items = useMemo<GitChangesLensItem[]>(() => {
    const rows: GitChangesLensItem[] = [
      {
        key: "last-agent-turn",
        lens: { kind: "last-agent-turn" },
        label: t("git.filter.lastAgentTurn"),
        homeLabel:
          lastTurnCount === 0
            ? t("git.filter.lastAgentTurn")
            : t("git.filter.lastAgentTurnCount", { count: lastTurnCount }),
        icon: <GitForkIcon className={lensIconClass} />,
        added: lastTurnCounts.added,
        deleted: lastTurnCounts.deleted,
        fileCount: lastTurnCount,
        selected: changesLens.kind === "last-agent-turn",
      },
      {
        key: "working-all",
        lens: { kind: "working", mode: "all" },
        label: t("git.filter.uncommitted"),
        homeLabel: filterModeTriggerLabel("all", allCount),
        icon: <FilePlus2Icon className={lensIconClass} />,
        added: counts.all.added,
        deleted: counts.all.deleted,
        fileCount: allCount,
        selected: changesLens.kind === "working" && filterMode === "all",
      },
      {
        key: "working-staged",
        lens: { kind: "working", mode: "staged" },
        label: t("git.filter.staged"),
        homeLabel: filterModeTriggerLabel("staged", stagedCount),
        icon: <SquareCheckIcon className={lensIconClass} />,
        added: counts.staged.added,
        deleted: counts.staged.deleted,
        fileCount: stagedCount,
        selected: changesLens.kind === "working" && filterMode === "staged",
      },
      {
        key: "working-unstaged",
        lens: { kind: "working", mode: "unstaged" },
        label: t("git.filter.unstaged"),
        homeLabel: filterModeTriggerLabel("unstaged", unstagedCount),
        icon: <SquareSlashIcon className={lensIconClass} />,
        added: counts.unstaged.added,
        deleted: counts.unstaged.deleted,
        fileCount: unstagedCount,
        selected: changesLens.kind === "working" && filterMode === "unstaged",
      },
    ];
    if (showBranchSection) {
      const branchCount = branchChanges?.fileCount ?? 0;
      rows.push({
        key: "branch-changes",
        lens: { kind: "branch-changes" },
        label: t("git.filter.branchChanges"),
        homeLabel:
          branchCount === 0
            ? t("git.filter.branchChanges")
            : t("git.filter.branchChangesCount", { count: branchCount }),
        icon: <GitBranchIcon className={lensIconClass} />,
        added: branchChanges?.added ?? 0,
        deleted: branchChanges?.deleted ?? 0,
        fileCount: branchCount,
        selected: changesLens.kind === "branch-changes",
      });
    }
    return rows;
  }, [
    t,
    lastTurnCount,
    lastTurnCounts,
    allCount,
    stagedCount,
    unstagedCount,
    counts,
    changesLens,
    filterMode,
    showBranchSection,
    branchChanges,
  ]);

  return { items, showBranchSection, branchCommits };
}

/** Center shortcuts when no file diff is open — same layout as Files / Browser recents. */
export function GitChangesLensHome() {
  const changesLens = useGitStore((s) => s.changesLens);
  const setChangesLens = useGitStore((s) => s.setChangesLens);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const loadBranchCommits = useGitStore((s) => s.loadBranchCommits);
  const { items, branchCommits } = useGitChangesLensItems();
  const selected = items.find((item) => item.selected);
  const selectedCommit =
    changesLens.kind === "commit"
      ? branchCommits.find((commit) => commit.hash === changesLens.hash) ?? null
      : null;

  useEffect(() => {
    if (unitRoot) void loadBranchCommits(unitRoot);
  }, [unitRoot, loadBranchCommits]);

  const shortcuts = items.filter((item) => !item.selected);
  const caption = selected
    ? selected.homeLabel
    : changesLensTriggerLabel(
        changesLens,
        selectedCommit ? 1 : 0,
        selectedCommit,
      );

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6">
      <p className={cn(gitChangeRowTextClass, "text-muted-foreground")}>
        {caption}
      </p>
      <div className="w-full max-w-xs space-y-1">
        {shortcuts.map((item) => (
          <button
            key={item.key}
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left",
              gitChangeRowTextClass,
              "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            )}
            onClick={() => setChangesLens(item.lens)}
          >
            <span className="opacity-70">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate">{item.homeLabel}</span>
            <GitChangeLineCounts added={item.added} deleted={item.deleted} />
          </button>
        ))}
      </div>
    </div>
  );
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
  const changesLens = useGitStore((s) => s.changesLens);
  const setChangesLens = useGitStore((s) => s.setChangesLens);
  const branchChanges = useGitStore((s) => s.branchChanges);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const loadBranchCommits = useGitStore((s) => s.loadBranchCommits);
  const { items, showBranchSection, branchCommits } = useGitChangesLensItems();
  const selectedItem = items.find((item) => item.selected);
  const selectedCommit =
    changesLens.kind === "commit"
      ? branchCommits.find((commit) => commit.hash === changesLens.hash) ?? null
      : null;
  const triggerCounts =
    changesLens.kind === "commit"
      ? { added: selectedCommit?.insertions ?? 0, deleted: selectedCommit?.deletions ?? 0 }
      : {
          added: selectedItem?.added ?? 0,
          deleted: selectedItem?.deleted ?? 0,
        };
  const triggerIcon =
    changesLens.kind === "last-agent-turn" ? (
      <GitForkIcon className={lensIconClass} />
    ) : changesLens.kind === "branch-changes" || changesLens.kind === "commit" ? (
      <GitBranchIcon className={lensIconClass} />
    ) : filterMode === "staged" ? (
      <SquareCheckIcon className={lensIconClass} />
    ) : filterMode === "unstaged" ? (
      <SquareSlashIcon className={lensIconClass} />
    ) : (
      <FilePlus2Icon className={lensIconClass} />
    );

  return (
    <AppMenu
      onOpenChange={(open) => {
        if (open && unitRoot) void loadBranchCommits(unitRoot);
      }}
    >
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={cn("group shrink-0", gitToolbarChipClass, className)}
        >
          {triggerIcon}
          <span className="truncate">
            {changesLensTriggerLabel(
              changesLens,
              changesLens.kind === "branch-changes"
                ? branchChanges?.fileCount ?? fileCount
                : fileCount,
              selectedCommit,
            )}
          </span>
          <FilterModeCounts added={triggerCounts.added} deleted={triggerCounts.deleted} />
          <ChevronDownIcon className={cn(gitToolbarIconClass, "opacity-50")} />
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="start" className="min-w-[13rem]">
        {items.map((item) => (
          <AppMenuCheckItem
            key={item.key}
            className="group"
            leading={item.icon}
            selected={item.selected}
            onClick={() => setChangesLens(item.lens)}
            titleAddon={<FilterModeCounts added={item.added} deleted={item.deleted} />}
          >
            {item.label}
          </AppMenuCheckItem>
        ))}
        {showBranchSection ? (
          <>
            <AppMenuSeparator />
            <AppMenuSub>
              <AppMenuSubTrigger leading={<GitCommitHorizontalIcon className={lensIconClass} />}>
                {t("git.filter.commits")}
              </AppMenuSubTrigger>
              <AppMenuSubContent className="min-w-[14rem]">
                {branchCommits.length === 0 ? (
                  <AppMenuCheckItem disabled>
                    {t("git.filter.commitsNone")}
                  </AppMenuCheckItem>
                ) : (
                  branchCommits.map((commit) => (
                    <AppMenuCheckItem
                      key={commit.hash}
                      className="group"
                      selected={
                        changesLens.kind === "commit" && changesLens.hash === commit.hash
                      }
                      onClick={() => setChangesLens({ kind: "commit", hash: commit.hash })}
                      titleAddon={
                        <FilterModeCounts
                          added={commit.insertions}
                          deleted={commit.deletions}
                        />
                      }
                    >
                      {commit.message.split("\n")[0]?.trim() || commit.hash}
                    </AppMenuCheckItem>
                  ))
                )}
              </AppMenuSubContent>
            </AppMenuSub>
          </>
        ) : null}
      </AppMenuContent>
    </AppMenu>
  );
}
