import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useChatStore } from "@/stores/chat-store";

/** Subscribe to main-process AI PTY stream events (pty mode only). */
export function useTerminalAiStream(): void {
  const agentTerminalMode = useSettingsStore((s) => s.settings.agentTerminalMode ?? "pty");

  useEffect(() => {
    if (agentTerminalMode !== "pty") return;

    function resolveStreamTargetTab(
      sessionId: string,
      chatTabId: string,
    ): string | undefined {
      const tabs = useChatStore.getState().tabs;
      const byChat = tabs.find((t) => t.id === chatTabId);
      if (byChat) return byChat.id;
      const bySession = tabs.find((t) => t.sessionId === sessionId);
      return bySession?.id;
    }

    const unsubStream = window.electronAPI.onTerminalAiStream((payload) => {
      const tabId = resolveStreamTargetTab(payload.sessionId, payload.chatTabId);
      if (!tabId) return;
      useTerminalAiStore.getState().onAiStreamChunk(tabId, payload.chunk);
    });

    const unsubExit = window.electronAPI.onTerminalAiExit((payload) => {
      const tabId = resolveStreamTargetTab(payload.sessionId, payload.chatTabId);
      if (!tabId) return;
      useTerminalAiStore.getState().onAiStreamExit(
        tabId,
        payload.exitCode,
        payload.cwd,
        payload.toolCallId,
      );
    });

    return () => {
      unsubStream();
      unsubExit();
    };
  }, [agentTerminalMode]);
}
