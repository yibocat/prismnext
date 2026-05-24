import { useEffect } from "react";
import { useClaudeEvents } from "@/hooks/use-claude-events";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";
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

const AGENT_MODES = [
  { id: "edit-before-ask" as const, name: "Edit before ask" },
  { id: "auto-edit" as const, name: "Auto edit" },
  { id: "plan" as const, name: "Plan mode" },
];

export function LeftMainArea() {
  useClaudeEvents();

  // Sync sessionId to store when agent creates a new session
  useEffect(() => {
    return window.electronAPI.onAgentSessionCreated(({ sessionId }) => {
      const store = useClaudeChatStore.getState();
      store._setSessionId(store.activeTabId, sessionId);
    });
  }, []);

  const messages = useClaudeChatStore((s) => s.messages);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  const selectedAgent = useClaudeChatStore((s) => s.selectedAgent);
  const setSelectedAgent = useClaudeChatStore((s) => s.setSelectedAgent);
  const agentMode = useClaudeChatStore((s) => s.agentMode);
  const setAgentMode = useClaudeChatStore((s) => s.setAgentMode);
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
  const currentMode = AGENT_MODES.find((m) => m.id === agentMode);

  return (
    <div className="flex h-full flex-col min-w-[200px] bg-background">
      <ChatErrorBoundary>
        {isEmpty ? (
          /* ── Homepage ── */
          <div className="flex flex-1 flex-col items-center justify-center gap-1">
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
                    className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
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

            {/* Bottom bar */}
            <div className="w-full max-w-3xl flex items-center px-[12px] pt-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <span>{currentMode?.name || "Mode"}</span>
                    <ChevronDownIcon className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  {AGENT_MODES.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => setAgentMode(m.id)}
                    >
                      <span>{m.name}</span>
                      {agentMode === m.id && (
                        <span className="ml-auto text-[length:var(--font-badge)] text-muted-foreground">active</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : (
          /* ── Chat view ── */
          <div className="flex flex-1 flex-col">
            <ChatMessages />
            <div className="w-full max-w-3xl mx-auto -my-2 [&_textarea]:min-h-14">
              <ChatComposer />
            </div>
            {/* Bottom bar — agent mode */}
            <div className="w-full max-w-3xl mx-auto flex items-center px-[12px] pt-1 pb-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <span>{currentMode?.name || "Mode"}</span>
                    <ChevronDownIcon className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  {AGENT_MODES.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => setAgentMode(m.id)}
                    >
                      <span>{m.name}</span>
                      {agentMode === m.id && (
                        <span className="ml-auto text-[length:var(--font-badge)] text-muted-foreground">active</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </ChatErrorBoundary>
    </div>
  );
}
