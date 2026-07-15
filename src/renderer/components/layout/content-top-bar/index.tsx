import { type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useWindowState } from "@/hooks/use-window-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { hasOpenSettingsEditor } from "@/hooks/use-settings-editor";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSessionTitle } from "@/hooks/use-session-title";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { SessionTitle } from "./session-title";
import { ServerStatusDot } from "@/components/server-status-dot";
import { cn } from "@/lib/utils";
import {
  PanelRight,
  Minimize2Icon,
  Maximize2Icon,
  XIcon,
} from "lucide-react";
import { openRightArea } from "@/lib/workspace/right-area-layout";

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
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);

  const sessionTitle = useSessionTitle();
  const agentName = "OpenCode";
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const sessionDirectory = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.sessionCwd ?? null;
  });

  const isMac = platform === "darwin";
  const showSidebarControls = sidebarFullyCollapsed;
  const showMacSpacer = isMac && !isFullscreen && sidebarFullyCollapsed;

  const inSettings = leftSidebarView === "settings";
  const settingsDetailStacked = useLayoutStore((s) => s.settingsDetailStacked);
  const settingsPanelOpen = hasOpenSettingsEditor();

  const expandRightPanel = () => {
    if (inSettings) {
      return;
    }
    openRightArea({
      centerRef: centerRef?.current,
      rightAreaRef: rightAreaRef?.current,
      leftSidebarRef: leftSidebarRef.current,
      isMobile,
    });
  };

  // Hide center top bar only when stacked editor is open (list hidden, right chrome active).
  const hideContentTopBar =
    (editorMaximized && !inSettings) ||
    (inSettings && settingsDetailStacked && settingsPanelOpen);
  if (hideContentTopBar) return null;

  return (
    <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center px-2 gap-0.5 select-none" data-surface="content">
      {/* ── Left: traffic lights spacer + sidebar controls ── */}
      <div className="flex items-center gap-0.5 shrink-0">
        {showSidebarControls ? (
          <SidebarControls leftSidebarRef={leftSidebarRef} showMacSpacer={showMacSpacer} className="-ml-[1px]" />
        ) : (
          showMacSpacer && <div className="w-[68px]" />
        )}
      </div>

      {/* Status dot + Session title */}
      <div className="flex items-center min-w-0 gap-1 ml-0.5">
        <ServerStatusDot />
        {sessionTitle && (
          <SessionTitle
            title={sessionTitle}
            projectRoot={projectRoot}
            agentName={agentName}
            sessionDirectory={sessionDirectory}
          />
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* ── Right: expand right panel (RightArea or Settings detail) ── */}
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
            <div className="mx-1 h-4 w-px bg-border shrink-0" />
          </>
        )}

        {!rightAreaExpanded && rightAreaRef && !inSettings ? (
          <button
            type="button"
            className={cn(
              "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            )}
            title="Expand Right Area"
            onClick={expandRightPanel}
          >
            <PanelRight className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
