import { useTranslation } from "react-i18next";
import { useWindowState } from "@/hooks/use-window-state";
import { useLayoutStore } from "@/stores/layout-store";
import { hasOpenSettingsEditor } from "@/hooks/use-settings-editor";
import { useChatStore } from "@/stores/chat-store";
import { useSessionTitle } from "@/hooks/use-session-title";
import { ContentRightAreaSpacer, ContentSidebarSpacer } from "@/components/layout/sidebar-controls";
import { SessionTitle } from "./session-title";
import { ChatOpenTabs, shouldShowChatOpenTabs } from "./chat-open-tabs";
import { ServerStatusDot } from "@/components/server-status-dot";
import { Hint } from "@/components/ui/hint";
import { WindowControls } from "@/components/layout/window-controls";
import { listBackgroundPending, usePermissionStore } from "@/stores/permission-store";
import { lastPathForSession, useWorkbenchStore } from "@/stores/workbench-store";

export function ContentTopBar() {
  const { t } = useTranslation();
  const { platform } = useWindowState();
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);

  const sessionTitle = useSessionTitle();
  const activeTabId = useChatStore((s) => s.activeTabId);
  const loadSession = useChatStore((s) => s.loadSession);
  const permissions = usePermissionStore((s) => s.permissions);
  const backgroundPending = listBackgroundPending(permissions, activeTabId);
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

  const inSettings = leftSidebarView === "settings";
  const settingsDetailStacked = useLayoutStore((s) => s.settingsDetailStacked);
  const settingsPanelOpen = hasOpenSettingsEditor();

  // Hide center top bar only when stacked editor is open (list hidden, right chrome active).
  const hideContentTopBar =
    (editorMaximized && !inSettings) ||
    (inSettings && settingsDetailStacked && settingsPanelOpen);
  if (hideContentTopBar) return null;

  return (
    <div className="drag-region flex h-[var(--height-titlebar)] min-w-0 shrink-0 items-center gap-0.5 overflow-hidden px-2 select-none" data-surface="content">
      {/* Pinned overlay owns the buttons; this spacer eases the status dot beside them. */}
      <div className="flex items-center gap-0.5 shrink-0">
        <ContentSidebarSpacer />
      </div>

      {/* Status dot + open chat tabs (≥2) or single session title */}
      <div className="flex min-w-0 flex-1 items-center gap-1 ml-0.5">
        <div data-status-dot-hit="">
          <ServerStatusDot />
        </div>
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

      {/* Pinned overlay owns the glyphs; this spacer keeps the hit target on the window edge. */}
      <div className="flex items-center gap-0.5 shrink-0">
        {!inSettings ? (
          <>
            <ContentRightAreaSpacer />
            {!isMac && <div className="mx-1 h-4 w-px bg-border shrink-0" />}
          </>
        ) : null}

        <WindowControls />
      </div>
    </div>
  );
}
