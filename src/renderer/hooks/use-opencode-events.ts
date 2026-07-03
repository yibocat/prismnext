import { useEffect, useRef } from "react";
import { useChatStore, type ChatStreamMessage, type ContentBlock } from "@/stores/chat-store";

import { useDocumentStore } from "@/stores/document-store";
import { useChangesStore } from "@/stores/changes-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { usePermissionStore } from "@/stores/permission-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import {
  captureLiteratureStageForSession,
  captureLiteratureStageFromToolResult,
} from "@/lib/literature/sync-citation-staging-from-messages";
import { enrichTaskToolResultFromStore } from "@/lib/literature/format-session-citations-context";
import {
  resolvePermissionMode,
  extractPermissionToolName,
} from "@shared/permission-modes";
import { schedulePermissionTimeout, clearPermissionTimer } from "@/stores/permission-actions";
import { handleBashToolUse, handleBashToolResult, handleBashPermissionDenied, isBashToolName } from "@/lib/terminal/ai-bridge";
import { shouldTrackProposedChange, isDiskMutationTool, isFileWriteTool, isPatchTool, extractPatchTargetPaths } from "@/components/modules/chat/tools/tool-meta";
import { useCheckpointStore, resolveRelativeToolPath } from "@/stores/checkpoint-store";
import { compileCurrentDocument, pauseAutoCompileForAi, resumeAutoCompileAfterAi } from "@/stores/compile-store";
import { createLogger } from "@/services/logger";
import { isPrismSystemPromptText } from "@/lib/chat/session-message-hydrate";
import { refreshGitStatusNow } from "@/lib/git/checkout-context";

const log = createLogger("opencode-events");

interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: any;
  is_error?: boolean;
  thinking?: string;
  duration?: number;
  signature?: string;
  _progress?: boolean;
  /** OpenCode tool_call: human-readable description of what the tool is doing */
  title?: string;
  /** OpenCode tool_call: tool category (fs, terminal, search, network, workflow) */
  kind?: string;
  /** OpenCode tool_call / tool_call_update: execution status */
  status?: string;
  /** OpenCode tool_call: affected file locations */
  locations?: Array<{ file: string; line?: number }>;
  /** Internal: real tool input delivered via tool_call_update for backfill */
  _backfillInput?: any;
  /** Internal: corrected tool name from backfill (when initial kind was ambiguous) */
  _backfillName?: string | null;
}

export function useOpenCodeEvents() {
  const pendingToolUsesRef = useRef(new Map<string, Map<string, { name: string; input: any }>>());
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

  function noteCheckpointMutation(
    tabId: string,
    filePath: string,
    beforeContent: string,
  ) {
    const resolved = resolveRelativeToolPath(filePath);
    if (!resolved) return;
    useCheckpointStore.getState().noteFileMutation(
      tabId,
      resolved.relativePath,
      resolved.absolutePath,
      beforeContent,
    );
  }

  function noteCheckpointForDiskTool(
    tabId: string,
    toolName: string,
    toolInput: unknown,
    tracker: Map<string, string>,
  ) {
    if (!isDiskMutationTool(toolName)) return;
    const paths = isPatchTool(toolName)
      ? extractPatchTargetPaths(toolInput as Record<string, unknown>)
      : [
          (toolInput as Record<string, string> | undefined)?.file_path
          || (toolInput as Record<string, string> | undefined)?.filePath
          || (toolInput as Record<string, string> | undefined)?.path
          || "",
        ].filter(Boolean);
    for (const fp of paths) {
      const resolved = resolveRelativeToolPath(fp);
      if (!resolved) continue;
      const before = tracker.get(resolved.relativePath) ?? "";
      useCheckpointStore.getState().noteFileMutation(
        tabId,
        resolved.relativePath,
        resolved.absolutePath,
        before,
      );
    }
  }

  function registerProposedChange(
    tabId: string,
    filePath: string,
    toolUseId: string,
    toolName: string,
    toolInput: any,
    capturedOldContent: string,
  ) {
    if (!shouldTrackProposedChange(
      useSettingsStore.getState().settings.permissionMode,
      toolName,
    )) {
      return;
    }

    const docState = useDocumentStore.getState();
    if (usePermissionStore.getState().isToolResolved(tabId, toolUseId)) {
      return;
    }

    const projectRoot = docState.projectRoot;
    const worktreeStore = useWorktreeStore.getState();
    const activeWorktree = worktreeStore.activeWorktree;

    let resolvedPath = filePath;
    if (activeWorktree && filePath.startsWith(activeWorktree.path)) {
      resolvedPath = filePath;
    }

    let relativePath = resolvedPath;
    if (activeWorktree && resolvedPath.startsWith(activeWorktree.path)) {
      relativePath = resolvedPath.slice(activeWorktree.path.length).replace(/^\//, "");
    } else if (projectRoot && resolvedPath.startsWith(projectRoot)) {
      relativePath = resolvedPath.slice(projectRoot.length).replace(/^\//, "");
    }

    const file = docState.files.find(
      (f) => f.relativePath === relativePath || f.absolutePath === filePath,
    );

    const isNewFile = !file && toolName.toLowerCase().startsWith("write");
    if (!file && !isNewFile) return;

    const name = toolName.toLowerCase();
    const oldStr: string = toolInput?.old_string ?? toolInput?.oldString ?? "";
    const newStr: string = toolInput?.new_string ?? toolInput?.newString ?? "";

    // ── Determine old and new content ──────────────────────────
    // OpenCode ACP sends tool params in two phases:
    //   1. tool_call (rawInput: {})        → empty input, no file path
    //   2. tool_call_update (backfill)     → real params arrive here
    //
    // By the time backfill arrives, OpenCode MAY have already written the
    // modified file to disk.  But this is NOT guaranteed — the file write
    // might race with the ACP event.  We therefore try a DUAL-DIRECTION
    // strategy that works whether the disk content is pre-edit or post-edit.
    //
    // Strategy (in priority order):
    //   A. FORWARD:  if disk content contains oldStr → forward edit
    //   B. REVERSE:  if disk content contains newStr → reverse edit
    //   C. FALLBACK: use the file content tracker (captured at tool_use time)
    let oldContent: string;
    let newContent: string;

    if (name.startsWith("write")) {
      newContent = toolInput?.content ?? "";
      oldContent = "";
    } else {
      // Read the current file content from tracker, doc store, or captured arg.
      const diskContent =
        fileContentTrackerRef.current.get(file?.relativePath || relativePath) ||
        (file ? docState.getContent(file.id) : "") ||
        capturedOldContent ||
        "";

      if (name.startsWith("edit") && oldStr !== "" && newStr !== "" && diskContent) {
        const escapedOld = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escapedNew = newStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        // Strategy A: FORWARD — disk still has pre-edit content
        if (diskContent.includes(oldStr)) {
          oldContent = diskContent;
          newContent = diskContent.replace(new RegExp(escapedOld, "g"), newStr);
        }
        // Strategy B: REVERSE — disk already has post-edit content
        else if (diskContent.includes(newStr)) {
          newContent = diskContent;
          oldContent = diskContent.replace(new RegExp(escapedNew, "g"), oldStr);
        }
        // Strategy C: FALLBACK — use captured content and forward edit
        else {
          oldContent = capturedOldContent ||
            (file ? docState.getContent(file.id) : "") || "";
          newContent = oldContent;
          if (oldStr) {
            newContent = oldContent.replace(new RegExp(escapedOld, "g"), newStr);
          }
        }
      } else {
        // Fallback: use captured/tracked content with forward edit
        oldContent = capturedOldContent ||
          (file ? docState.getContent(file.id) : "") || "";
        newContent = oldContent;
        if (name.startsWith("edit") && oldStr) {
          const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          newContent = oldContent.replace(new RegExp(escaped, "g"), newStr);
        }
      }
    }

    if (oldContent !== newContent) {
      if (file) {
        noteCheckpointMutation(tabId, file.absolutePath, oldContent);
      } else if (isNewFile) {
        noteCheckpointMutation(tabId, resolvedPath, "");
      }

      if (file) {
        fileContentTrackerRef.current.set(file.relativePath, newContent);
      }

      useChangesStore.getState().addChange({
        id: toolUseId,
        filePath: relativePath,
        absolutePath: resolvedPath,
        oldContent,
        newContent,
        toolName,
      });

      const rpState = useRightPanelStore.getState();
      const existingTab = rpState.tabs.find((t) => t.filePath === relativePath);
      if (!existingTab) {
        const fileName = relativePath.split("/").pop() || relativePath;
        rpState.openFile(relativePath, relativePath, fileName);
      }
    }
  }

  /** After Auto-mode file mutations, OpenCode writes directly — refresh editor from disk. */
  function refreshFileFromDiskAfterAutoApply(filePath: string) {
    if (!filePath) return;

    const docState = useDocumentStore.getState();
    const projectRoot = docState.projectRoot || "";
    const activeWorktree = useWorktreeStore.getState().activeWorktree;

    let relativePath = filePath;
    if (activeWorktree && filePath.startsWith(activeWorktree.path)) {
      relativePath = filePath.slice(activeWorktree.path.length).replace(/^\//, "");
    } else if (projectRoot && filePath.startsWith(projectRoot)) {
      relativePath = filePath.slice(projectRoot.length).replace(/^\//, "");
    }

    const file = docState.files.find(
      (f) => f.relativePath === relativePath || f.absolutePath === filePath,
    );
    if (file) {
      void docState.refreshFileContent(file.id);
    } else {
      void docState.refreshFiles();
    }
  }

  function refreshAfterAutoDiskMutation(tabId: string, toolName: string, toolInput: any) {
    const normalizedTool = toolName.toLowerCase();
    if (normalizedTool === "delete" || normalizedTool === "move") {
      noteCheckpointForDiskTool(tabId, toolName, toolInput, fileContentTrackerRef.current);
      void useDocumentStore.getState().refreshFiles();
      refreshGitStatusNow();
      if (normalizedTool === "move") {
        const dest =
          toolInput?.destination_path || toolInput?.destinationPath || toolInput?.dest || "";
        if (dest) refreshFileFromDiskAfterAutoApply(dest);
      }
      return;
    }

    if (resolvePermissionMode(useSettingsStore.getState().settings.permissionMode) !== "auto") {
      return;
    }
    if (!isDiskMutationTool(toolName)) return;

    noteCheckpointForDiskTool(tabId, toolName, toolInput, fileContentTrackerRef.current);

    if (isPatchTool(toolName)) {
      for (const filePath of extractPatchTargetPaths(toolInput)) {
        refreshFileFromDiskAfterAutoApply(filePath);
      }
      return;
    }

    const filePath = toolInput?.file_path || toolInput?.filePath || toolInput?.path || "";
    refreshFileFromDiskAfterAutoApply(filePath);
  }

  /** Convert an OpenCode SSE part to our ContentBlock format. */
  function convertPartToBlock(part: any): ContentBlock | null {
    if (!part || !part.type) return null;

    // Always use part.text/part.thinking (full accumulated text from EventMapper).

    switch (part.type) {
      case "text":
        return { type: "text", text: part.text || "" };
      case "reasoning":
        return { type: "thinking", thinking: part.text || "" };
      case "thinking":
        return { type: "thinking", thinking: part.thinking || part.text || "" };
      case "tool":
        {
          // Derive the tool name from whatever field OpenCode populated.
          const rawName =
            part.tool?.name || part.name || part.tool || "";
          const derivedName = rawName ||
            (typeof part.kind === "string" ? part.kind : "") ||
            (typeof part.title === "string" ? part.title.split(" ")[0]?.toLowerCase() : "") ||
            "";
          const extractedInput = part.tool?.input || part.input || part.state?.input || {};

          // Debug: log what the renderer received vs what EventMapper sent.
          // The _debug field is attached by EventMapper for diagnostics.
          const debugInfo = (part as any)._debug;
          if (debugInfo) {
            console.log(`[opencode-events] tool_use received: name="${derivedName}" id=${part.id} inputKeys=${JSON.stringify(Object.keys(extractedInput))} _debug=${JSON.stringify(debugInfo)}`);
          }

          return {
            type: "tool_use",
            id: part.id || part.toolId || "",
            name: derivedName,
            input: extractedInput,
            title: part.title || part.tool?.title || "",
            kind: part.kind || part.tool?.kind || "",
            status: part.status || part.state?.status || "",
            locations: part.locations || part.tool?.locations || [],
          };
        }
      case "tool_use":
      case "tool-use":
        {
          const derivedName = part.tool || part.name || "";
          return {
            type: "tool_use",
            id: part.id || part.toolId || "",
            name: derivedName,
            input: part.input || part.arguments || {},
            title: part.title || "",
            kind: part.kind || "",
            status: part.status || "",
            locations: part.locations || [],
          };
        }
      case "tool_result":
      case "tool-result":
        return {
          type: "tool_result",
          tool_use_id: part.tool_use_id || part.toolUseId,
          content: part.content || part.result,
          is_error: part.isError || part.is_error,
          status: part.status || "",
          _backfillInput: (part as any)._backfillInput || undefined,
          _backfillName: (part as any)._backfillName || undefined,
        };
      default:
        return null;
    }
  }

  useEffect(() => {
    // ─── Chat Stream Handler ───
    const unsubStream = window.electronAPI.onChatStream(({ tabId, type, data }) => {
      const chatStore = useChatStore.getState();

      // Global agent lifecycle events (empty tabId) — broadcast to the active tab
      if (type === "agent.reconnected" || type === "agent.connectionLost") {
        const activeTab = chatStore.tabs.find((t) => t.id === chatStore.activeTabId);
        if (!activeTab) return;
        // Emit as a system message on the active tab so the user sees the status change
        chatStore._appendMessage(chatStore.activeTabId, {
          type: "system",
          subtype: type === "agent.reconnected" ? "agent.reconnected" : "agent.connectionLost",
          message: {
            content: [{
              type: "text",
              text: type === "agent.reconnected"
                ? "Agent reconnected successfully."
                : `Agent connection lost: ${data?.error || "Unknown error"}`,
            }],
          },
        });
        return;
      }

      const tab = chatStore.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      switch (type) {
        case "subAgent.linked": {
          const taskToolUseId = String(data.taskToolUseId || "");
          if (!taskToolUseId) break;
          chatStore._linkSubAgentRun(tabId, taskToolUseId, {
            expertId: String(data.expertId || "general"),
            prompt: String(data.prompt || ""),
            subSessionId: data.subSessionId ? String(data.subSessionId) : undefined,
          });
          break;
        }

        case "subAgent.activity": {
          const taskToolUseId = String(data.taskToolUseId || "");
          const block = data.block as ContentBlock | undefined;
          if (!taskToolUseId || !block) break;
          chatStore._upsertSubAgentActivity(tabId, taskToolUseId, block);
          if (block.type === "tool_result" && !block.is_error) {
            const tab = useChatStore.getState().tabs.find((t) => t.id === tabId);
            const sessionId = tab?.sessionId;
            const run = tab?.subAgentRuns?.[taskToolUseId];
            if (sessionId && run?.blocks.length) {
              const toolName = (
                (block as ContentBlock & { name?: string }).name
                || run.blocks.find(
                  (b) => b.type === "tool_use" && b.id === block.tool_use_id,
                )?.name
                || ""
              ).toLowerCase();
              if (toolName === "literature-stage") {
                captureLiteratureStageForSession(sessionId, run.blocks);
              }
            }
          }
          break;
        }

        case "subAgent.completed": {
          const taskToolUseId = String(data.taskToolUseId || "");
          if (!taskToolUseId) break;
          chatStore._completeSubAgentRun(
            tabId,
            taskToolUseId,
            data.status === "error" ? "error" : "done",
          );
          break;
        }

        case "citation.staged": {
          const sessionId = String(data.sessionId || "");
          const result = data.result;
          if (sessionId && result && typeof result === "object") {
            useCitationStagingStore.getState().upsertFromStageResult(
              sessionId,
              result as import("@shared/citation-staging").StageResult,
            );
            useCitationStagingStore.getState().setActiveSession(sessionId);
          }
          break;
        }

        case "message.part.updated": {
          if (!tab.isStreaming) {
            break;
          }
          const part = data.part || data;
          const block = convertPartToBlock(part);

          if (block) {
            // Skip empty text blocks — OpenCode sends placeholder parts
            // with empty text before filling them in, which would briefly
            // show blank content and break the streaming illusion.
            if ((block.type === "text" && !block.text) || (block.type === "thinking" && !block.thinking)) {
              break;
            }

            // Skip text blocks that echo the user's last message.
            // Only applies when there's no real assistant content yet
            // (streamingMessage is empty or only has progress blocks).
            if (block.type === "text" && block.text) {
              if (isPrismSystemPromptText(block.text)) {
                break;
              }
              const existing = tab.streamingMessage?.message?.content || [];
              const hasRealContent = existing.some(
                (b: any) => (b.type === "text" || b.type === "thinking") && !b._progress
              );
              if (!hasRealContent) {
                const lastUserMsg = [...tab.messages].reverse().find((m) => m.type === "user");
                if (lastUserMsg) {
                  const userText = lastUserMsg.message?.content
                    ?.filter((b: any) => b.type === "text")
                    ?.map((b: any) => b.text)
                    ?.join(" ") || "";
                  if (block.text.trim() === userText.trim()) {
                    break;
                  }
                }
              }
            }

            const msg: ChatStreamMessage = {
              type: "assistant",
              message: { content: [block] },
            };
            chatStore._upsertLastMessage(tabId, msg);

            // Track tool uses for change registration + result name lookup.
            if (
              block.type === "tool_use"
              && block.id
              && (block.name || block.kind === "execute")
            ) {
              const toolName = (
                (block.name as string)
                || (block.kind === "execute" ? "bash" : "")
              ).toLowerCase();
              const tabTools = pendingToolUsesRef.current.get(tabId) ||
                pendingToolUsesRef.current.set(tabId, new Map()).get(tabId)!;
              tabTools.set(block.id, { name: block.name || toolName, input: block.input });

              if (toolName === "bash" || toolName === "shell" || toolName === "terminal" || toolName === "execute") {
                handleBashToolUse(
                  tabId,
                  block.id,
                  toolName,
                  block.input as Record<string, unknown> | undefined,
                );
              }
              if (isDiskMutationTool(toolName)) {
                const filePaths = isPatchTool(toolName)
                  ? extractPatchTargetPaths(block.input)
                  : [
                      block.input?.file_path || block.input?.filePath || block.input?.path ||
                      (block.locations?.[0] as any)?.path || block.locations?.[0]?.file || "",
                    ].filter(Boolean);

                if (filePaths.some((p) => p.endsWith(".tex"))) {
                  hasTexChangesRef.current.set(tabId, true);
                }
              }
            }
          }
          break;
        }

        case "message.updated": {
          const message = data.message || data;
          if (message.content && Array.isArray(message.content)) {
            // Collect tool_result blocks to add to the chat store so Widgets
            // can find them via toolResultMap. Each tool_result is emitted as
            // a result-type message (hidden from the message list) that provides
            // the result content for the matching tool_use Widget.
            const toolResultBlocks: ContentBlock[] = [];

            for (const part of message.content) {
              if ((part.type === "tool_result" || part.type === "tool-result") && (part.tool_use_id || part.toolUseId)) {
                const toolUseId = part.tool_use_id || part.toolUseId;

                // Convert to ContentBlock for storage + Widget matching
                const block = convertPartToBlock(part);
                if (block) toolResultBlocks.push(block);

                // Register proposed file changes for edit/write tools
                const tabTools = pendingToolUsesRef.current.get(tabId);
                const toolUse = tabTools?.get(toolUseId);
                if (toolUse) {
                  const filePath = toolUse.input?.file_path || toolUse.input?.filePath || toolUse.input?.path || "";
                  const projectRoot = useDocumentStore.getState().projectRoot || "";
                  const oldContent = filePath
                    ? fileContentTrackerRef.current.get(
                        filePath.replace(projectRoot + "/", ""),
                      ) || ""
                    : "";
                  registerProposedChange(tabId, filePath, toolUseId, toolUse.name, toolUse.input, oldContent);
                }
              }
            }

            // Store tool_result blocks and process backfills.
            // Each tool_result becomes a hidden result-type message — picked up
            // by toolResultMap in chat-messages.tsx for Widget matching.
            for (let block of toolResultBlocks) {
              const toolUseId = block.tool_use_id || "";
              const status = (block.status || "").toLowerCase();
              const isFinalToolResult = !status || status === "completed" || status === "failed";
              if (isFinalToolResult) {
                const resultMsg: ChatStreamMessage = {
                  type: "result",
                  message: { content: [block] },
                };
                console.log(`[opencode-events] storing tool_result: tool_use_id=${toolUseId} status=${status || "(none)"} contentLen=${typeof block.content === "string" ? block.content.length : JSON.stringify(block.content || "").length} isError=${block.is_error}`);
                chatStore._appendMessage(tabId, resultMsg);

                const toolName = (
                  pendingToolUsesRef.current.get(tabId)?.get(toolUseId)?.name
                  || (block as any)._backfillName
                  || ""
                ).toLowerCase();
                if (toolName === "bash" || toolName === "shell" || toolName === "terminal" || toolName === "execute") {
                  handleBashToolResult(toolUseId, block.content, block.is_error);
                }

                // Capture literature-stage results into the citation staging store
                // so chat [n] references and the Session citations panel stay in sync.
                if (toolName === "literature-stage" && !block.is_error) {
                  const sessionId =
                    useChatStore.getState().tabs.find((t) => t.id === tabId)?.sessionId ?? null;
                  if (sessionId) {
                    captureLiteratureStageFromToolResult(sessionId, block.content);
                  }
                }

                if (toolName === "task" && !block.is_error) {
                  const sessionId =
                    useChatStore.getState().tabs.find((t) => t.id === tabId)?.sessionId ?? null;
                  if (sessionId) {
                    const citations =
                      useCitationStagingStore.getState().getCitationsForSession(sessionId);
                    if (citations.length > 0) {
                      block = {
                        ...block,
                        content: enrichTaskToolResultFromStore(
                          sessionId,
                          citations,
                          block.content,
                        ),
                      };
                    }
                  }
                }

                if (!block.is_error) {
                  const tabTools = pendingToolUsesRef.current.get(tabId);
                  const toolUse = tabTools?.get(toolUseId);
                  if (toolUse) {
                    refreshAfterAutoDiskMutation(tabId, toolUse.name, toolUse.input);
                  }
                }
              } else {
                console.log(`[opencode-events] tool_result update not final: tool_use_id=${toolUseId} status=${status}`);
              }

              // Apply backfill input if present — patches the empty rawInput
              // from the initial tool_call with real parameters.
              const backfillInput = (block as any)._backfillInput;
              const backfillName = (block as any)._backfillName as string | null;
              if (backfillInput && typeof backfillInput === "object" && Object.keys(backfillInput).length > 0) {
                console.log(`[opencode-events] backfilling tool input: tool_use_id=${toolUseId} keys=${Object.keys(backfillInput).join(",")} name=${backfillName || "(unchanged)"}`);

                // 1. Patch the tool_use block's input AND name
                chatStore._patchToolInput(tabId, toolUseId, backfillInput, backfillName || undefined);

                // 2. Re-register proposed change with the REAL input.
                const tabTools = pendingToolUsesRef.current.get(tabId);
                const pendingTool = tabTools?.get(toolUseId);
                if (pendingTool) {
                  pendingTool.input = backfillInput;
                  if (backfillName) pendingTool.name = backfillName;

                  const toolName = (pendingTool.name as string).toLowerCase();
                  if (
                    !isFinalToolResult
                    && (
                      toolName === "bash"
                      || toolName === "shell"
                      || toolName === "terminal"
                      || toolName === "execute"
                    )
                  ) {
                    handleBashToolUse(
                      tabId,
                      toolUseId,
                      backfillName?.toLowerCase() || toolName,
                      backfillInput as Record<string, unknown>,
                    );
                  }

                  if (toolName === "delete" || toolName === "move") {
                    if (isFinalToolResult && !block.is_error) {
                      refreshAfterAutoDiskMutation(tabId, pendingTool.name, backfillInput);
                    }
                    continue;
                  }

                  const filePath = backfillInput.file_path || backfillInput.filePath || backfillInput.path || "";
                  const projectRoot = useDocumentStore.getState().projectRoot || "";
                  const docState = useDocumentStore.getState();
                  const relPath = filePath && projectRoot ? filePath.replace(projectRoot + "/", "") : "";
                  const touchedPaths = isPatchTool(toolName)
                    ? extractPatchTargetPaths(backfillInput)
                    : filePath ? [filePath] : [];
                  if (touchedPaths.some((p) => p.endsWith(".tex"))) {
                    hasTexChangesRef.current.set(tabId, true);
                  }

                  if (isFinalToolResult && !block.is_error) {
                    refreshAfterAutoDiskMutation(tabId, pendingTool.name, backfillInput);
                  }

                  console.log(`[opencode-events] backfill registerProposedChange: toolName=${pendingTool.name} filePath=${filePath} inputKeys=${Object.keys(backfillInput).join(",")} oldStr=${(backfillInput.old_string || backfillInput.oldString || "").slice(0, 40)} newStr=${(backfillInput.new_string || backfillInput.newString || "").slice(0, 40)}`);

                  // Read current file content from disk. registerProposedChange
                  // uses dual-direction strategy (forward→reverse fallback).
                  const file = docState.files.find(
                    (f) => f.relativePath === relPath || f.absolutePath === filePath,
                  );
                  const ensureContent = file
                    ? (async () => {
                        await docState.refreshFileContent(file.id);
                        return docState.getContent(file.id) || "";
                      })()
                    : Promise.resolve("");

                  ensureContent.then((diskContent) => {
                    if (diskContent && relPath) {
                      fileContentTrackerRef.current.set(relPath, diskContent);
                      console.log(`[opencode-events] backfill loaded file content: ${relPath} len=${diskContent.length}`);
                    }
                    registerProposedChange(
                      tabId, filePath, toolUseId, pendingTool.name, backfillInput,
                      diskContent,
                    );
                    console.log(`[opencode-events] backfill registerProposedChange DONE: changesCount=${useChangesStore.getState().changes.length}`);
                  });
                } else {
                  console.log(`[opencode-events] backfill FAILED: no pendingTool found for toolUseId=${toolUseId}`);
                }
              }
            }
          }
          break;
        }

        case "todo.updated": {
          const todoMsg: ChatStreamMessage = {
            type: "assistant",
            message: {
              content: [{
                type: "tool_use",
                name: "todowrite",
                id: `todo-${Date.now()}`,
                input: { todos: data.todos },
              }],
            },
          };
          chatStore._appendMessage(tabId, todoMsg);
          break;
        }

        case "plan.updated": {
          // OpenCode plan event — render as a structured plan widget
          const planMsg: ChatStreamMessage = {
            type: "assistant",
            message: {
              content: [{
                type: "tool_use",
                name: "plan",
                id: `plan-${Date.now()}`,
                input: data,
                title: "Execution Plan",
                kind: "workflow",
              }],
            },
          };
          chatStore._appendMessage(tabId, planMsg);
          break;
        }

        case "session.status": {
          const status = String(data?.status ?? "").toLowerCase();
          if (status === "completed" || status === "idle" || status === "error") {
            // Backup path: if sendPrompt hung (tool blocked), chat:complete never
            // fires and isStreaming stays true — blocking the next user message.
            window.setTimeout(() => {
              const current = useChatStore.getState().tabs.find((t) => t.id === tabId);
              if (!current?.isStreaming) return;
              log.warn("session.status backup — clearing stuck isStreaming", { tabId, status });
              chatStore._setStreaming(tabId, false);
              usePermissionStore.getState().clearTabPermissions(tabId);
              void useCheckpointStore.getState().finalizeTurn(tabId, status !== "error");
            }, 400);
          }
          break;
        }
      }
    });

    // ─── Permission Handler ───
    // Main process is the sole decision point — events here are always "prompt".
    const unsubPermission = window.electronAPI.onChatPermission((permission) => {
      const raw = (permission.raw ?? permission) as Record<string, unknown>;
      const toolName =
        extractPermissionToolName(raw) ||
        (permission.toolName || "").toLowerCase();
      const toolCallId =
        permission.toolCallId ||
        (permission.raw as Record<string, unknown> | undefined)?.toolCallId as string ||
        (permission.raw as Record<string, unknown> | undefined)?.tool_call_id as string ||
        (permission.raw as Record<string, unknown> | undefined)?.callID as string;

      const permissionStore = usePermissionStore.getState();
      if (toolCallId && permissionStore.isToolResolved(permission.tabId, toolCallId)) {
        return;
      }
      if (toolCallId) {
        const existing = permissionStore.getPermissionForTool(permission.tabId, toolCallId);
        if (existing && existing.id !== permission.permissionId) {
          clearPermissionTimer(existing.id);
          permissionStore.clearPermission(existing.id);
        }
      }

      permissionStore.addPermission({
        id: permission.permissionId,
        tabId: permission.tabId,
        toolCallId,
        toolName,
        message: permission.message || "",
        options: Array.isArray(permission.options) ? permission.options : [],
      });
      schedulePermissionTimeout(
        permission.tabId,
        permission.permissionId,
        toolCallId,
        toolName,
      );
    });

    // ─── Chat Complete Handler ───
    const unsubComplete = window.electronAPI.onChatComplete(({ tabId, success, error, tokenUsage, contextBreakdown, categorySchema, promptStale }) => {
      const chatStore = useChatStore.getState();

      if (!success && error) {
        chatStore._setError(tabId, error);
      }

      if (tokenUsage) {
        const totalTokens = (tokenUsage.input_tokens || 0) +
          (tokenUsage.cache_creation_input_tokens || 0) +
          (tokenUsage.cache_read_input_tokens || 0);
        chatStore._setContextTokens(tabId, totalTokens, contextBreakdown ?? null, categorySchema ?? null);
      }

      if (promptStale !== undefined) {
        chatStore._setPromptStale(tabId, promptStale);
      } else {
        void chatStore.checkPromptStale(tabId);
      }

      setTimeout(() => {
        chatStore._setStreaming(tabId, false);
      }, 50);

      if (hasTexChangesRef.current.get(tabId)) {
        const docState = useDocumentStore.getState();
        docState.refreshFiles().then(() => {
          compileCurrentDocument();
        });
      }

      if (aiSessionActiveRef.current.get(tabId)) {
        resumeAutoCompileAfterAi();
      }

      clearTabMaps(tabId);
      usePermissionStore.getState().clearTabPermissions(tabId);
      void useCheckpointStore.getState().finalizeTurn(tabId, success);
    });

    // ─── Session Created Handler ───
    const unsubSessionCreated = window.electronAPI.onChatSessionCreated(({ tabId, sessionId }) => {
      useChatStore.getState()._setSessionId(tabId, sessionId);
      useCheckpointStore.getState().setSessionId(tabId, sessionId);
      aiSessionActiveRef.current.set(tabId, true);
      pauseAutoCompileForAi();
    });

    return () => {
      unsubStream();
      unsubPermission();
      unsubComplete();
      unsubSessionCreated();
    };
  }, []);
}
