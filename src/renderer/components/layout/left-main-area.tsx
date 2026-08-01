import { useEffect, useRef, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOpenCodeEvents } from "@/hooks/use-opencode-events";
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
import {
  prefetchOpenCodeModelsCatalog,
  resolveSelectedModelContextTokens,
  subscribeOpenCodeModelsCatalog,
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
  AgentSettings,
  PromptsRulesSettings,
  PermissionsSettings,
  SlashCommandsSettings,
  ToolsMcpSettings,
  SkillsSettings,
  WorkspaceSettings,
  TerminalSettings,
  TexworkspaceSettings,
  BrowserSettings,
  LiteratureSettings,
  AboutSettings,
} from "@/components/modules/settings";
import { TemplateCenter } from "@/components/modules/templates/template-center";
import { ChatMessages, ChatComposer, ChatErrorBoundary, ContextWindowIndicator, RestoreUndoBar } from "@/components/modules/chat";
import { ChatHomeBackdrop } from "@/components/modules/chat/chat-home-backdrop";
import { WorktreeSelector, CHAT_PANEL_TOOLBAR_BUTTON } from "@/components/modules/chat/worktree-selector";
import { BranchSelector } from "@/components/modules/chat/branch-selector";
import { WorktreeActions } from "@/components/modules/chat/worktree-actions";
import { SUBAGENT_PANEL_EXIT_MS } from "@/components/modules/chat/subagent-run-panel";
import { isWorktreeCheckoutPath } from "@/lib/git/checkout-context";


export function LeftMainArea() {
  const { t } = useTranslation();
  useOpenCodeEvents();
  useTrayStatusSync();

  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const checkoutRoot = useDocumentStore((s) => s.checkoutRoot);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
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

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const openSubAgentPanelToolUseId = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.openSubAgentPanelToolUseId ?? null,
  );
  /** Smooth scrim enter/exit — keep mounted through opacity transition. */
  const [subAgentScrimMounted, setSubAgentScrimMounted] = useState(false);
  const [subAgentScrimOn, setSubAgentScrimOn] = useState(false);
  useEffect(() => {
    if (openSubAgentPanelToolUseId) {
      setSubAgentScrimMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setSubAgentScrimOn(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    setSubAgentScrimOn(false);
    const t = window.setTimeout(() => setSubAgentScrimMounted(false), SUBAGENT_PANEL_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [openSubAgentPanelToolUseId]);
  const contextTokens = useChatStore((s) => s.contextTokens);
  const contextWindowSize = useChatStore((s) => s.contextWindowSize);
  const contextUsageSource = useChatStore((s) => s.contextUsageSource);
  const contextBreakdown = useChatStore((s) => s.contextBreakdown);
  const categorySchema = useChatStore((s) => s.categorySchema);
  const promptStale = useChatStore((s) => s.promptStale);
  const sessionId = useChatStore((s) => s.sessionId);
  const isLoadingSession = useChatStore((s) => s.isLoadingSession);
  const sessionAgent = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.sessionAgent ?? "build";
  });
  const setSessionAgent = useChatStore((s) => s.setSessionAgent);
  const showHomepage =
    messages.length === 0 && !isStreaming && !isLoadingSession;
  /** New empty session shortcut — same as slash Modes → Plan; hide once in Plan. */
  const showPlanNewIdea = showHomepage && sessionAgent !== "plan";
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
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
    void prefetchOpenCodeModelsCatalog().then(() => {
      setCatalogTick((n) => n + 1);
    });
    return subscribeOpenCodeModelsCatalog(() => {
      setCatalogTick((n) => n + 1);
    });
  }, []);
  const contextTotal = useMemo(() => {
    void catalogTick;
    if (typeof contextWindowSize === "number" && contextWindowSize > 0) {
      return contextWindowSize;
    }
    const custom = aiCustomModelsData
      ? Object.fromEntries(
          Object.entries(aiCustomModelsData).map(([k, v]) => [k, v as any]),
        )
      : undefined;
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

  if (leftSidebarView === "settings") {
    const resolvedCategory =
      settingsCategory === "zotero" ? "literature" : settingsCategory;
    const SettingsContent = {
      general: GeneralSettings,
      appearance: AppearanceSettings,
      models: ModelSettings,
      agent: AgentSettings,
      terminal: TerminalSettings,
      browser: BrowserSettings,
      "prompts-rules": PromptsRulesSettings,
      "prompts-rules-commands": PromptsRulesSettings,
      permissions: PermissionsSettings,
      commands: SlashCommandsSettings,
      "tools-mcp": ToolsMcpSettings,
      skills: SkillsSettings,
      compiler: CompilerSettings,
      texworkspace: TexworkspaceSettings,
      workspace: WorkspaceSettings,
      literature: LiteratureSettings,
      backups: BackupsSettings,
      about: AboutSettings,
    }[resolvedCategory] || GeneralSettings;
    return (
      <div className="flex h-full flex-col min-w-0" data-surface="content">
        <SettingsContent />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-w-0 @container" data-surface="content">
      <ChatErrorBoundary>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sm bg-background">
          <ChatHomeBackdrop />
          {showHomepage ? (
          /* ── Homepage ── */
          <div
            ref={chatFileDropZoneRef}
            className={cn(
              "relative z-10 flex min-w-0 flex-1 flex-col items-center justify-end overflow-x-hidden @xl:justify-center @xl:pb-[var(--height-titlebar)]",
              chatFileDragActive && chatFileDropZoneClass,
            )}
            {...chatFileDropHandlers}
          >
            {chatFileDragActive ? (
              <span className="pointer-events-none absolute bottom-10 left-1/2 z-30 -translate-x-1/2 rounded-md border border-primary/25 bg-background/95 px-3 py-1 text-[length:var(--font-size-11)] text-muted-foreground shadow-sm">
                {t("chat.aibar.dropFiles")}
              </span>
            ) : null}
            <div className="relative z-10 flex w-full flex-col items-center">
              {/* Branch / worktree — sits directly above the centered composer */}
              <div data-chat-width className="flex h-6 w-full items-center gap-1.5 px-3">
                <BranchSelector />

                <WorktreeSelector />
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

            {/*
              Full-bleed focus scrim over the chat column (covers sticky user
              bubbles). Composer + Task panel sit above it — same layering as
              Cursor: dim the transcript, keep the bottom shell crisp.
              AiBar path never mounts this (editorMaximized).
            */}
            {subAgentScrimMounted ? (
              <div
                aria-hidden
                className={cn(
                  // Theme-aware scrim: light wash in light mode, soft dim in dark
                  // (not a heavy always-black slab).
                  "absolute inset-0 z-40 bg-background/55 backdrop-blur-[0.25px]",
                  "transition-opacity ease-[cubic-bezier(0.22,1,0.36,1)]",
                  subAgentScrimOn
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0",
                )}
                style={{ transitionDuration: `${SUBAGENT_PANEL_EXIT_MS}ms` }}
              />
            ) : null}

            {/* Above scrim: Task panel + composer + status chrome */}
            <div className="relative z-50 shrink-0">
              <div data-chat-width className="w-full">
                {!editorMaximized && <ChatComposer />}
              </div>
              <div data-chat-width className="w-full flex items-center gap-1.5 h-6 px-3 mb-2 text-[length:var(--font-chat-meta)] text-muted-foreground/70">
                {isGitRepo && (
                  <>
                    <span className="flex items-center gap-1">
                      <GitBranchIcon className="size-3 shrink-0" />
                      <span className="truncate max-w-[120px]">{displayBranch}</span>
                    </span>
                    {activeWorktree ? (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="truncate max-w-[80px]">{activeWorktree.name}</span>
                      </>
                    ) : (
                      <>
                        <span className="opacity-40">·</span>
                        <span>{t("chat.toolbar.local")}</span>
                      </>
                    )}
                  </>
                )}
                <span className="flex-1" />
                {(contextTokens != null || contextWindowSize != null || sessionId) && (
                  <ContextWindowIndicator
                    used={contextTokens}
                    total={contextTotal}
                    breakdown={contextBreakdown}
                    schema={categorySchema}
                    source={contextUsageSource}
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
