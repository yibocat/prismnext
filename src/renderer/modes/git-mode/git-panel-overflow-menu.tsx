import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoreHorizontalIcon, Loader2Icon } from "lucide-react";
import { formatRemoteUrlSummary } from "@shared/git";
import {
  firstCommitSubject,
  formatGhPrCreateCommand,
  pickDefaultBranch,
} from "@shared/git-hosting";
import { insertTextToChat } from "@/lib/chat/insert-to-chat";
import { openExternalUrl } from "@/lib/desktop-api/shell";
import { buildAskAgentPrPrompt, GH_CLI_INSTALL_URL } from "@/lib/git/agent-pr-prompt";
import { shouldOfferCreatePr, shouldShowCreatePrEntry } from "@/lib/git/git-publish";
import { openMode } from "@/lib/workspace/open-right-area-mode";
import { writeClipboardText } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
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
  /** Hosting (Create PR) is Local-only — worktree toolbar stays Merge-first. */
  allowHosting?: boolean;
}

export function GitPanelOverflowMenu({
  projectRoot,
  variant,
  allowHosting = true,
}: GitPanelOverflowMenuProps) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const tracking = useGitStore((s) => s.tracking);
  const remotes = useGitStore((s) => s.remotes);
  const syncing = useGitStore((s) => s.syncing);
  const branch = useGitStore((s) => s.branch);
  const branches = useGitStore((s) => s.branches);
  const ghAuth = useGitStore((s) => s.ghAuth);
  const defaultBranch = pickDefaultBranch(branches);
  const showCreatePr = allowHosting && shouldShowCreatePrEntry(tracking, {
    currentBranch: branch,
    defaultBranch,
  });
  const canCreatePr = shouldOfferCreatePr(tracking, {
    currentBranch: branch,
    defaultBranch,
    ghInstalled: ghAuth.installed,
    ghAuthenticated: ghAuth.authenticated,
  });
  const prCommand = formatGhPrCreateCommand({
    title: branch,
    base: defaultBranch,
    head: branch,
  });

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

  const handleFetch = useCallback(async () => {
    if (!projectRoot || syncing) return;
    await useGitStore.getState().fetchRemote(projectRoot);
  }, [projectRoot, syncing]);

  const handlePull = useCallback(async () => {
    if (!projectRoot || syncing) return;
    await useGitStore.getState().pullRemote(projectRoot);
  }, [projectRoot, syncing]);

  const handleFetchAll = useCallback(async () => {
    if (!projectRoot || syncing) return;
    await useGitStore.getState().fetchRemote(projectRoot, { all: true });
  }, [projectRoot, syncing]);

  const handleCreatePr = useCallback(() => {
    if (!projectRoot || !canCreatePr) return;
    void useGitStore.getState().openCreatePr(projectRoot);
  }, [canCreatePr, projectRoot]);

  const handleCopyPrCommand = useCallback(() => {
    void writeClipboardText(prCommand).then((ok) => {
      if (ok) toast.success(t("git.toast.copiedCommand"));
    });
  }, [prCommand, t]);

  const handleAskAgentPr = useCallback(() => {
    const commits = useGitStore.getState().commits
      .slice(0, 5)
      .map((commit) => firstCommitSubject(commit.message))
      .filter(Boolean);
    const chat = useChatStore.getState();
    const tab = chat.tabs.find((item) => item.id === chat.activeTabId);
    insertTextToChat(
      buildAskAgentPrPrompt({
        head: branch,
        base: defaultBranch,
        title: branch,
        commitSubjects: commits,
        sessionId: tab?.sessionId || undefined,
      }),
    );
  }, [branch, defaultBranch]);

  const handleInstallGh = useCallback(() => {
    void openExternalUrl(GH_CLI_INSTALL_URL);
  }, []);

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

        {isChanges ? (
          <>
            <AppMenuSeparator />
            <AppMenuItem
              disabled={!tracking.hasRemote || Boolean(syncing)}
              onClick={() => void handleFetch()}
              trailing={
                syncing === "fetch" ? (
                  <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                ) : null
              }
            >
              {t("git.overflow.fetch")}
            </AppMenuItem>
            <AppMenuItem
              disabled={
                !tracking.upstreamRef
                || tracking.behindCount === 0
                || Boolean(syncing)
              }
              onClick={() => void handlePull()}
              trailing={
                syncing === "pull" ? (
                  <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                ) : null
              }
            >
              {t("git.overflow.pull")}
            </AppMenuItem>
            <AppMenuItem
              disabled={!tracking.hasRemote || Boolean(syncing)}
              onClick={() => void handleFetchAll()}
            >
              {t("git.overflow.fetchAll")}
            </AppMenuItem>
            {showCreatePr ? (
              <>
                <AppMenuItem
                  disabled={!canCreatePr}
                  title={!canCreatePr ? t("git.overflow.createPrHint") : undefined}
                  description={!canCreatePr ? t("git.overflow.createPrHint") : undefined}
                  onClick={handleCreatePr}
                >
                  {t("git.overflow.createPr")}
                </AppMenuItem>
                {!canCreatePr ? (
                  <>
                    <AppMenuItem onClick={handleCopyPrCommand}>
                      {t("git.overflow.copyPrCommand")}
                    </AppMenuItem>
                    <AppMenuItem onClick={handleAskAgentPr}>
                      {t("git.overflow.askAgentPr")}
                    </AppMenuItem>
                    <AppMenuItem onClick={handleInstallGh}>
                      {t("git.overflow.installGh")}
                    </AppMenuItem>
                  </>
                ) : null}
              </>
            ) : null}

            <AppMenuSeparator />
            <AppMenuLabel>{t("git.overflow.remotes")}</AppMenuLabel>
            {remotes.length === 0 ? null : (
              remotes.map((remote) => (
                <AppMenuItem key={remote.name} disabled>
                  {remote.url
                    ? `${remote.name} · ${formatRemoteUrlSummary(remote.url)}`
                    : remote.name}
                </AppMenuItem>
              ))
            )}
            <AppMenuItem onClick={() => useGitStore.getState().openAddRemote()}>
              {t("git.overflow.addRemote")}
            </AppMenuItem>
            <AppMenuItem
              onClick={() => {
                openMode("terminal", { intent: "add" });
              }}
            >
              {t("git.overflow.openTerminal")}
            </AppMenuItem>
          </>
        ) : null}

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