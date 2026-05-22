import { useEffect, useCallback } from "react";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { PlusIcon, XIcon, BotIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const AGENT_OPTIONS = [
  { id: "claude", name: "Claude Code", disabled: false },
  { id: "opencode", name: "OpenCode", disabled: true },
  { id: "gemini", name: "Gemini CLI", disabled: true },
  { id: "qoder", name: "Qoder CLI", disabled: true },
];

export function ChatTabBar() {
  const tabs = useClaudeChatStore((s) => s.tabs);
  const activeTabId = useClaudeChatStore((s) => s.activeTabId);
  const drawerState = useClaudeChatStore((s) => s.drawerState);
  const selectedAgent = useClaudeChatStore((s) => s.selectedAgent);
  const setActiveTab = useClaudeChatStore((s) => s.setActiveTab);
  const createTab = useClaudeChatStore((s) => s.createTab);
  const closeTab = useClaudeChatStore((s) => s.closeTab);
  const setSelectedAgent = useClaudeChatStore((s) => s.setSelectedAgent);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only fire when drawer is visible
      if (drawerState === "closed") return;

      // Cmd+T / Ctrl+T: new tab
      if ((e.metaKey || e.ctrlKey) && e.key === "t" && !e.shiftKey) {
        e.preventDefault();
        const id = createTab();
        setActiveTab(id);
        return;
      }
      // Cmd+W / Ctrl+W: close tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        if (tabs.length > 1) {
          closeTab(activeTabId);
        }
        return;
      }
      // Ctrl+Tab: next tab
      if (e.ctrlKey && e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const next = (idx + 1) % tabs.length;
        setActiveTab(tabs[next].id);
        return;
      }
      // Ctrl+Shift+Tab: prev tab
      if (e.ctrlKey && e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const prev = (idx - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[prev].id);
        return;
      }
    },
    [tabs, activeTabId, drawerState, setActiveTab, createTab, closeTab],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex items-center border-border border-b">
      <div className="scrollbar-none flex min-w-0 flex-1 items-center overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "group relative flex min-w-0 max-w-[160px] items-center gap-1 border-b-2 px-2.5 py-1.5 text-[length:var(--font-tab-label)] transition-colors",
              tab.id === activeTabId
                ? "border-primary bg-muted/50 text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            <button
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.title}
            </button>
            {tab.isStreaming && (
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
            )}
            {tabs.length > 1 && !tab.isStreaming && (
              <button
                className="shrink-0 rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted-foreground/20"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Agent selector */}
      <div className="flex shrink-0 items-center gap-1 border-l border-border px-1.5">
        <BotIcon className="size-3 text-muted-foreground" />
        <select
          className="h-6 rounded-md border border-border bg-card px-1 text-[length:var(--font-select)] text-muted-foreground focus:outline-none"
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
        >
          {AGENT_OPTIONS.map((a) => (
            <option key={a.id} value={a.id} disabled={a.disabled}>
              {a.name}{a.disabled ? " (soon)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* New tab button */}
      <button
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => {
          const id = createTab();
          setActiveTab(id);
        }}
        title="New tab (Cmd+T)"
      >
        <PlusIcon className="size-3.5" />
      </button>
    </div>
  );
}
