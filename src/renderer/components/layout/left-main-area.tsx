import { useEffect } from "react";
import { useAgentEvents } from "@/hooks/use-agent-events";
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
import { ChatMessages, ChatComposer, ChatErrorBoundary } from "@/components/modules/chat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, FolderOpenIcon, FolderPlusIcon } from "lucide-react";

const AGENTS = [
  { id: "claude", name: "Claude Code" },
  { id: "opencode", name: "OpenCode", disabled: true },
  { id: "gemini", name: "Gemini CLI", disabled: true },
  { id: "qoder", name: "Qoder CLI", disabled: true },
];

// Module-level flag prevents double-prewarm when React StrictMode re-runs effects
let didPrewarm = false;

export function LeftMainArea() {
  useAgentEvents();

  // Pre-warm agent on mount to avoid delay on first prompt (only for new sessions without loaded context)
  useEffect(() => {
    if (didPrewarm) return;
    const projectPath = useDocumentStore.getState().projectRoot;
    if (!projectPath || !window.electronAPI.agentPrewarm) return;
    const store = useChatStore.getState();
    // Only prewarm if the active tab doesn't have a loaded session (which needs resume, not new)
    const tab = store.tabs.find((t) => t.id === store.activeTabId);
    if (tab?.sessionId) return; // Session already loaded, will be resumed on first prompt
    didPrewarm = true;
    window.electronAPI.agentPrewarm(projectPath, store.activeTabId).catch(() => {});
  }, []);

  // Sync sessionId to store when agent creates a new session (only if not already set)
  useEffect(() => {
    return window.electronAPI.onAgentSessionCreated(({ tabId: eventTabId, sessionId }) => {
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
    return <div className="flex h-full flex-col min-w-[300px] bg-background"><SettingsContent /></div>;
  }

  return (
    <div className="flex h-full flex-col min-w-[300px] bg-background @container">
      <ChatErrorBoundary>
        {isEmpty ? (
          /* ── Homepage ── */
          <div className="flex flex-1 flex-col items-center justify-end @xl:justify-center @xl:pb-[var(--height-titlebar)]">
            {/* Top toolbar */}
            <div className="w-full max-w-3xl flex items-center gap-1.5 px-[12px] pb-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
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
                    className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            </div>

            {/* Composer — negative margin counteracts ChatComposer internal p-3 */}
            <div className="w-full max-w-3xl [&_textarea]:min-h-14 -my-2">
              <ChatComposer />
            </div>
          </div>
        ) : (
          /* ── Chat view ── */
          <div className="flex flex-1 flex-col">
            <ChatMessages />
            <div className="w-full max-w-3xl mx-auto -my-2 [&_textarea]:min-h-14">
              <ChatComposer />
            </div>          </div>
        )}
      </ChatErrorBoundary>
    </div>
  );
}
