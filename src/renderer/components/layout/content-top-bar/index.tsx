import { type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { useWindowState } from "@/hooks/use-window-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { hasOpenSettingsEditor } from "@/hooks/use-settings-editor";
import { useChatStore } from "@/stores/chat-store";
import { useSessionTitle } from "@/hooks/use-session-title";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { SessionTitle } from "./session-title";
import { ChatOpenTabs, shouldShowChatOpenTabs } from "./chat-open-tabs";
import { ServerStatusDot } from "@/components/server-status-dot";
import { cn } from "@/lib/utils";
import {
  PanelRight,
  Minimize2Icon,
  Maximize2Icon,
  XIcon,
} from "lucide-react";
import { openRightArea } from "@/lib/workspace/right-area-layout";
import { Hint } from "@/components/ui/hint";

interface ContentTopBarProps {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  centerRef?: RefObject<PanelImperativeHandle | null>;
  rightAreaRef?: RefObject<PanelImperativeHandle | null>;
}

export function ContentTopBar({ leftSidebarRef, centerRef, rightAreaRef }: ContentTopBarProps) {
  const { t } = useTranslation();
  const { platform, isMaximized, isFullscreen } = useWindowState();
  const isMobile = useIsMobile();
  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);

  const sessionTitle = useSessionTitle();
  const chatTabCount = useChatStore((s) => s.tabs.length);
  const showOpenTabs = shouldShowChatOpenTabs(chatTabCount);
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

      {/* Status dot + open chat tabs (≥2) or single session title */}
      <div className="flex min-w-0 flex-1 items-center gap-1 ml-0.5">
        <ServerStatusDot />
        {showOpenTabs ? (
          <ChatOpenTabs />
        ) : (
          sessionTitle && (
            <SessionTitle
              title={sessionTitle}
              sessionDirectory={sessionDirectory}
            />
          )
        )}
      </div>

      {/* ── Right: expand right panel (RightArea or Settings detail) ── */}
      <div className="flex items-center gap-0.5 shrink-0">
        {!isMac && (
          <>
            <Hint label={t("shell.minimize")}>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => window.electronAPI?.windowMinimize()}
              >
                <Minimize2Icon className="size-3.5" />
              </button>
            </Hint>
            <Hint label={isMaximized ? t("shell.restore") : t("shell.maximize")}>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => window.electronAPI?.windowMaximize()}
              >
                <Maximize2Icon className="size-3.5" />
              </button>
            </Hint>
            <Hint label={t("shell.close")}>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
                onClick={() => window.electronAPI?.windowClose()}
              >
                <XIcon className="size-3.5" />
              </button>
            </Hint>
            <div className="mx-1 h-4 w-px bg-border shrink-0" />
          </>
        )}

        {!rightAreaExpanded && rightAreaRef && !inSettings ? (
          <Hint shortcutId="shell.toggleRightArea">
            <button
              type="button"
              className={cn(
                "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
              )}
              onClick={expandRightPanel}
            >
              <PanelRight className="size-3.5" />
            </button>
          </Hint>
        ) : null}
      </div>
    </div>
  );
}
