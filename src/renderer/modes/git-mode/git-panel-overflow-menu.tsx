import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontalIcon, Loader2Icon } from "lucide-react";
import { useGitStore } from "@/stores/git-store";
import { useGitDiffPrefsStore } from "@/stores/git-diff-prefs-store";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSeparator,
  AppMenuShortcut,
  AppMenuSwitchRow,
  AppMenuTrigger,
} from "@/components/ui/app-menu";

const toolbarBtn =
  "flex items-center justify-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors";

export type GitPanelOverflowVariant = "changes" | "history";

interface GitPanelOverflowMenuProps {
  projectRoot: string;
  variant: GitPanelOverflowVariant;
}

export function GitPanelOverflowMenu({
  projectRoot,
  variant,
}: GitPanelOverflowMenuProps) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  const layout = useGitDiffPrefsStore((s) => s.layout);
  const wordWrap = useGitDiffPrefsStore((s) => s.wordWrap);
  const ignoreWhitespace = useGitDiffPrefsStore((s) => s.ignoreWhitespace);
  const setLayout = useGitDiffPrefsStore((s) => s.setLayout);
  const setWordWrap = useGitDiffPrefsStore((s) => s.setWordWrap);
  const setIgnoreWhitespace = useGitDiffPrefsStore((s) => s.setIgnoreWhitespace);

  const isChanges = variant === "changes";

  const handleRefresh = useCallback(async () => {
    if (!projectRoot || refreshing) return;
    setRefreshing(true);
    try {
      if (isChanges) {
        await useGitStore.getState().forceRefreshStatus(projectRoot);
        await useGitStore.getState().refreshBranches(projectRoot);
      } else {
        await useGitStore.getState().loadHistory(projectRoot);
      }
    } finally {
      setRefreshing(false);
    }
  }, [isChanges, projectRoot, refreshing]);

  const handleIgnoreWhitespaceChange = useCallback(
    async (next: boolean) => {
      setIgnoreWhitespace(next);
      if (isChanges) {
        useGitStore.getState().clearAllDiffs();
        await useGitStore.getState().reloadExpandedDiffs(projectRoot);
      }
    },
    [isChanges, projectRoot, setIgnoreWhitespace],
  );

  const handleCollapseAll = useCallback(() => {
    if (isChanges) {
      useGitStore.getState().collapseAllChanges();
    } else {
      useGitStore.getState().collapseAllCommitFiles();
    }
  }, [isChanges]);

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={toolbarBtn}
          aria-label={
            isChanges
              ? t("git.overflow.changesOptions")
              : t("git.overflow.historyOptions")
          }
        >
          <MoreHorizontalIcon className="size-3.5" />
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="end">
        <AppMenuLabel>{t("git.overflow.layout")}</AppMenuLabel>
        <AppMenuCheckItem
          selected={layout === "unified"}
          onClick={() => setLayout("unified")}
        >
          {t("git.overflow.unified")}
        </AppMenuCheckItem>
        <AppMenuCheckItem selected={layout === "split"} onClick={() => setLayout("split")}>
          {t("git.overflow.split")}
        </AppMenuCheckItem>

        <AppMenuSeparator />

        <AppMenuSwitchRow
          label={t("git.overflow.ignoreWhitespace")}
          checked={ignoreWhitespace}
          onCheckedChange={(v) => void handleIgnoreWhitespaceChange(v)}
          title={t("git.overflow.ignoreWhitespaceTitle")}
        />
        <AppMenuSwitchRow
          label={t("git.overflow.wordWrap")}
          checked={wordWrap}
          onCheckedChange={setWordWrap}
        />

        <AppMenuSeparator />

        <AppMenuItem onClick={handleCollapseAll}>{t("git.overflow.collapseAll")}</AppMenuItem>

        <AppMenuItem
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          trailing={
            refreshing ? (
              <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
            ) : isChanges ? (
              <AppMenuShortcut>⌘R</AppMenuShortcut>
            ) : null
          }
        >
          {isChanges
            ? t("git.overflow.refreshChanges")
            : t("git.overflow.refreshHistory")}
        </AppMenuItem>
      </AppMenuContent>
    </AppMenu>
  );
}

/** @deprecated Use GitPanelOverflowMenu */
export const GitChangesOverflowMenu = GitPanelOverflowMenu;
