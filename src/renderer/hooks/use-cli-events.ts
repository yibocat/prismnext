import { useEffect, useRef, useState } from "react";
import { useChatStore, type ChatStreamMessage } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useChangesStore } from "@/stores/changes-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { compileCurrentDocument, pauseAutoCompileForAi, resumeAutoCompileAfterAi } from "@/stores/compile-store";
import { cleanTextForDisplay } from "@/lib/system-prompt-cleaner";
import { createLogger } from "@/services/logger";

const log = createLogger("claude-events");

// ─── Hook ───

export function useCliEvents() {
  // Force React re-render on each stream event
  const [, tick] = useState(0);

  // Per-tab tracking
  const pendingToolUsesRef = useRef(new Map<string, Map<string, { name: string; input: any; oldContent?: string }>>());
  const hasTexChangesRef = useRef(new Map<string, boolean>());
  const aiSessionActiveRef = useRef(new Map<string, boolean>());
  const fileContentTrackerRef = useRef(new Map<string, string>());

  // Clear file content tracker on project switch
  useEffect(() => {
    const docState = useDocumentStore.getState();
    let prevRoot = docState.projectRoot;
    const unsub = useDocumentStore.subscribe((state) => {
      if (state.projectRoot !== prevRoot) {
        prevRoot = state.projectRoot;
        fileContentTrackerRef.current.clear();
      }
    });
    return unsub;
  }, []);

  function clearTabMaps(tabId: string) {
    pendingToolUsesRef.current.delete(tabId);
    hasTexChangesRef.current.delete(tabId);
    aiSessionActiveRef.current.delete(tabId);
  }

  function registerProposedChange(
    filePath: string,
    toolUseId: string,
    toolName: string,
    toolInput: any,
    capturedOldContent: string,
  ) {
    const docState = useDocumentStore.getState();
    const projectRoot = docState.projectRoot;

    let relativePath = filePath;
    if (projectRoot && filePath.startsWith(projectRoot)) {
      relativePath = filePath.slice(projectRoot.length).replace(/^\//, "");
    }

    const file = docState.files.find(
      (f) => f.relativePath === relativePath || f.absolutePath === filePath,
    );
    if (!file) {
      log.debug("file not found in project", { filePath, relativePath, projectFiles: docState.files.length });
      return;
    }

    const trackedContent = fileContentTrackerRef.current.get(file.relativePath);
    const fallback = capturedOldContent || docState.getContent(file.id) || "";
    const oldContent = trackedContent ?? fallback;

    const name = toolName.toLowerCase();
    let newContent: string;

    if (name.startsWith("write")) {
      newContent = toolInput?.content ?? "";
    } else if (name.startsWith("multiedit") && Array.isArray(toolInput?.edits)) {
      newContent = oldContent;
      for (const edit of toolInput.edits) {
        const oldStr: string = edit.old_string ?? "";
        const newStr: string = edit.new_string ?? "";
        if (oldStr === "" && newStr === "") continue;
        const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        newContent = newContent.replace(new RegExp(escaped), newStr);
      }
    } else if (name.startsWith("edit")) {
      const oldStr: string = toolInput?.old_string ?? "";
      const newStr: string = toolInput?.new_string ?? "";
      if (oldStr === "" && newStr === "") {
        log.debug("empty edit — skipping", { toolName, filePath });
        return;
      }
      const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      newContent = oldContent.replace(new RegExp(escaped), newStr);
    } else {
      log.debug("unknown tool — skipping", { toolName, filePath });
      return;
    }

    if (oldContent !== newContent) {
      fileContentTrackerRef.current.set(file.relativePath, newContent);

      useChangesStore.getState().addChange({
        id: toolUseId,
        filePath: file.relativePath,
        absolutePath: file.absolutePath,
        oldContent,
        newContent,
        toolName,
      });

      const rpState = useRightPanelStore.getState();
      const existingTab = rpState.tabs.find((t) => t.filePath === file.relativePath);
      if (!existingTab) {
        const fileName = file.relativePath.split("/").pop() || file.relativePath;
        rpState.openFile(file.relativePath, file.relativePath, fileName);
      }
    }
  }

  useEffect(() => {
    // ─── CLI Stream Handler ───
    const unsubStream = window.electronAPI.onCliStream(({ tabId, data }) => {
      const chatStore = useChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      let msg: ChatStreamMessage;
      try {
        msg = JSON.parse(data) as ChatStreamMessage;
      } catch {
        return;
      }

      if (!msg.type) return;

      // Clean system prompt text from assistant text/thinking blocks
      if (msg.type === "assistant" && msg.message?.content) {
        msg = {
          ...msg,
          message: {
            ...msg.message,
            content: msg.message.content.map((b) => {
              if (b.type === "text" && b.text) {
                return { ...b, text: cleanTextForDisplay(b.text) };
              }
              if (b.type === "thinking" && b.thinking) {
                return { ...b, thinking: cleanTextForDisplay(b.thinking) };
              }
              return b;
            }),
          },
        };
      }

      // Merge assistant messages (progressive streaming updates) via upsert,
      // append everything else (user tool results, result completion).
      // _appendMessage handles attaching completion/token meta to the
      // preceding assistant atomically when the result arrives.
      if (msg.type === "assistant") {
        chatStore._upsertLastMessage(tabId, msg);
      } else {
        chatStore._appendMessage(tabId, msg);
      }

      // Track AI session start (first agent message)
      const isNewAISession = !aiSessionActiveRef.current.get(tabId);
      if (isNewAISession) {
        aiSessionActiveRef.current.set(tabId, true);
        pauseAutoCompileForAi();
      }

      // Track pending tool uses for change registration
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_use" && block.name && block.id) {
            const toolName = (block.name as string).toLowerCase();
            if (toolName.startsWith("edit") || toolName.startsWith("multiedit") || toolName.startsWith("write")) {
              const tabTools = pendingToolUsesRef.current.get(tabId) ||
                pendingToolUsesRef.current.set(tabId, new Map()).get(tabId)!;
              tabTools.set(block.id, { name: block.name, input: block.input });

              if (toolName.startsWith("edit") || toolName.startsWith("write")) {
                const filePath = block.input?.file_path || block.input?.path || "";
                if (filePath) {
                  hasTexChangesRef.current.set(tabId, true);
                  const relPath = filePath.replace(
                    (useDocumentStore.getState().projectRoot || "") + "/",
                    "",
                  );
                  if (!fileContentTrackerRef.current.has(relPath)) {
                    const file = useDocumentStore.getState().files.find(
                      (f) => f.relativePath === relPath || f.absolutePath === filePath,
                    );
                    if (file) {
                      const content = useDocumentStore.getState().getContent(file.id) || "";
                      fileContentTrackerRef.current.set(relPath, content);
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Register proposed changes when tool results arrive
      if (msg.type === "user" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            const tabTools = pendingToolUsesRef.current.get(tabId);
            const toolUse = tabTools?.get(block.tool_use_id);
            if (toolUse) {
              const filePath = toolUse.input?.file_path || toolUse.input?.path || "";
              const oldContent = filePath
                ? fileContentTrackerRef.current.get(
                    filePath.replace((useDocumentStore.getState().projectRoot || "") + "/", ""),
                  ) || ""
                : "";
              registerProposedChange(filePath, block.tool_use_id, toolUse.name, toolUse.input, oldContent);
            }
          }
        }
      }

      // Force React re-render
      tick((c) => c + 1);
    });

    // ─── Agent Complete Handler ───
    const unsubComplete = window.electronAPI.onCliComplete(({ tabId, success, error }) => {
      const chatStore = useChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);

      if (!success && !tab?.error && error) {
        chatStore._setError(tabId, error);
      }

      // Delay isStreaming=false to allow any pending stream events to arrive first
      setTimeout(() => chatStore._setStreaming(tabId, false), 50);

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

    // ─── Agent Stderr Handler ───
    const unsubStderr = window.electronAPI.onCliStderr(({ tabId, data }) => {
      log.warn("agent stderr", { tabId, data });
    });

    return () => {
      unsubStream();
      unsubComplete();
      unsubStderr();
    };
  }, []);
}
