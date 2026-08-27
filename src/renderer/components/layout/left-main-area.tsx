import { useEffect, useRef, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentEvents } from "@/hooks/use-agent-events";
import { useTrayStatusSync } from "@/hooks/use-tray-status-sync";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useGitStore } from "@/stores/git-store";
import { clearPdfCache, useCompileStore } from "@/stores/compile-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import {
  prefetchPiModelsCatalog,
  resolveSelectedModelContextTokens,
  resolveSelectedModelContextTokensIfKnown,
  subscribePiModelsCatalog,
} from "@/lib/providers";
import { GitBranchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatFileDrop } from "@/lib/chat/use-chat-file-drop";
import { chatFileDropZoneClass } from "@/lib/chat/chat-file-drag-overlay";
import { ShortcutKbdChips } from "@/lib/shortcuts";

import {
  GeneralSettings,
  AppearanceSettings,
  CompilerSettings,
  ModelSettings,
  BackupsSettings,
  AgentAssetsSettings,
  PromptsRulesSettings,
  PermissionsSettings,
  WorkspaceSettings,
  TerminalSettings,
  TexworkspaceSettings,
  BrowserSettings,
  LiteratureSettings,
  AboutSettings,
} from "@/components/modules/settings";
import { TemplateCenter } from "@/components/modules/templates/template-center";
import { TeamsCenter } from "@/components/modules/teams/teams-center";
import { ChatMessages, ChatComposer, ChatErrorBoundary, ContextWindowIndicator, RestoreUndoBar } from "@/components/modules/chat";
import { ChatHomeBackdrop } from "@/components/modules/chat/chat-home-backdrop";
import { CHAT_PANEL_TOOLBAR_BUTTON } from "@/components/modules/chat/worktree-selector";
import { BranchSelector } from "@/components/modules/chat/branch-selector";
import { ExecutionHostSelector, RemoteOneClickConnectButton } from "@/components/modules/chat/execution-host-selector";
import { ProjectSelector } from "@/components/modules/chat/project-selector";
import { executionHostLabel } from "@/lib/remote/display";
import { useRemoteStore } from "@/stores/remote-store";
import { selectableWorkbenchProjects, useWorkbenchStore } from "@/stores/workbench-store";
import { WorktreeActions } from "@/components/modules/chat/worktree-actions";
import { formatBranchWorktreeLabel, isWorktreeCheckoutPath } from "@/lib/git/checkout-context";


export function LeftMainArea() {
  const { t } = useTranslation();
  useAgentEvents();
  useTrayStatusSync();

  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const checkoutRoot = useDocumentStore((s) => s.checkoutRoot);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const remoteHosts = useRemoteStore((s) => s.hosts);
  const members = useWorkbenchStore((s) => selectableWorkbenchProjects(s));
  const focusProjectId = useWorkbenchStore((s) => s.focusProjectId);
  const sessionProjectIds = useWorkbenchStore((s) => s.sessionProjectIds);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const currentProjectId = (activeTabId && sessionProjectIds[activeTabId]) || focusProjectId;
  const currentProject = members.find((member) => member.id === currentProjectId) ?? members[0];
  const projectDisplayName = currentProject?.displayName || t("chat.project.select");
  const hostLabel = executionHostLabel(projectRoot, remoteHosts, t("chat.toolbar.hostLocal"));
  const showWorktreeActions = Boolean(
    activeWorktree || (projectRoot && checkoutRoot && isWorktreeCheckoutPath(checkoutRoot, projectRoot)),
  );


  // When manuscript is removed from workspace config, clean up all
  // TeXworkspace state: PDF cache, compile log, and open texworkspace tabs.
  // The content area already shows the "No manuscript folder configured"
  // placeholder; this ensures stale PDF data and editor state are cleared.
  useEffect(() => {
    const unsub = useWorkspaceConfigStore.subscribe((state, prev) => {
      if (prev.manuscriptConfig && !state.manuscriptConfig) {
        clearPdfCache();
        useCompileStore.getState().clearCompileState();
        useRightPanelStore.getState().closeTabsOfKind("texworkspace");
      }
    });
    return unsub;
  }, []);

  const hasConversation = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    const conv = tab?.conversation;
    return Boolean(conv && (conv.turns.length > 0 || conv.live));
  });
  const isStreaming = useChatStore((s) => s.isStreaming);
  const contextTokens = useChatStore((s) => s.contextTokens);
  const contextWindowSize = useChatStore((s) => s.contextWindowSize);
  const contextUsageSource = useChatStore((s) => s.contextUsageSource);
  const contextCostUsd = useChatStore((s) => s.contextCostUsd);
  const contextBreakdown = useChatStore((s) => s.contextBreakdown);
  const promptStale = useChatStore((s) => s.promptStale);
  const sessionId = useChatStore((s) => s.sessionId);
  const isLoadingSession = useChatStore((s) => s.isLoadingSession);
  const sessionAgent = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.sessionAgent ?? "build";
  });
  const setSessionAgent = useChatStore((s) => s.setSessionAgent);
  const showHomepage =
    !hasConversation && !isStreaming && !isLoadingSession;
  /** New empty session shortcut — same as slash Modes → Plan; hide once in Plan. */
  const showPlanNewIdea = showHomepage && sessionAgent !== "plan";
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const [homepageComposerMotion, setHomepageComposerMotion] = useState(false);
  useEffect(() => {
    if (!showHomepage) {
      setHomepageComposerMotion(false);
      return;
    }
    // First paint must already be docked or centered. Enabling the
    // flex-grow transition earlier would interpolate from the
    // unmatched @xl class (grow 0) on every empty-chat mount.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setHomepageComposerMotion(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [showHomepage]);
  const {
    dragActive: chatFileDragActive,
    zoneRef: chatFileDropZoneRef,
    dropHandlers: chatFileDropHandlers,
  } = useChatFileDrop({ enabled: !editorMaximized });

  useEffect(() => {
    if (sessionId) {
      void useChatStore.getState().checkPromptStale();
    }
  }, [sessionId]);

  // ── Dynamic context window total from selected model ──
  const aiProvider = useSettingsStore((s) => s.settings.aiProvider) || "anthropic";
  const aiModel = useSettingsStore((s) => s.settings.aiModel);
  const aiEnabledModels = useSettingsStore((s) => s.settings.aiEnabledModels);
  const aiCustomModelsData = useSettingsStore((s) => s.settings.aiCustomModelsData);
  const aiCustomProviders = useSettingsStore((s) => s.settings.aiCustomProviders);
  const [catalogTick, setCatalogTick] = useState(0);
  useEffect(() => {
    void prefetchPiModelsCatalog().then(() => {
      setCatalogTick((n) => n + 1);
    });
    return subscribePiModelsCatalog(() => {
      setCatalogTick((n) => n + 1);
    });
  }, []);
  const contextTotal = useMemo(() => {
    void catalogTick;
    const custom = aiCustomModelsData
      ? Object.fromEntries(
          Object.entries(aiCustomModelsData).map(([k, v]) => [k, v as any]),
        )
      : undefined;
    const selected = resolveSelectedModelContextTokensIfKnown(
      aiProvider,
      aiModel ?? undefined,
      aiEnabledModels,
      custom,
      aiCustomProviders,
    );
    if (typeof selected === "number" && selected > 0) return selected;
    if (typeof contextWindowSize === "number" && contextWindowSize > 0) {
      return contextWindowSize;
    }
    return resolveSelectedModelContextTokens(
      aiProvider,
      aiModel ?? undefined,
      aiEnabledModels,
      custom,
      aiCustomProviders,
    );
  }, [
    contextWindowSize,
    aiProvider,
    aiModel,
    aiEnabledModels,
    aiCustomModelsData,
    aiCustomProviders,
    catalogTick,
  ]);

  // Branch + worktree label for chat view bottom bar
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const WT_PREFIX = "wt-";
  const currentGitBranch = useGitStore((s) => s.branch);
  const lastProjectBranch = useRef(
    currentGitBranch && !currentGitBranch.startsWith(WT_PREFIX)
      ? currentGitBranch
      : activeWorktree?.baseBranch || "",
  );
  useEffect(() => {
    if (currentGitBranch && !currentGitBranch.startsWith(WT_PREFIX)) {
      lastProjectBranch.current = currentGitBranch;
    }
  }, [currentGitBranch]);

  const displayBranch =
    activeWorktree?.baseBranch ??
    (currentGitBranch && !currentGitBranch.startsWith(WT_PREFIX)
      ? currentGitBranch
      : lastProjectBranch.current || "...");

  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const settingsCategory = useLayoutStore((s) => s.settingsCategory);
  const proSettings = useProLicenseStore((s) => s.contributions.settings);

  // centerView 型导航项的页面路由：新增入口时在此增加 leftSidebarView 分支
  // （定义见 left-nav/items.tsx，centerView 字段须与下方判断一致）
  if (leftSidebarView === "templates") {
    return (
      <div className="flex h-full flex-col min-w-0" data-surface="content">
        <TemplateCenter
          onBack={() => useLayoutStore.getState().setLeftSidebarView("sessions")}
        />
      </div>
    );
  }

  if (leftSidebarView === "teams") {
    return (
      <div className="flex h-full flex-col min-w-0" data-surface="content">
        <TeamsCenter
          onBack={() => useLayoutStore.getState().setLeftSidebarView("sessions")}
        />
      </div>
    );
  }

  if (leftSidebarView === "settings") {
    const resolvedCategory =
      settingsCategory === "zotero" ? "literature" : settingsCategory;
    const BuiltinSettings = {
      general: GeneralSettings,
      appearance: AppearanceSettings,
      models: ModelSettings,
      "teams-agents": AgentAssetsSettings,
      terminal: TerminalSettings,
      browser: BrowserSettings,
      "prompts-rules": PromptsRulesSettings,
      "prompts-rules-commands": PromptsRulesSettings,
      permissions: PermissionsSettings,
      commands: AgentAssetsSettings,
      "tools-mcp": AgentAssetsSettings,
      skills: AgentAssetsSettings,
      compiler: CompilerSettings,
      texworkspace: TexworkspaceSettings,
      workspace: WorkspaceSettings,
      literature: LiteratureSettings,
      backups: BackupsSettings,
      about: AboutSettings,
    }[resolvedCategory];
    if (BuiltinSettings) {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden" data-surface="content">
          <BuiltinSettings />
        </div>
      );
    }
    const pro = proSettings.find((c) => c.id === resolvedCategory);
    if (pro) {
      const ProSettingsContent = pro.Content;
      return (
        <div className="flex h-full flex-col min-w-0" data-surface="content">
          <ProSettingsContent />
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col min-w-0" data-surface="content">
        <GeneralSettings />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-w-0 @container" data-surface="content">
      <ChatErrorBoundary>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sm bg-background">
          <ChatHomeBackdrop />
          {showHomepage ? (
          /* ── Homepage ──
           * Narrow: trail flex-grow 0 (docked). @xl+: trail flex-grow 1
           * and titlebar padding (optical center). justify-content cannot
           * interpolate, so the two states are the same flex column with
           * a trailing spacer — same 220ms flex-grow as the shell panels. */
          <div
            ref={chatFileDropZoneRef}
            className={cn(
              "relative z-10 flex min-w-0 flex-1 flex-col items-center overflow-x-hidden pb-0 @xl:pb-[var(--height-titlebar)]",
              chatFileDragActive && chatFileDropZoneClass,
            )}
            data-homepage-composer=""
            data-homepage-composer-motion={homepageComposerMotion ? "" : undefined}
            {...chatFileDropHandlers}
          >
            {chatFileDragActive ? (
              <span className="pointer-events-none absolute bottom-10 left-1/2 z-30 -translate-x-1/2 rounded-md border border-primary/25 bg-background/95 px-3 py-1 text-[length:var(--font-size-11)] text-muted-foreground shadow-sm">
                {t("chat.aibar.dropFiles")}
              </span>
            ) : null}
            <div aria-hidden data-homepage-composer-lead="" className="pointer-events-none min-h-0 flex-1" />
            <div className="relative z-10 flex w-full flex-col items-center">
              {/* Project / branch / host (worktrees live under Host) */}
              <div data-chat-width className="flex h-6 w-full items-center gap-1.5 px-3">
                <ProjectSelector />
                <BranchSelector />
                <ExecutionHostSelector />
                <RemoteOneClickConnectButton />
              </div>

              {/* Composer */}
              {!editorMaximized && (
                <div data-chat-width className="w-full">
                  <ChatComposer />
                </div>
              )}
              {/* Suggestion chips under homepage composer (gap from composer = composer py) */}
              <div
                data-chat-width
                className="mb-2 flex h-6 w-full items-center gap-1.5 px-3 text-[length:var(--font-chat-meta)] text-muted-foreground/70"
              >
              {showPlanNewIdea ? (
                <button
                  type="button"
                  className={cn(
                    CHAT_PANEL_TOOLBAR_BUTTON,
                    "text-muted-foreground/70 hover:text-accent-foreground",
                  )}
                  onClick={() => setSessionAgent("plan")}
                >
                  <span>{t("chat.toolbar.planNewIdea")}</span>
                  <ShortcutKbdChips id="product.togglePlanMode" />
                </button>
              ) : null}
              <span className="flex-1" />
              </div>
            </div>
            <div
              aria-hidden
              data-homepage-composer-trail=""
              className="pointer-events-none min-h-0 basis-0 grow-0 @xl:grow"
            />
          </div>
        ) : (
          /* ── Chat view ── */
          <div
            ref={chatFileDropZoneRef}
            className={cn(
              "relative z-10 flex min-w-0 flex-1 flex-col overflow-x-hidden",
              chatFileDragActive && chatFileDropZoneClass,
            )}
            {...chatFileDropHandlers}
          >
            {chatFileDragActive ? (
              <span className="pointer-events-none absolute bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-md border border-primary/25 bg-background/95 px-3 py-1 text-[length:var(--font-size-11)] text-muted-foreground shadow-sm">
                {t("chat.aibar.dropFiles")}
              </span>
            ) : null}

            <ChatMessages />
            <RestoreUndoBar />
            {showWorktreeActions && (
              <div data-chat-width className="w-full flex items-center gap-1.5 h-6 px-3">
                <WorktreeActions />
              </div>
            )}

            <div className="relative z-50 shrink-0">
              <div data-chat-width className="w-full">
                {!editorMaximized && <ChatComposer />}
              </div>
              <div data-chat-width className="w-full flex items-center gap-1.5 h-6 px-3 mb-2 text-[length:var(--font-chat-meta)] text-muted-foreground/70">
                <span className="truncate max-w-[120px]">{projectDisplayName}</span>
                <span className="opacity-40">·</span>
                <span className="truncate max-w-[120px]">{hostLabel}</span>
                {isGitRepo && (
                  <span className="flex items-center gap-1">
                    <GitBranchIcon className="size-3 shrink-0" />
                    <span className="truncate max-w-[160px]">
                      {formatBranchWorktreeLabel(displayBranch, activeWorktree?.name)}
                    </span>
                  </span>
                )}
                <span className="flex-1" />
                {(contextTokens != null || contextWindowSize != null || contextCostUsd != null || sessionId) && (
                  <ContextWindowIndicator
                    used={contextTokens}
                    total={contextTotal}
                    source={contextUsageSource}
                    costUsd={contextCostUsd}
                    breakdown={contextBreakdown}
                    promptStale={promptStale}
                    isStreaming={isStreaming}
                  />
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </ChatErrorBoundary>
    </div>
  );
}
