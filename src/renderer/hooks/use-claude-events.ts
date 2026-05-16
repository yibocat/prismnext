import { useEffect, useRef } from "react";
import { useClaudeChatStore, type ClaudeStreamMessage } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { compileCurrentDocument, pauseAutoCompileForAi, resumeAutoCompileAfterAi } from "@/stores/compile-store";

export function useClaudeEvents() {
  // Per-tab tracking
  const pendingToolUsesRef = useRef(new Map<string, Map<string, { name: string; input: any }>>());
  const hasTexChangesRef = useRef(new Map<string, boolean>());
  const cancelledForAskRef = useRef(new Map<string, boolean>());
  const aiSessionActiveRef = useRef(new Map<string, boolean>());

  function getTabMap<T>(ref: Map<string, T>, tabId: string, init: () => T): T {
    if (!ref.has(tabId)) ref.set(tabId, init());
    return ref.get(tabId)!;
  }

  function clearTabMaps(tabId: string) {
    pendingToolUsesRef.current.delete(tabId);
    hasTexChangesRef.current.delete(tabId);
    cancelledForAskRef.current.delete(tabId);
    aiSessionActiveRef.current.delete(tabId);
  }

  useEffect(() => {
    // Stream handler
    const unsubStream = window.electronAPI.onClaudeStream(({ tabId, data }) => {
      let msg: ClaudeStreamMessage;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }

      const chatStore = useClaudeChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);
      if (!tab?.isStreaming) return;

      const pendingTools = getTabMap(pendingToolUsesRef.current, tabId, () => new Map());

      // Extract session_id from system/init
      if (msg.type === "system" && msg.subtype === "init" && msg.session_id) {
        chatStore._setSessionId(tabId, msg.session_id);
        pauseAutoCompileForAi();
        aiSessionActiveRef.current.set(tabId, true);
      }

      // Track tool_use blocks
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_use" && block.id && block.name) {
            pendingTools.set(block.id, { name: block.name, input: block.input });

            // AskUserQuestion: cancel the process
            if (block.name === "AskUserQuestion") {
              cancelledForAskRef.current.set(tabId, true);
              window.electronAPI.claudeCancel(tabId).catch(() => {});
            }
          }
        }
      }

      // Detect .tex file modifications
      if (msg.type === "user" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            const toolUse = pendingTools.get(block.tool_use_id);
            if (
              toolUse &&
              !block.is_error &&
              /^(Write|write|Edit|edit|MultiEdit|multiedit)$/.test(toolUse.name)
            ) {
              const fp = toolUse.input?.file_path || toolUse.input?.path;
              if (fp && /\.(tex|bib|sty|cls)$/i.test(fp)) {
                hasTexChangesRef.current.set(tabId, true);
              }
            }
          }
        }
      }

      // Skip pure-text user messages (we already added them in sendPrompt)
      if (
        msg.type === "user" &&
        msg.message?.content?.length === 1 &&
        msg.message.content[0].type === "text"
      ) {
        return;
      }

      chatStore._appendMessage(tabId, msg);
    });

    // Complete handler
    const unsubComplete = window.electronAPI.onClaudeComplete(({ tabId, success }) => {
      const chatStore = useClaudeChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);

      if (!success && !tab?.error && !cancelledForAskRef.current.get(tabId)) {
        chatStore._setError(
          tabId,
          "Claude process exited unexpectedly. Check that Claude Code CLI is installed and authenticated.",
        );
      }

      chatStore._setStreaming(tabId, false);

      // Auto-recompile if tex files changed
      if (hasTexChangesRef.current.get(tabId)) {
        const docState = useDocumentStore.getState();
        docState.refreshFiles().then(() => {
          compileCurrentDocument();
        });
      }

      // Resume auto-compile
      if (aiSessionActiveRef.current.get(tabId)) {
        resumeAutoCompileAfterAi();
      }

      clearTabMaps(tabId);
    });

    // Stderr handler
    const unsubStderr = window.electronAPI.onClaudeStderr(({ tabId, data }) => {
      console.warn("[claude stderr]", tabId, data);
    });

    return () => {
      unsubStream();
      unsubComplete();
      unsubStderr();
    };
  }, []);
}
