import { useEffect } from "react";
import { useCliEvents } from "@/hooks/use-cli-events";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";
import {
  GeneralSettings,
  AppearanceSettings,
  CompilerSettings,
  ExternalSettings,
  ShortcutsSettings,
} from "@/components/modules/settings";
import { ChatMessages, ChatComposer, ChatErrorBoundary, ContextWindowIndicator } from "@/components/modules/chat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, FolderOpenIcon, FolderPlusIcon, GitBranchIcon } from "lucide-react";
import { AGENT_UI_CONFIGS } from "@/lib/agent-config";

const AGENTS = Object.values(AGENT_UI_CONFIGS);

// Module-level flag prevents double-prewarm when React StrictMode re-runs effects
let didPrewarm = false;

export function LeftMainArea() {
  useCliEvents();

  // Pre-warm agent on mount to avoid delay on first prompt (only for new sessions without loaded context)
  useEffect(() => {
    if (didPrewarm) return;
    const projectPath = useDocumentStore.getState().projectRoot;
    if (!projectPath || !window.electronAPI.cliPrewarm) return;
    const store = useChatStore.getState();
    // Only prewarm if the active tab doesn't have a loaded session (which needs resume, not new)
    const tab = store.tabs.find((t) => t.id === store.activeTabId);
    if (tab?.sessionId) return; // Session already loaded, will be resumed on first prompt
    didPrewarm = true;
    window.electronAPI.cliPrewarm(projectPath, store.activeTabId).catch(() => {});
  }, []);

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

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const selectedAgent = useChatStore((s) => s.selectedAgent);
  const setSelectedAgent = useChatStore((s) => s.setSelectedAgent);

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const openProject = useDocumentStore((s) => s.openProject);
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);

  const isEmpty = messages.length === 0 && !isStreaming;

  const handleOpenProject = async () => {
    const result = await window.electronAPI.dialogOpenFolder();
    if (!result.canceled && result.path) {
      addRecentProject(result.path);
      await openProject(result.path);
    }
  };

  const handleSwitchProject = async (path: string) => {
    if (path === projectRoot) return;
    addRecentProject(path);
    await openProject(path);
  };

  const projectLabel = projectRoot
    ? projectRoot.split("/").pop() || projectRoot
    : "Open Project";

  const currentAgent = AGENTS.find((a) => a.id === selectedAgent);

  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const settingsCategory = useLayoutStore((s) => s.settingsCategory);

  if (leftSidebarView === "settings") {
    const SettingsContent = {
      general: GeneralSettings,
      appearance: AppearanceSettings,
      compiler: CompilerSettings,
      external: ExternalSettings,
      shortcuts: ShortcutsSettings,
    }[settingsCategory] || GeneralSettings;
    return <div className="flex h-full flex-col min-w-[300px] glass-content"><SettingsContent /></div>;
  }

  return (
    <div className="flex h-full flex-col min-w-[300px] glass-content @container select-text">
      <ChatErrorBoundary>
        {isEmpty ? (
          /* ── Homepage ── */
          <div className="flex flex-1 flex-col items-center justify-end @xl:justify-center @xl:pb-[var(--height-titlebar)]">
            {/* Top toolbar */}
            <div className="w-full max-w-3xl flex items-center gap-1.5 h-7 px-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <FolderOpenIcon className="size-3" />
                    <span className="truncate max-w-[120px]">{projectLabel}</span>
                    <ChevronDownIcon className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {recentProjects.length > 0 && (
                    <>
                      {recentProjects.map((p) => (
                        <DropdownMenuItem
                          key={p.path}
                          onClick={() => handleSwitchProject(p.path)}
                          className="text-[length:var(--font-chat-meta)]"
                        >
                          <FolderOpenIcon className="size-3.5 shrink-0" />
                          <span className="truncate">{p.name}</span>
                          <span className="ml-auto text-[length:var(--font-path)] text-muted-foreground/50 truncate max-w-[120px]">
                            {p.path}
                          </span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={handleOpenProject} className="text-[length:var(--font-chat-meta)]">
                    <FolderPlusIcon className="size-3.5" />
                    <span>Open new folder…</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={!isEmpty}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>{currentAgent?.name || "CLI"}</span>
                    <ChevronDownIcon className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  {AGENTS.map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      disabled={a.disabled}
                      onClick={() => setSelectedAgent(a.id)}
                    >
                      <span>{a.name}</span>
                      {selectedAgent === a.id && (
                        <span className="ml-auto text-[length:var(--font-badge)] text-muted-foreground">active</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* TODO: Worktree selector — populate with actual git worktrees */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={!isEmpty}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <GitBranchIcon className="size-3" />
                    <span>Worktree</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {/* TODO: List actual git worktrees from the project */}
                  <div className="px-2 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
                    No worktrees available
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
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
              <ContextWindowIndicator />
            </div>
          </div>
        ) : (
          /* ── Chat view ── */
          <div className="flex flex-1 flex-col">
            <ChatMessages />
            <div className="w-full max-w-3xl mx-auto">
              <ChatComposer />
            </div>
            {/* Context bar — matches toolbar height, bottom padding for breathing room */}
            <div className="w-full max-w-3xl mx-auto flex items-center gap-1.5 h-7 px-3 mb-2 text-[length:var(--font-chat-meta)] text-muted-foreground/70">
              <span className="flex-1" />
              <ContextWindowIndicator />
            </div>
          </div>
        )}
      </ChatErrorBoundary>
    </div>
  );
}
