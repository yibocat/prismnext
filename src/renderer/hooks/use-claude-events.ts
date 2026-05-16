import { useEffect, useRef } from "react";
import { useClaudeChatStore, type ClaudeStreamMessage } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useChangesStore } from "@/stores/changes-store";
import { compileCurrentDocument, pauseAutoCompileForAi, resumeAutoCompileAfterAi } from "@/stores/compile-store";

export function useClaudeEvents() {
  // Per-tab tracking
  const pendingToolUsesRef = useRef(new Map<string, Map<string, { name: string; input: any; oldContent?: string }>>());
  const hasTexChangesRef = useRef(new Map<string, boolean>());
  const aiSessionActiveRef = useRef(new Map<string, boolean>());
  const fileContentTrackerRef = useRef(new Map<string, string>()); // Bug 5: stacked edit baseline

  function getTabMap<T>(ref: Map<string, T>, tabId: string, init: () => T): T {
    if (!ref.has(tabId)) ref.set(tabId, init());
    return ref.get(tabId)!;
  }

  function clearTabMaps(tabId: string) {
    pendingToolUsesRef.current.delete(tabId);
    hasTexChangesRef.current.delete(tabId);
    aiSessionActiveRef.current.delete(tabId);
    fileContentTrackerRef.current.clear();
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
      console.log("[changes] file not found:", filePath);
      return;
    }

    // Bug 5: use tracked content if available (stacked edits), else snapshot
    const trackedContent = fileContentTrackerRef.current.get(file.relativePath);
    const fallback = capturedOldContent || docState.getContent(file.id) || "";
    const oldContent = trackedContent ?? fallback;

    const name = toolName.toLowerCase();

    // Compute newContent — handle Write, Edit, and MultiEdit
    let newContent: string;

    if (name === "write") {
      newContent = toolInput?.content ?? "";
    } else if (name === "multiedit" && Array.isArray(toolInput?.edits)) {
      // Bug 7: MultiEdit has an edits array, apply each sequentially
      newContent = oldContent;
      for (const edit of toolInput.edits) {
        const oldStr: string = edit.old_string ?? "";
        const newStr: string = edit.new_string ?? "";
        if (oldStr === "" && newStr === "") continue;
        const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        newContent = newContent.replace(new RegExp(escaped, "g"), newStr);
      }
    } else if (name === "edit") {
      // Bug 4: always use global regex replace
      const oldStr: string = toolInput?.old_string ?? "";
      const newStr: string = toolInput?.new_string ?? "";
      if (oldStr === "" && newStr === "") {
        console.log("[changes] empty edit — skipping");
        return;
      }
      const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      newContent = oldContent.replace(new RegExp(escaped, "g"), newStr);
    } else {
      console.log("[changes] unknown tool:", toolName);
      return;
    }

    console.log("[changes] detected", {
      tool: toolName,
      file: file.relativePath,
      oldLen: oldContent.length,
      newLen: newContent.length,
      changed: oldContent !== newContent,
    });

    if (oldContent !== newContent) {
      // Bug 5: update tracked content so subsequent edits stack on this result
      fileContentTrackerRef.current.set(file.relativePath, newContent);

      useChangesStore.getState().addChange({
        id: toolUseId,
        filePath: file.relativePath,
        absolutePath: file.absolutePath,
        oldContent: capturedOldContent || docState.getContent(file.id) || "",
        newContent,
        toolName,
      });
      console.log("[changes] registered for", file.relativePath);
    } else {
      console.log("[changes] no difference — skipped");
    }
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
            // Capture a snapshot of the current file content BEFORE Claude edits it
            let oldContent: string | undefined;
            const name = block.name.toLowerCase();
            if (name === "write" || name === "edit" || name === "multiedit") {
              const fp = block.input?.file_path || block.input?.path;
              if (fp && /\.(tex|bib|sty|cls)$/i.test(fp)) {
                const docState = useDocumentStore.getState();
                const projectRoot = docState.projectRoot;
                let relativePath = fp;
                if (projectRoot && fp.startsWith(projectRoot)) {
                  relativePath = fp.slice(projectRoot.length).replace(/^\//, "");
                }
                const file = docState.files.find(
                  (f) => f.relativePath === relativePath || f.absolutePath === fp,
                );
                if (file) {
                  oldContent = docState.getContent(file.id) ?? "";
                }
              }
            }

            pendingTools.set(block.id, { name: block.name, input: block.input, oldContent });

            // AskUserQuestion: keep the process alive — answers are sent via stdin
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
                registerProposedChange(fp, block.tool_use_id!, toolUse.name, toolUse.input, toolUse.oldContent ?? "");
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

      if (!success && !tab?.error) {
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
