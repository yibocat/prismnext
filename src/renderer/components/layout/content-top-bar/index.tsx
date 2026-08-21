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
} from "lucide-react";
import { openRightArea } from "@/lib/workspace/right-area-layout";
import { Hint } from "@/components/ui/hint";
import { WindowControls } from "@/components/layout/window-controls";
import { listBackgroundPending, usePermissionStore } from "@/stores/permission-store";
import { lastPathForSession, useWorkbenchStore } from "@/stores/workbench-store";

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
  const activeTabId = useChatStore((s) => s.activeTabId);
  const loadSession = useChatStore((s) => s.loadSession);
  const backgroundPending = usePermissionStore((s) =>
    listBackgroundPending(s.permissions, activeTabId),
  );
  const members = useWorkbenchStore((s) => s.members);
  const sessionProjectIds = useWorkbenchStore((s) => s.sessionProjectIds);
  const waiting = backgroundPending[0];
  const waitingTabTitle = useChatStore((s) => (
    waiting ? s.tabs.find((tab) => tab.id === waiting.tabId)?.title : undefined
  ));
  const waitingName = waiting
    ? members.find((member) => member.id === sessionProjectIds[waiting.tabId])?.displayName
      || waitingTabTitle
      || t("nav.sessions.chat")
    : "";
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
    <div className="drag-region flex h-[var(--height-titlebar)] min-w-0 shrink-0 items-center gap-0.5 overflow-hidden px-2 select-none" data-surface="content">
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
        {waiting ? (
          <Hint label={t("nav.sessions.waitingPermissionHint")}>
            <button
              type="button"
              className="no-drag inline-flex h-6 max-w-[14rem] shrink-0 items-center rounded-md bg-muted px-1.5 text-[length:var(--font-chat-meta)] text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                void loadSession(
                  waiting.tabId,
                  undefined,
                  lastPathForSession(waiting.tabId) ?? undefined,
                );
              }}
            >
              <span className="truncate">
                {t("nav.sessions.waitingPermission", { name: waitingName })}
              </span>
            </button>
          </Hint>
        ) : null}
      </div>

      {/* ── Right: expand right panel (RightArea or Settings detail) + Window controls ── */}
      <div className="flex items-center gap-0.5 shrink-0">
        {!rightAreaExpanded && rightAreaRef && !inSettings ? (
          <>
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
            {!isMac && <div className="mx-1 h-4 w-px bg-border shrink-0" />}
          </>
        ) : null}

        <WindowControls />
      </div>
    </div>
  );
}
