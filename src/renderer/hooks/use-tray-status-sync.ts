import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { usePermissionStore } from "@/stores/permission-store";
import { displayChatTitle } from "@/lib/i18n/display-chat-title";
import {
  pickRecentSessionsForTray,
  resolveTrayStatus,
  type TrayMenuSnapshot,
  type TrayRecentItem,
} from "../../shared/desktop-shell";

async function buildRecentItems(
  t: (key: string) => string,
): Promise<TrayRecentItem[]> {
  const projectRoot = useDocumentStore.getState().projectRoot;
  const tabs = useChatStore.getState().tabs;

  if (projectRoot) {
    try {
      const sessions = await window.electronAPI.sessionList(projectRoot);
      return pickRecentSessionsForTray(sessions, 3).map((s) => {
        const tab = tabs.find((t) => t.sessionId === s.id);
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

/** Keep Tray icon status + menu (new chat / recent sessions) in sync. */
export function useTrayStatusSync(): void {
  const { t, i18n } = useTranslation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pushStatus = () => {
      const tabs = useChatStore.getState().tabs;
      const isStreaming = tabs.some((tab) => tab.isStreaming);
      const hasPendingPermission = usePermissionStore.getState().permissions.length > 0;
      const status = resolveTrayStatus({ hasPendingPermission, isStreaming });
      void window.electronAPI.shellSetTrayStatus(status);
    };

    const pushMenu = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void (async () => {
          const recent = await buildRecentItems((key) => t(key));
          const snapshot: TrayMenuSnapshot = {
            showLabel: t("shell.tray.show"),
            newChatLabel: t("shell.tray.newChat"),
            quitLabel: t("shell.tray.quit"),
            recent,
          };
          void window.electronAPI.shellSetTrayMenu(snapshot);
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
    const unsubDoc = useDocumentStore.subscribe(pushMenu);

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

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubChat();
      unsubPerm();
      unsubDoc();
      window.removeEventListener("prism:session-list-refresh", onSessionRefresh);
      unsubFocus();
      unsubNewChat();
      unsubOpenRecent();
    };
  }, [t, i18n.language]);
}
