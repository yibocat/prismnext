import { useEffect, useRef, useMemo } from "react";
import { useOpenCodeEvents } from "@/hooks/use-opencode-events";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useGitStore } from "@/stores/git-store";
import { clearPdfCache, useCompileStore } from "@/stores/compile-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useSettingsStore } from "@/stores/settings-store";
import { getAllEnabledModels } from "@/lib/providers";
import { parseContextWindow, DEFAULT_CONTEXT_WINDOW } from "@shared/context-constants";
import { GitBranchIcon } from "lucide-react";

import {
  GeneralSettings,
  AppearanceSettings,
  CompilerSettings,
  ModelSettings,
  BackupsSettings,
  AgentSettings,
  PromptsRulesSettings,
  SlashCommandsSettings,
  ToolsMcpSettings,
  SkillsSettings,
  WorkspaceSettings,
  TerminalSettings,
  TexworkspaceSettings,
  LiteratureSettings,
} from "@/components/modules/settings";
import { TemplateCenter } from "@/components/modules/templates/template-center";
import { ChatMessages, ChatComposer, ChatErrorBoundary, ContextWindowIndicator, RestoreUndoBar } from "@/components/modules/chat";
import { WorktreeSelector } from "@/components/modules/chat/worktree-selector";
import { BranchSelector } from "@/components/modules/chat/branch-selector";
import { WorktreeActions } from "@/components/modules/chat/worktree-actions";
import { isWorktreeCheckoutPath } from "@/lib/git/checkout-context";


export function LeftMainArea() {
  useOpenCodeEvents();

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
  const contextTokens = useChatStore((s) => s.contextTokens);
  const contextBreakdown = useChatStore((s) => s.contextBreakdown);
  const categorySchema = useChatStore((s) => s.categorySchema);
  const promptStale = useChatStore((s) => s.promptStale);
  const sessionId = useChatStore((s) => s.sessionId);
  const isLoadingSession = useChatStore((s) => s.isLoadingSession);
  const showHomepage = messages.length === 0 && !isStreaming && !isLoadingSession;
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);

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
  const contextTotal = useMemo(() => {
    if (!aiModel) return DEFAULT_CONTEXT_WINDOW;
    const custom = aiCustomModelsData
      ? Object.fromEntries(
          Object.entries(aiCustomModelsData).map(([k, v]) => [k, v as any]),
        )
      : undefined;
    const allModels = getAllEnabledModels(aiEnabledModels, custom);
    const found = allModels.find(
      (m) => m.provider.id === aiProvider && m.model.id === aiModel,
    );
    return parseContextWindow(found?.model.contextWindow);
  }, [aiProvider, aiModel, aiEnabledModels, aiCustomModelsData]);

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
      "prompts-rules": PromptsRulesSettings,
      "prompts-rules-commands": PromptsRulesSettings,
      commands: SlashCommandsSettings,
      "tools-mcp": ToolsMcpSettings,
      skills: SkillsSettings,
      compiler: CompilerSettings,
      texworkspace: TexworkspaceSettings,
      workspace: WorkspaceSettings,
      literature: LiteratureSettings,
      backups: BackupsSettings,
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
        {showHomepage ? (
          /* ── Homepage ── */
          <div className="flex flex-1 flex-col items-center justify-end @xl:justify-center @xl:pb-[var(--height-titlebar)]">
            {/* Top toolbar — branch & worktree selectors */}
            <div className="w-full max-w-3xl flex items-center gap-1.5 py-1.5 px-3">
              <BranchSelector />

              <WorktreeSelector />
            </div>

            {/* Composer */}
            {!editorMaximized && (
              <div className="w-full max-w-3xl mx-auto">
                <ChatComposer />
              </div>
            )}
            {/* Context bar — matches toolbar height, bottom padding for breathing room */}
            <div className="w-full max-w-3xl mx-auto flex items-center gap-1.5 h-7 px-3 mb-2 text-[length:var(--font-chat-meta)] text-muted-foreground/70">
              {/* Placeholder — future: suggested follow-up prompts */}
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Suggestions
              </button>
              <span className="flex-1" />
            </div>
          </div>
        ) : (
          /* ── Chat view ── */
          <div className="flex flex-1 flex-col min-w-0 overflow-x-hidden">
            <ChatMessages />
            <RestoreUndoBar />
            {/* Worktree actions above composer — only when worktree is active */}
            {showWorktreeActions && (
              <div className="w-full max-w-3xl mx-auto flex items-center gap-1.5 h-7 px-3 mb-1.5">
                <WorktreeActions />
              </div>
            )}
            <div className="w-full max-w-3xl mx-auto">
              {!editorMaximized && <ChatComposer />}
            </div>
            {/* Bottom bar: branch / worktree on left (git only), context ring on right */}
            <div className="w-full max-w-3xl mx-auto flex items-center gap-1.5 h-7 px-3 mb-2 text-[length:var(--font-chat-meta)] text-muted-foreground/70">
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
                      <span>Local</span>
                    </>
                  )}
                </>
              )}
              <span className="flex-1" />
              {contextTokens != null && (
                <ContextWindowIndicator
                  used={contextTokens}
                  total={contextTotal}
                  breakdown={contextBreakdown}
                  schema={categorySchema}
                  promptStale={promptStale}
                  isStreaming={isStreaming}
                />
              )}
            </div>
          </div>
        )}
      </ChatErrorBoundary>
    </div>
  );
}
