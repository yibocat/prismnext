import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { usePermissionStore } from "@/stores/permission-store";
import { displayChatTitle } from "@/lib/i18n/display-chat-title";
import { getLeftNavPanelRefs } from "@/lib/workspace/left-nav/panel-refs";
import {
  openExperimentsPanel,
  openLiteratureLibrary,
  openTexWorkspaceMaximized,
} from "@/lib/workspace/left-nav/panel-utils";
import {
  pickRecentSessionsForTray,
  resolveTrayStatus,
  type TrayMenuSnapshot,
  type TrayModeId,
  type TrayRecentItem,
  type TrayStatus,
} from "../../shared/desktop-shell";

function projectDisplayName(projectRoot: string | null | undefined): string | null {
  if (!projectRoot) return null;
  const parts = projectRoot.replace(/[/\\]+$/, "").split(/[/\\]/);
  const name = parts[parts.length - 1]?.trim();
  return name || null;
}

function trayTooltip(
  status: TrayStatus,
  projectName: string | null,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  const head = projectName || t("shell.notify.defaultTitle");
  if (status === "attention") {
    return t("shell.tray.tooltipAttention", { project: head });
  }
  if (status === "busy") {
    return t("shell.tray.tooltipBusy", { project: head });
  }
  return t("shell.tray.tooltipIdle", { project: head });
}

async function buildRecentItems(
  t: (key: string) => string,
): Promise<TrayRecentItem[]> {
  const projectRoot = useDocumentStore.getState().projectRoot;
  const tabs = useChatStore.getState().tabs;

  if (projectRoot) {
    try {
      const sessions = await window.electronAPI.sessionList(projectRoot);
      return pickRecentSessionsForTray(sessions, 3).map((s) => {
        const tab = tabs.find((tab) => tab.sessionId === s.id);
        const title =
          displayChatTitle(tab?.title && tab.title !== "New Chat" ? tab.title : s.title, t) ||
          s.title ||
          t("shell.notify.defaultTitle");
        return {
          id: s.id,
          title,
          sessionId: s.id,
          tabId: tab?.id,
        };
      });
    } catch {
      // fall through to open tabs
    }
  }

  return [...tabs]
    .slice()
    .reverse()
    .slice(0, 3)
    .map((tab) => ({
      id: tab.id,
      title: displayChatTitle(tab.title, t) || t("shell.notify.defaultTitle"),
      sessionId: tab.sessionId ?? undefined,
      tabId: tab.id,
    }));
}

/** Keep Tray icon status + menu (project / new chat / recent sessions) in sync. */
export function useTrayStatusSync(): void {
  const { t, i18n } = useTranslation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pushStatus = () => {
      const tabs = useChatStore.getState().tabs;
      const isStreaming = tabs.some((tab) => tab.isStreaming);
      const hasPendingPermission = usePermissionStore.getState().permissions.length > 0;
      const status = resolveTrayStatus({ hasPendingPermission, isStreaming });
      const projectName = projectDisplayName(useDocumentStore.getState().projectRoot);
      void window.electronAPI.shellSetTrayStatus(
        status,
        trayTooltip(status, projectName, t),
      );
    };

    const pushMenu = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void (async () => {
          const projectName = projectDisplayName(
            useDocumentStore.getState().projectRoot,
          );
          const recent = await buildRecentItems((key) => t(key));
          const snapshot: TrayMenuSnapshot = {
            showLabel: projectName
              ? t("shell.tray.showProject", { project: projectName })
              : t("shell.tray.show"),
            newChatLabel: t("shell.tray.newChat"),
            quitLabel: t("shell.tray.quit"),
            recent,
            projectName,
            modes: projectName
              ? [
                  { id: "texworkspace", label: t("nav.texWorkspace") },
                  { id: "literature", label: t("nav.library") },
                  { id: "experiments", label: t("nav.experiments") },
                ]
              : [],
          };
          void window.electronAPI.shellSetTrayMenu(snapshot);
          // Menu update does not change status, but project rename/open should
          // refresh the hover tooltip immediately.
          pushStatus();
        })();
      }, 150);
    };

    const pushAll = () => {
      pushStatus();
      pushMenu();
    };

    pushAll();
    const unsubChat = useChatStore.subscribe(pushAll);
    const unsubPerm = usePermissionStore.subscribe(pushStatus);
    const unsubDoc = useDocumentStore.subscribe(pushAll);

    const onSessionRefresh = () => pushMenu();
    window.addEventListener("prism:session-list-refresh", onSessionRefresh);

    const unsubFocus = window.electronAPI.onShellFocusChatTab(({ tabId }) => {
      useChatStore.getState().setActiveTab(tabId);
    });

    const unsubNewChat = window.electronAPI.onShellTrayNewChat(() => {
      useChatStore.getState().newSession();
    });

    const unsubOpenRecent = window.electronAPI.onShellTrayOpenRecent((args) => {
      const chat = useChatStore.getState();
      if (args.tabId && chat.tabs.some((tab) => tab.id === args.tabId)) {
        chat.setActiveTab(args.tabId);
        return;
      }
      if (args.sessionId) {
        void chat.loadSession(args.sessionId);
        return;
      }
      if (args.tabId) {
        chat.setActiveTab(args.tabId);
      }
    });

    const unsubOpenMode = window.electronAPI.onShellTrayOpenMode(({ modeId }) => {
      openTrayModeMaximized(modeId);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubChat();
      unsubPerm();
      unsubDoc();
      window.removeEventListener("prism:session-list-refresh", onSessionRefresh);
      unsubFocus();
      unsubNewChat();
      unsubOpenRecent();
      unsubOpenMode();
    };
  }, [t, i18n.language]);
}

function openTrayModeMaximized(modeId: TrayModeId): void {
  if (!useDocumentStore.getState().projectRoot) return;
  const ctx = { panelRefs: getLeftNavPanelRefs() };
  if (modeId === "texworkspace") {
    openTexWorkspaceMaximized(ctx);
    return;
  }
  if (modeId === "literature") {
    openLiteratureLibrary(ctx);
    return;
  }
  if (modeId === "experiments") {
    openExperimentsPanel(ctx);
  }
}
