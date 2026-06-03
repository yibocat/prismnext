import { type RefObject } from "react";
import { useTheme } from "next-themes";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useWindowState } from "@/hooks/use-window-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSessionTitle } from "@/hooks/use-session-title";
import { AGENT_UI_CONFIGS } from "@/lib/agent-config";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { SessionTitle } from "./session-title";
import {
  PanelRight,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  Minimize2Icon,
  Maximize2Icon,
  XIcon,
  LockIcon,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";

interface ContentTopBarProps {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  centerRef?: RefObject<PanelImperativeHandle | null>;
  rightAreaRef?: RefObject<PanelImperativeHandle | null>;
}

export function ContentTopBar({ leftSidebarRef, centerRef, rightAreaRef }: ContentTopBarProps) {
  const { platform, isMaximized, isFullscreen } = useWindowState();
  const isMobile = useIsMobile();
  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const inSettings = leftSidebarView === "settings";
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const glassEffect = useSettingsStore((s) => s.settings.glassEffect);

  const sessionTitle = useSessionTitle();
  const selectedAgentId = useChatStore((s) => s.selectedAgent);
  const agentName = AGENT_UI_CONFIGS[selectedAgentId]?.name ?? selectedAgentId;
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const cycleTheme = () => {
    if (glassEffect) return;
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const isMac = platform === "darwin";
  const showSidebarControls = sidebarFullyCollapsed;
  const showMacSpacer = isMac && !isFullscreen && sidebarFullyCollapsed;

  // When editor is maximized, center panel collapses → ContentTopBar hides, RightArea toolbar takes over
  if (editorMaximized) return null;

  return (
    <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center px-2 gap-0.5 select-none glass-content">
      {/* ── Left: traffic lights spacer + sidebar controls ── */}
      <div className="flex items-center gap-0.5 shrink-0">
        {showSidebarControls ? (
          <SidebarControls leftSidebarRef={leftSidebarRef} showMacSpacer={showMacSpacer} className="-ml-[1px]" />
        ) : (
          showMacSpacer && <div className="w-[68px]" />
        )}
      </div>

      {/* Session title — only when there are messages */}
      {sessionTitle && (
        <SessionTitle
          title={sessionTitle}
          projectRoot={projectRoot}
          agentName={agentName}
        />
      )}

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* ── Right: theme + PanelRight (only when RightArea closed) ── */}
      <div className="flex items-center gap-0.5 shrink-0">
        {!isMac && (
          <>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Minimize"
              onClick={() => window.electronAPI?.windowMinimize()}
            >
              <Minimize2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={() => window.electronAPI?.windowMaximize()}
            >
              <Maximize2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
              title="Close"
              onClick={() => window.electronAPI?.windowClose()}
            >
              <XIcon className="size-3.5" />
            </button>
            <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />
          </>
        )}

        {!rightAreaExpanded && (
          <>
            <button
              type="button"
              className={glassEffect
                ? "flex size-6 items-center justify-center rounded text-muted-foreground/30 transition-colors"
                : "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"}
              title={glassEffect ? "Theme locked (Desktop glass is on)" : `Theme: ${theme}`}
              onClick={cycleTheme}
            >
              {glassEffect ? (
                <LockIcon className="size-3.5" />
              ) : theme === "system" ? (
                <MonitorIcon className="size-3.5" />
              ) : resolvedTheme === "dark" ? (
                <SunIcon className="size-3.5" />
              ) : (
                <MoonIcon className="size-3.5" />
              )}
            </button>

            {rightAreaRef && !inSettings && (
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                title="Expand Right Area"
                onClick={() => {
                  const r = rightAreaRef.current;
                  const c = centerRef!.current;
                  if (!r || !c) return;
                  if (isMobile) {
                    r.resize(9999);
                    c.collapse();
                  } else {
                    if (c.isCollapsed()) {
                      r.resize(useLayoutStore.getState().rightAreaWidth || 500);
                      c.expand();
                    } else {
                      r.resize(useLayoutStore.getState().rightAreaWidth || 500);
                    }
                  }
                }}
              >
                <PanelRight className="size-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
