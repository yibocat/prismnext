import { useEffect, useRef } from "react";
import { useChatStore, type ChatStreamMessage } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useChangesStore } from "@/stores/changes-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { compileCurrentDocument, pauseAutoCompileForAi, resumeAutoCompileAfterAi } from "@/stores/compile-store";
import { createLogger } from "@/services/logger";

const log = createLogger("claude-events");

// ─── ACP SessionNotification → batched text ───

interface AcpUpdate {
  sessionUpdate?: string;
  content?: { type?: string; text?: string } | null;
  toolCallId?: string;
  title?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  status?: string;
  kind?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

interface AcpNotification {
  sessionId: string;
  update: AcpUpdate;
}

import { cleanTextForDisplay } from "@/lib/system-prompt-cleaner";

// ─── Hook ───

export function useAgentEvents() {
  // Per-tab tracking
  const pendingToolUsesRef = useRef(new Map<string, Map<string, { name: string; input: any; oldContent?: string }>>());
  const hasTexChangesRef = useRef(new Map<string, boolean>());
  const aiSessionActiveRef = useRef(new Map<string, boolean>());
  const fileContentTrackerRef = useRef(new Map<string, string>());

  // Clear file content tracker on project switch to prevent cross-project corruption
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

  // Per-tab text/thinking accumulation (running total for entire turn)
  const textTotalRef = useRef(new Map<string, string>());
  const thinkTotalRef = useRef(new Map<string, string>());
  const thinkStartRef = useRef(new Map<string, number>()); // timestamp when thinking phase started
  const flushTimerRef = useRef(new Map<string, number>());

  function getTabMap<T>(ref: Map<string, T>, tabId: string, init: () => T): T {
    if (!ref.has(tabId)) ref.set(tabId, init());
    return ref.get(tabId)!;
  }

  function clearTabMaps(tabId: string) {
    pendingToolUsesRef.current.delete(tabId);
    hasTexChangesRef.current.delete(tabId);
    aiSessionActiveRef.current.delete(tabId);
    // Keep fileContentTrackerRef — it tracks cumulative edits across tabs
    // and is only cleared on project open/close
    textTotalRef.current.delete(tabId);
    thinkTotalRef.current.delete(tabId);
    thinkStartRef.current.delete(tabId);
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
        oldContent, // Use the actual base content used for the edit computation
        newContent,
        toolName,
      });
      log.info("change registered", { tool: toolName, file: file.relativePath, delta: newContent.length - oldContent.length });

      // Auto-open the file in the right panel so the diff is immediately visible
      const rpState = useRightPanelStore.getState();
      const existingTab = rpState.tabs.find((t) => t.filePath === file.relativePath);
      if (!existingTab) {
        const fileName = file.relativePath.split("/").pop() || file.relativePath;
        rpState.openFile(file.relativePath, file.relativePath, fileName);
      }
    }
  }

  // ─── Buffered message emission ───

  function flushTextBuffer(tabId: string) {
    const chatStore = useChatStore.getState();
    const rawText = textTotalRef.current.get(tabId) || "";
    const rawThink = thinkTotalRef.current.get(tabId) || "";

    // Skip if text contains local command tags (Claude CLI internal messages)
    const hasLocalCommand = /<\/?(?:local-command-caveat|command-name|command-message|command-args|local-command-stdout)>/i;

    // Clean system prompt from accumulated raw text
    const text = hasLocalCommand.test(rawText) ? "" : cleanTextForDisplay(rawText);
    const think = hasLocalCommand.test(rawThink) ? "" : cleanTextForDisplay(rawThink);

    if (think) {
      const thinkStart = thinkStartRef.current.get(tabId);
      const duration = thinkStart ? Math.round((Date.now() - thinkStart) / 1000) : undefined;
      chatStore._upsertLastMessage(tabId, {
        type: "assistant",
        message: { content: [{ type: "thinking", thinking: think, duration }] },
      });
    }

    if (text) {
      chatStore._upsertLastMessage(tabId, {
        type: "assistant",
        message: { content: [{ type: "text", text }] },
      });
    }

    const timer = flushTimerRef.current.get(tabId);
    if (timer) clearTimeout(timer);
    flushTimerRef.current.delete(tabId);
  }

  function scheduleFlush(tabId: string) {
    if (flushTimerRef.current.has(tabId)) return;
    const timer = window.setTimeout(() => flushTextBuffer(tabId), 80);
    flushTimerRef.current.set(tabId, timer);
  }

  useEffect(() => {
    // ─── Agent Stream Handler (ACP format) ───
    const unsubStream = window.electronAPI.onAgentStream(({ tabId, data }) => {
      const chatStore = useChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);
      if (!tab?.isStreaming) return;

      let notif: AcpNotification;
      try {
        notif = JSON.parse(data);
      } catch {
        return;
      }

      const { update } = notif;
      if (!update) return;

      const type = update.sessionUpdate;
      const pendingTools = getTabMap(pendingToolUsesRef.current, tabId, () => new Map());

      switch (type) {
        case "agent_message_chunk": {
          const raw = update.content?.text;
          if (!raw) break;

          // Accumulate raw text (keep XML tags for system block detection)
          const total = textTotalRef.current.get(tabId) || "";
          textTotalRef.current.set(tabId, total + raw);
          scheduleFlush(tabId);
          break;
        }

        case "agent_thought_chunk": {
          const raw = update.content?.text;
          if (!raw) break;

          // Track thinking start time
          if (!thinkStartRef.current.has(tabId)) {
            thinkStartRef.current.set(tabId, Date.now());
          }

          // Accumulate raw thinking (keep XML tags for system block detection)
          const total = thinkTotalRef.current.get(tabId) || "";
          thinkTotalRef.current.set(tabId, total + raw);
          scheduleFlush(tabId);
          break;
        }

        case "tool_call": {
          // Flush pending text, then reset accumulators so the next
          // thinking phase starts fresh (no duplicate thinking blocks)
          flushTextBuffer(tabId);
          textTotalRef.current.set(tabId, "");
          thinkTotalRef.current.set(tabId, "");
          thinkStartRef.current.delete(tabId); // reset timer for next thinking segment

          if (!update.toolCallId) break;

          // Build synthetic input from locations and content for chat display
          // (rawInput is not available in tool_call, only in tool_call_update)
          const locations = (update as any).locations as Array<{ path: string }> | undefined;
          const contentArr = (update as any).content as Array<any> | undefined;
          const syntheticInput: any = {};
          if (locations?.[0]?.path) {
            syntheticInput.file_path = locations[0].path;
          }
          // For Edit tools, extract old/new from content diff
          if (contentArr) {
            for (const item of contentArr) {
              if (item.type === "diff" && item.path) {
                syntheticInput.file_path = item.path;
                if (item.oldText !== undefined) syntheticInput.old_string = item.oldText;
                if (item.newText !== undefined) syntheticInput.new_string = item.newText;
              }
            }
          }

          const msg: ChatStreamMessage = {
            type: "assistant",
            message: {
              content: [{
                type: "tool_use",
                id: update.toolCallId,
                name: update.title || "",
                input: Object.keys(syntheticInput).length > 0 ? syntheticInput : update.rawInput,
              }],
            },
          };

          // Track tool_use for change detection
          // ACP Claude agent puts file paths in locations or content, NOT in rawInput
          const name = (update.title || "").toLowerCase();
          if (name.startsWith("write") || name.startsWith("edit") || name.startsWith("multiedit")) {
            let oldContent: string | undefined;
            const locations = (update as any).locations as Array<{ path: string }> | undefined;
            const fp = locations?.[0]?.path;
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
            pendingTools.set(update.toolCallId, {
              name: update.title || "",
              input: update.rawInput as any,
              oldContent,
              _fp: fp,
            });
          }

          chatStore._appendMessage(tabId, msg);
          break;
        }

        case "tool_call_update": {
          flushTextBuffer(tabId);
          textTotalRef.current.set(tabId, "");
          thinkTotalRef.current.set(tabId, "");

          if (!update.toolCallId) break;

          const msg: ChatStreamMessage = {
            type: "user",
            message: {
              content: [{
                type: "tool_result",
                tool_use_id: update.toolCallId,
                content: update.rawOutput,
                is_error: update.status === "failed",
              }],
            },
          };

          // Detect .tex file modifications
          const toolUse = pendingTools.get(update.toolCallId);
          if (
            toolUse &&
            update.status !== "failed" &&
            /^(Write|write|Edit|edit|MultiEdit|multiedit)(\s|$)/.test(toolUse.name)
          ) {
            const updateRawInput = (update as any).rawInput as any;
            // File path: try stored _fp first (from locations in tool_call), then rawInput from update
            const fp = (toolUse as any)._fp
              || updateRawInput?.file_path
              || updateRawInput?.path;
            const input = updateRawInput || toolUse.input;
            if (fp && /\.(tex|bib|sty|cls)$/i.test(fp)) {
              registerProposedChange(fp, update.toolCallId!, toolUse.name, input, toolUse.oldContent ?? "");
              hasTexChangesRef.current.set(tabId, true);
            }
          }

          chatStore._appendMessage(tabId, msg);
          break;
        }

        case "usage_update": {
          if (update.usage) {
            chatStore._appendMessage(tabId, {
              type: "result",
              usage: {
                input_tokens: update.usage.inputTokens || 0,
                output_tokens: update.usage.outputTokens || 0,
              },
            });
          }
          break;
        }
      }

      // Track AI session start (first agent message)
      const isNewAISession = !aiSessionActiveRef.current.get(tabId);
      if (isNewAISession) {
        aiSessionActiveRef.current.set(tabId, true);
        pauseAutoCompileForAi();
      }
    });

    // ─── Agent Complete Handler ───
    const unsubComplete = window.electronAPI.onAgentComplete(({ tabId, success, error }) => {
      // Flush any remaining buffered text
      flushTextBuffer(tabId);

      const chatStore = useChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);

      if (!success && !tab?.error && error) {
        chatStore._setError(tabId, error);
      }

      // Delay isStreaming=false to allow any pending stream events to arrive first
      // (IPC events from main process may be delivered after agent:complete)
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
    const unsubStderr = window.electronAPI.onAgentStderr(({ tabId, data }) => {
      log.warn("agent stderr", { tabId, data });
    });

    return () => {
      unsubStream();
      unsubComplete();
      unsubStderr();
    };
  }, []);
}
