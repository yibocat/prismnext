import { useEffect, useRef } from "react";
import { useCliEvents } from "@/hooks/use-cli-events";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useGitStore } from "@/stores/git-store";
import { GitBranchIcon } from "lucide-react";
import { getContextWindowCapacity } from "@/lib/agent-config";
import { useAgentSettingsStore } from "@/stores/agent-settings-store";
import {
  GeneralSettings,
  AppearanceSettings,
  ProjectSettings,
  CompilerSettings,
  ExternalSettings,
  ShortcutsSettings,
  LogViewer,
  BackupsSettings,
  AgentAppSettings,
  AgentProjectSettings,
} from "@/components/modules/settings";
import { TemplateCenter } from "@/components/modules/templates/template-center";
import { ChatMessages, ChatComposer, ChatErrorBoundary, ContextWindowIndicator } from "@/components/modules/chat";
import { WorktreeSelector } from "@/components/modules/chat/worktree-selector";
import { BranchSelector } from "@/components/modules/chat/branch-selector";
import { WorktreeActions } from "@/components/modules/chat/worktree-actions";


export function LeftMainArea() {
  useCliEvents();

  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const worktreePath = activeWorktree?.path;
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  // Pre-warm the agent process whenever the project or worktree changes.
  // The process starts in the background with default settings so the first
  // prompt hits a warm process with sub-second latency.
  // Dependencies keyed on projectRoot + worktreePath for auto re-pre-warm.
  useEffect(() => {
    if (!projectRoot) return;
    const store = useChatStore.getState();
    const tab = store.tabs.find((t) => t.id === store.activeTabId);
    // Don't pre-warm if the active tab already has a loaded session —
    // it will be resumed, which needs a different --resume flag.
    if (tab?.sessionId) return;
    const wtRoot = worktreePath || projectRoot;
    window.electronAPI.cliPrewarm(projectRoot, store.activeTabId, wtRoot).catch(() => {});
  }, [projectRoot, worktreePath]);

  // Sync sessionId to store when agent creates a new session (only if not already set)
  useEffect(() => {
    return window.electronAPI.onCliSessionCreated(({ tabId: eventTabId, sessionId }) => {
      const store = useChatStore.getState();
      const targetTabId = eventTabId || store.activeTabId;
      // Always update — the latest session for this tab is the correct one.
      // (StrictMode double-prewarm or session resumption can produce newer IDs.)
      store._setSessionId(targetTabId, sessionId);
    });
  }, []);

  // When activeWorktree changes (select existing, lazy-init, or move-to-local),
  // automatically switch the document checkout root so that file operations
  // and AI edits happen in the correct directory.
  useEffect(() => {
    const unsub = useWorktreeStore.subscribe((state, prev) => {
      if (state.activeWorktree === prev.activeWorktree) return;
      const docStore = useDocumentStore.getState();
      const newRoot = state.activeWorktree?.path ?? docStore.projectRoot;
      if (newRoot && newRoot !== docStore.checkoutRoot) {
        docStore.switchCheckoutRoot(newRoot);
      }
      // Pre-warm the agent process in the new worktree directory immediately
      // so the first prompt doesn't wait 20 s for Claude Code startup.
      const worktreePath = state.activeWorktree?.path;
      if (docStore.projectRoot && window.electronAPI.cliPrewarm) {
        const chatStore = useChatStore.getState();
        window.electronAPI.cliPrewarm(
          docStore.projectRoot,
          chatStore.activeTabId,
          worktreePath,
        ).catch(() => {});
      }
    });
    return unsub;
  }, []);

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const contextTokens = useChatStore((s) => s.contextTokens);
  const contextBreakdown = useChatStore((s) => s.contextBreakdown);
  const categorySchema = useChatStore((s) => s.categorySchema);
  const selectedAgent = useChatStore((s) => s.selectedAgent);

  const isEmpty = messages.length === 0 && !isStreaming;

  // Context window capacity for the current agent + model
  const agentSettings = useAgentSettingsStore((s) => s.settings);
  const contextTotal = getContextWindowCapacity(
    selectedAgent,
    agentSettings[selectedAgent]?.["model"] ?? null,
  );

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

  if (leftSidebarView === "templates") {
    return (
      <div className="flex h-full flex-col min-w-0" data-surface="content">
        <TemplateCenter
          onBack={() => useLayoutStore.getState().setLeftSidebarView("sessions")}
          onUseTemplate={async (template) => {
            if (!projectRoot) return;
            const docSt = useDocumentStore.getState();
            await window.electronAPI.templateApply({
              rootPath: projectRoot,
              manuscriptDir: docSt.manuscriptDir,
              files: template.files,
              templateId: template.id,
              templateCategory: template.category,
            });
            docSt.refreshFiles();
            useLayoutStore.getState().setLeftSidebarView("sessions");
          }}
        />
      </div>
    );
  }

  if (leftSidebarView === "settings") {
    const SettingsContent = {
      general: GeneralSettings,
      appearance: AppearanceSettings,
      project: ProjectSettings,
      compiler: CompilerSettings,
      external: ExternalSettings,
      shortcuts: ShortcutsSettings,
      logs: LogViewer,
      backups: BackupsSettings,
      "agent-app": AgentAppSettings,
      "agent-project": AgentProjectSettings,
    }[settingsCategory] || GeneralSettings;
    return <div className="flex h-full flex-col min-w-0" data-surface="content"><SettingsContent /></div>;
  }

  return (
    <div className="flex h-full flex-col min-w-0 @container select-text" data-surface="content">
      <ChatErrorBoundary>
        {isEmpty ? (
          /* ── Homepage ── */
          <div className="flex flex-1 flex-col items-center justify-end @xl:justify-center @xl:pb-[var(--height-titlebar)]">
            {/* Top toolbar — branch & worktree selectors */}
            <div className="w-full max-w-3xl flex items-center gap-1.5 py-1.5 px-3">
              <BranchSelector />

              <WorktreeSelector />
            </div>

            {/* Composer */}
            <div className="w-full max-w-3xl mx-auto">
              <ChatComposer />
            </div>
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
          <div className="flex flex-1 flex-col">
            <ChatMessages />
            {/* Worktree actions above composer — only when worktree is active */}
            {activeWorktree && (
              <div className="w-full max-w-3xl mx-auto flex items-center gap-1.5 px-3">
                <WorktreeActions />
              </div>
            )}
            <div className="w-full max-w-3xl mx-auto">
              <ChatComposer />
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
                <ContextWindowIndicator used={contextTokens} total={contextTotal} breakdown={contextBreakdown} schema={categorySchema} />
              )}
            </div>
          </div>
        )}
      </ChatErrorBoundary>
    </div>
  );
}
