import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useChatStore, type ChatStreamMessage, type ContentBlock } from "@/stores/chat-store";
import { displayChatTitle } from "@/lib/i18n/display-chat-title";
import { i18n } from "@/lib/i18n";

import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
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
  isEditAutoApplyMode,
} from "@shared/permission-modes";
import { schedulePermissionTimeout, clearPermissionTimer } from "@/stores/permission-actions";
import { handleBashToolUse, handleBashToolResult, handleBashPermissionDenied, isBashToolName } from "@/lib/terminal/ai-bridge";
import { isFinalToolStatus, normalizeToolStatus } from "@/components/modules/chat/tools/tool-result-map";
import { isDiskMutationTool, isFileWriteTool, isPatchTool, extractPatchTargetPaths } from "@/components/modules/chat/tools/tool-meta";
import { useCheckpointStore, resolveRelativeToolPath } from "@/stores/checkpoint-store";
import { compileCurrentDocument, pauseAutoCompileForAi, resumeAutoCompileAfterAi } from "@/stores/compile-store";
import { createLogger } from "@/services/logger";
import { isPlanFileToolUse } from "@/lib/chat/plan-artifact-ui";
import { parsePlanSteps } from "@/lib/chat/parse-plan-steps";
import { isBackgroundTaskStartedResult } from "@shared/opencode-background-task";
import { isPrismSystemPromptText } from "@/lib/chat/session-message-hydrate";
import { canClearStreamingForGeneration } from "@/lib/chat/stream-generation";
import { refreshGitStatusNow } from "@/lib/git/checkout-context";
import { isChatPreparePhase } from "../../shared/chat-prepare-phases";
import { formatTaskError } from "../../shared/task-error-codes";
import { isOpaqueTaskCancelledResult } from "../../shared/task-deny-message";

const log = createLogger("opencode-events", "agent");

function notifyDesktopForTab(
  kind: "turn_complete" | "action_required",
  tabId: string,
  bodyKey: "shell.notify.replyFinished" | "shell.notify.needsApproval",
): void {
  const tab = useChatStore.getState().tabs.find((t) => t.id === tabId);
  const title = displayChatTitle(tab?.title, (key) => i18n.t(key));
  void window.electronAPI.shellDesktopNotify({
    kind,
    title: title || i18n.t("shell.notify.defaultTitle"),
    body: i18n.t(bodyKey),
    tabId,
  });
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

  function noteCheckpointForDiskTool(
    tabId: string,
    toolName: string,
    toolInput: unknown,
    tracker: Map<string, string>,
  ) {
    if (!isDiskMutationTool(toolName)) return;
    const normalized = toolName.toLowerCase();
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
      const docHas = useDocumentStore.getState().files.some(
        (f) => f.relativePath === resolved.relativePath,
      );
      const created =
        normalized !== "delete"
        && normalized !== "move"
        && before === ""
        && !docHas;
      useCheckpointStore.getState().noteFileMutation(
        tabId,
        resolved.relativePath,
        resolved.absolutePath,
        before,
        { created },
      );
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

    if (!isDiskMutationTool(toolName)) return;

    // Always record for world-rollback checkpoints (not only Auto-apply).
    noteCheckpointForDiskTool(tabId, toolName, toolInput, fileContentTrackerRef.current);

    if (!isEditAutoApplyMode(useSettingsStore.getState().settings.permissionMode)) {
      return;
    }

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
      case "thinking": {
        const thinkingText =
          part.type === "reasoning"
            ? (part.text || "")
            : (part.thinking || part.text || "");
        return {
          type: "thinking",
          thinking: thinkingText,
          ...(typeof part.duration === "number" ? { duration: part.duration } : {}),
          ...(typeof part.timeStart === "number" ? { timeStart: part.timeStart } : {}),
          ...(typeof part.timeEnd === "number" ? { timeEnd: part.timeEnd } : {}),
        };
      }
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

          return {
            type: "tool_use",
            id: part.id || part.toolId || "",
            name: derivedName,
            input: extractedInput,
            title: part.title || part.tool?.title || "",
            kind: part.kind || part.tool?.kind || "",
            status: part.status || part.state?.status || "",
            locations: part.locations || part.tool?.locations || [],
            ...(typeof part.duration === "number" ? { duration: part.duration } : {}),
            ...(typeof part.timeStart === "number" ? { timeStart: part.timeStart } : {}),
            ...(typeof part.timeEnd === "number" ? { timeEnd: part.timeEnd } : {}),
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
            ...(typeof part.duration === "number" ? { duration: part.duration } : {}),
            ...(typeof part.timeStart === "number" ? { timeStart: part.timeStart } : {}),
            ...(typeof part.timeEnd === "number" ? { timeEnd: part.timeEnd } : {}),
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
          ...(typeof part.duration === "number" ? { duration: part.duration } : {}),
          ...(typeof part.timeStart === "number" ? { timeStart: part.timeStart } : {}),
          ...(typeof part.timeEnd === "number" ? { timeEnd: part.timeEnd } : {}),
        };
      default:
        return null;
    }
  }

  useEffect(() => {
    // ─── Chat Stream Handler ───
    const unsubStream = window.electronAPI.onChatStream(({ tabId, type, data }) => {
      const chatStore = useChatStore.getState();

      // Global agent lifecycle events (empty tabId) — affect all streaming tabs
      if (type === "agent.reconnected" || type === "agent.connectionLost") {
        if (type === "agent.connectionLost") {
          const errText =
            (typeof data?.error === "string" && data.error.trim())
            || i18n.t("chat.errors.connectionLost");
          for (const tab of chatStore.tabs) {
            if (!tab.isStreaming) continue;
            chatStore._appendAssistantError(tab.id, errText);
          }
        } else {
          const activeTab = chatStore.tabs.find((t) => t.id === chatStore.activeTabId);
          if (activeTab) {
            chatStore._appendMessage(chatStore.activeTabId, {
              type: "system",
              subtype: "agent.reconnected",
              message: {
                content: [{
                  type: "text",
                  text: "Agent reconnected successfully.",
                }],
              },
            });
          }
        }
        return;
      }

      const tab = chatStore.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      switch (type) {
        case "session.usage": {
          if (data?.cleared) {
            chatStore._setContextTokens(tabId, null, undefined, undefined, { clear: true });
            break;
          }
          const used = typeof data?.used === "number" ? data.used : null;
          const size = typeof data?.size === "number" ? data.size : null;
          if (used == null) break;
          chatStore._setContextTokens(tabId, used, undefined, undefined, {
            windowSize: size,
            source: data?.source === "usage_update" ? "usage_update" : "prompt_usage",
          });
          break;
        }
        case "system.prepare": {
          const phase = data?.phase;
          if (phase == null || phase === "") {
            chatStore._setPreparePhase(tabId, null);
          } else if (isChatPreparePhase(phase)) {
            chatStore._setPreparePhase(tabId, phase);
          }
          break;
        }

        case "system.sessionRecovered": {
          const text =
            typeof data?.message === "string" && data.message.trim()
              ? data.message
              : "Previous OpenCode session was lost. Continued in a new session.";
          chatStore._appendMessage(tabId, {
            type: "system",
            subtype: "system.sessionRecovered",
            message: {
              content: [{ type: "text", text }],
            },
          });
          break;
        }

        case "subAgent.linked": {
          const taskToolUseId = String(data.taskToolUseId || "");
          if (!taskToolUseId) break;
          chatStore._linkSubAgentRun(tabId, taskToolUseId, {
            expertId: String(data.expertId || "general"),
            prompt: String(data.prompt || ""),
            subSessionId: data.subSessionId ? String(data.subSessionId) : undefined,
            mode: data.mode === "background" ? "background" : undefined,
          });
          break;
        }

        case "subAgent.started": {
          const taskToolUseId = String(data.taskToolUseId || "");
          if (!taskToolUseId) break;
          chatStore._startBackgroundSubAgentRun(tabId, taskToolUseId, {
            expertId: String(data.expertId || "general"),
            prompt: String(data.prompt || ""),
            subSessionId: data.subSessionId ? String(data.subSessionId) : undefined,
          });
          break;
        }

        case "subAgent.linkDegraded": {
          const taskToolUseId = String(data.taskToolUseId || "");
          if (!taskToolUseId) break;
          chatStore._markSubAgentLinkDegraded(tabId, taskToolUseId);
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

        case "subAgent.snapshot": {
          const taskToolUseId = String(data.taskToolUseId || "");
          const blocks = Array.isArray(data.blocks) ? data.blocks as ContentBlock[] : null;
          if (!taskToolUseId || !blocks) break;
          chatStore._setSubAgentSnapshot(tabId, taskToolUseId, blocks);
          break;
        }

        case "subAgent.completed": {
          const taskToolUseId = String(data.taskToolUseId || "");
          if (!taskToolUseId) break;
          const status = data.status === "error" ? "error" as const : "done" as const;
          const errorText =
            typeof data.error === "string" && data.error.trim()
              ? data.error.trim()
              : undefined;
          chatStore._completeSubAgentRun(tabId, taskToolUseId, status, errorText);
          // Real Task failures (ACP deny / OpenCode) inject a tool_result body.
          if (status === "error" && errorText) {
            chatStore._injectToolResult(tabId, taskToolUseId, errorText, true);
          }
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
            chatStore._upsertLastMessage(tabId, msg, data.messageId ? String(data.messageId) : undefined);
            if (useChatStore.getState().tabs.find((t) => t.id === tabId)?.preparePhase) {
              chatStore._setPreparePhase(tabId, null);
            }

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
              }
            }

            // Store tool_result blocks and process backfills.
            // Each tool_result becomes a hidden result-type message — picked up
            // by toolResultMap in chat-messages.tsx for Widget matching.
            for (let block of toolResultBlocks) {
              const toolUseId = block.tool_use_id || "";
              // OpenCode emits terminal success as `completed`, `success`, or
              // `finished` (synonyms in the ACP binary). Treat ANY non-active
              // status as final — the prior check only accepted `completed`/
              // `failed` and DROPPED `success`/`finished` results, leaving tools
              // spinning until orphan-synthesized as "No result received".
              const isFinalToolResult = isFinalToolStatus(block.status);
              // Normalize success synonyms → "completed" so downstream widgets
              // (which check `status === "completed"`) match correctly.
              if (isFinalToolResult && block.status) {
                block.status = normalizeToolStatus(block.status);
              }
              if (isFinalToolResult) {
                const toolName = (
                  pendingToolUsesRef.current.get(tabId)?.get(toolUseId)?.name
                  || (block as any)._backfillName
                  || ""
                ).toLowerCase();

                // OpenCode returns opaque {"error":"Task cancelled"} after we
                // reject Task / abort parent — rewrite by subagent kind.
                // Prefer an already-recorded watchdog / Plan-deny error over the
                // generic Plan-mode hint (which misleads when the real cause was
                // task-link-timeout).
                if (
                  toolName === "task"
                  && block.is_error
                  && isOpaqueTaskCancelledResult(block.content)
                ) {
                  const tabNow = useChatStore.getState().tabs.find((t) => t.id === tabId);
                  const priorError = tabNow?.subAgentRuns?.[toolUseId]?.error?.trim();
                  const priorResult = tabNow?.messages
                    .flatMap((m) => m.message?.content ?? [])
                    .find(
                      (b) =>
                        b.type === "tool_result"
                        && b.tool_use_id === toolUseId
                        && typeof b.content === "string"
                        && b.content.trim()
                        && !isOpaqueTaskCancelledResult(b.content),
                    );
                  if (priorResult || priorError) {
                    // Keep the specific error already shown; skip opaque rewrite.
                    continue;
                  }
                  const input = pendingToolUsesRef.current.get(tabId)?.get(toolUseId)?.input as
                    | Record<string, unknown>
                    | undefined;
                  const runExpert = tabNow?.subAgentRuns?.[toolUseId]?.expertId;
                  const subagent =
                    (typeof input?.subagent_type === "string" && input.subagent_type)
                    || (typeof input?.subagentType === "string" && input.subagentType)
                    || (typeof input?.agent === "string" && input.agent)
                    || (runExpert && runExpert !== "expert" ? runExpert : null)
                    || "general";
                  block = {
                    ...block,
                    content: formatTaskError("opencode_cancelled", { subagentId: String(subagent) }),
                  };
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
                  // Background early "started" must not flip the card to done.
                  const bgStarted = isBackgroundTaskStartedResult({
                    rawInput: block._backfillInput,
                    content: block.content,
                  });
                  if (!bgStarted) {
                    chatStore._completeSubAgentRun(tabId, toolUseId, "done");
                  }
                }

                const priorToolResult = useChatStore.getState().tabs
                  .find((t) => t.id === tabId)
                  ?.messages
                  .flatMap((m) => m.message?.content ?? [])
                  .find((b) => b.type === "tool_result" && b.tool_use_id === toolUseId);
                if (priorToolResult) {
                  chatStore._injectToolResult(
                    tabId,
                    toolUseId,
                    typeof block.content === "string" ? block.content : String(block.content ?? ""),
                    !!block.is_error,
                  );
                } else {
                  const resultMsg: ChatStreamMessage = {
                    type: "result",
                    message: { content: [block] },
                  };
                  chatStore._appendMessage(tabId, resultMsg);
                }

                if (typeof block.duration === "number" && Number.isFinite(block.duration)) {
                  chatStore._patchToolDuration(tabId, toolUseId, block.duration, {
                    start: block.timeStart,
                    end: block.timeEnd,
                  });
                }

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

                if (!block.is_error) {
                  const tabTools = pendingToolUsesRef.current.get(tabId);
                  const toolUse = tabTools?.get(toolUseId);
                  if (toolUse) {
                    refreshAfterAutoDiskMutation(tabId, toolUse.name, toolUse.input);
                    const chatTab = useChatStore.getState().tabs.find((t) => t.id === tabId);
                    if (chatTab?.sessionAgent === "plan" && isPlanFileToolUse(toolUse)) {
                      void useChatStore.getState().refreshPlanDraftFromDisk(tabId);
                    }
                  }
                }
              } else {
                // non-final tool_result — wait for terminal status
              }

              // Apply backfill input if present — patches the empty rawInput
              // from the initial tool_call with real parameters.
              const backfillInput = (block as any)._backfillInput;
              const backfillName = (block as any)._backfillName as string | null;
              if (backfillInput && typeof backfillInput === "object" && Object.keys(backfillInput).length > 0) {
                // 1. Patch the tool_use block's input AND name
                chatStore._patchToolInput(tabId, toolUseId, backfillInput, backfillName || undefined);

                // Task: refresh expert id when subagent_type arrives late (empty rawInput).
                if ((backfillName || "").toLowerCase() === "task" || toolUseId) {
                  const sub =
                    (typeof (backfillInput as any).subagent_type === "string" && (backfillInput as any).subagent_type)
                    || (typeof (backfillInput as any).subagentType === "string" && (backfillInput as any).subagentType)
                    || (typeof (backfillInput as any).agent === "string" && (backfillInput as any).agent)
                    || "";
                  if (sub.trim()) {
                    chatStore._linkSubAgentRun(tabId, toolUseId, {
                      expertId: sub.trim().replace(/^@/, "").toLowerCase(),
                      prompt: String(
                        (backfillInput as any).prompt
                        || (backfillInput as any).description
                        || "",
                      ),
                    });
                  }
                }

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

                  const file = docState.files.find(
                    (f) => f.relativePath === relPath || f.absolutePath === filePath,
                  );
                  if (file) {
                    void docState.refreshFileContent(file.id).then(() => {
                      const diskContent = docState.getContent(file.id) || "";
                      if (diskContent && relPath) {
                        fileContentTrackerRef.current.set(relPath, diskContent);
                      }
                    });
                  }
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

        case "plan.suggest": {
          const reason =
            typeof data?.reason === "string" ? data.reason : null;
          const deadlineAt =
            typeof data?.deadlineAt === "number" ? data.deadlineAt : undefined;
          const sessionId =
            typeof data?.sessionId === "string" ? data.sessionId : null;
          useChatStore.getState().showPlanSuggest(tabId, reason, {
            deadlineAt,
            sessionId,
          });
          break;
        }

        case "literature.intensive": {
          const paperId = typeof data?.paperId === "string" ? data.paperId : "";
          const action = typeof data?.action === "string" ? data.action : "add";
          if (!paperId) break;
          if (action === "remove") {
            chatStore.removeIntensivePaper(tabId, paperId);
          } else {
            chatStore.addIntensivePaper(tabId, paperId);
          }
          break;
        }

        case "plan.suggest.resolve": {
          // Main finished tool consent — clear strip; don't double-flush heuristic pending.
          const decision = data?.decision;
          const markDismissed =
            decision === "dismissed" || decision === "timed_out";
          useChatStore.setState((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    planSuggestVisible: false,
                    planSuggestReason: null,
                    planSuggestDeadlineAt: null,
                    planSuggestConsentSessionId: null,
                    ...(markDismissed ? { planSuggestDismissed: true } : {}),
                    ...(decision === "accepted"
                      ? { sessionAgent: "plan" as const }
                      : {}),
                  }
                : t,
            ),
          }));
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

          const steps = parsePlanSteps(data).map((s) => ({
            text: s.text,
            status: s.status,
          }));
          const title =
            data && typeof data === "object" && typeof (data as { title?: unknown }).title === "string"
              ? (data as { title: string }).title
              : null;
          chatStore.setPlanDraftFromEvent(steps, title, tabId);
          // Formal plan lives in current-draft.md (agent write) — do not overwrite with checklist.
          void chatStore.refreshPlanDraftFromDisk(tabId);
          break;
        }

        case "turn.awaitingBackground": {
          chatStore._setAwaitingBackgroundJoin(tabId, true);
          break;
        }

        case "session.error": {
          const detail =
            (typeof data?.message === "string" && data.message.trim())
            || (typeof data?.error === "string" && data.error.trim())
            || "";
          chatStore._appendAssistantError(
            tabId,
            detail || i18n.t("chat.errors.sessionError"),
          );
          break;
        }

        case "session.status": {
          const status = String(data?.status ?? "").toLowerCase();
          if (status === "completed" || status === "idle" || status === "error") {
            const tab = chatStore.tabs.find((t) => t.id === tabId);
            if (tab?.sessionAgent === "plan") {
              void chatStore.refreshPlanDraftFromDisk(tabId);
            }
            // Surface upstream session errors as an assistant bubble (not a banner).
            if (status === "error") {
              const detail =
                (typeof data?.message === "string" && data.message.trim())
                || (typeof data?.error === "string" && data.error.trim())
                || "";
              if (detail) {
                chatStore._appendAssistantError(tabId, detail);
              } else {
                chatStore._appendAssistantError(tabId, i18n.t("chat.errors.sessionError"));
              }
            }
            // Backup path: if sendPrompt hung (tool blocked), chat:complete never
            // fires and isStreaming stays true — blocking the next user message.
            // Do NOT clear while background Tasks are still open: parent end_turn
            // idles early, then OpenCode inject-resumes — clearing here drops that stream.
            // Also ignore if a newer turn started (Stop → queue drain / re-send).
            const generationAtIdle = tab?.streamGeneration ?? 0;
            window.setTimeout(() => {
              const current = useChatStore.getState().tabs.find((t) => t.id === tabId);
              if (!current?.isStreaming) return;
              if (!canClearStreamingForGeneration(generationAtIdle, current.streamGeneration)) {
                return;
              }
              if (current.awaitingBackgroundJoin) return;
              const runs = current.subAgentRuns || {};
              const bgPending = Object.values(runs).some(
                (r) =>
                  r?.mode === "background"
                  && (r.status === "running" || r.status === "stopping"),
              );
              if (bgPending) return;
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
      notifyDesktopForTab(
        "action_required",
        permission.tabId,
        "shell.notify.needsApproval",
      );
    });

    // ─── Chat Complete Handler ───
    const unsubComplete = window.electronAPI.onChatComplete(({ tabId, success, error, errorCode, emptyTurn, tokenUsage, contextUsed, contextWindowSize, contextSource, contextBreakdown, categorySchema, promptStale, planDraftMissing }) => {
      const chatStore = useChatStore.getState();
      const generationAtComplete =
        chatStore.tabs.find((t) => t.id === tabId)?.streamGeneration ?? 0;

      if (!success) {
        if (errorCode === "cancelled") {
          // User-initiated stop — cancelExecution already committed partial reply.
        } else {
          // Prefer OpenCode/provider raw text; i18n only when raw body is empty.
          const raw = typeof error === "string" ? error.trim() : "";
          const display =
            raw
            || (errorCode
              ? i18n.t(`chat.errors.${errorCode}`, { defaultValue: error || "" })
              : "")
            || (emptyTurn ? i18n.t("chat.errors.emptyTurn") : "")
            || i18n.t("chat.errors.sessionError");
          chatStore._appendAssistantError(tabId, display);
        }
      } else if (emptyTurn) {
        // Legacy success+emptyTurn path (older main process).
        chatStore._appendAssistantError(tabId, i18n.t("chat.errors.emptyTurn"));
      } else {
        notifyDesktopForTab("turn_complete", tabId, "shell.notify.replyFinished");
      }

      if (success && planDraftMissing) {
        toast.message(i18n.t("chat.planWorkflow.draftMissingRedirect"));
      }

      // Prefer explicit OpenCode ring fields; do not overwrite a fresher usage_update
      // with a weaker prompt-only sum when used is missing.
      const ctxTab = chatStore.tabs.find((t) => t.id === tabId);
      const alreadyOpenCode = ctxTab?.contextUsageSource === "usage_update";
      const used =
        typeof contextUsed === "number"
          ? contextUsed
          : tokenUsage
            ? (tokenUsage.total_tokens
              || ((tokenUsage.input_tokens || 0)
                + (tokenUsage.cache_creation_input_tokens || 0)
                + (tokenUsage.cache_read_input_tokens || 0))
              || null)
            : null;
      if (used != null && !(alreadyOpenCode && contextSource !== "usage_update")) {
        chatStore._setContextTokens(
          tabId,
          used,
          contextBreakdown ?? undefined,
          categorySchema ?? undefined,
          {
            windowSize: typeof contextWindowSize === "number" ? contextWindowSize : undefined,
            source: contextSource ?? (tokenUsage ? "prompt_usage" : null),
          },
        );
      } else if (contextBreakdown || categorySchema) {
        chatStore._setContextTokens(
          tabId,
          ctxTab?.contextTokens ?? null,
          contextBreakdown ?? undefined,
          categorySchema ?? undefined,
        );
      }

      if (promptStale !== undefined) {
        chatStore._setPromptStale(tabId, promptStale);
      } else {
        void chatStore.checkPromptStale(tabId);
      }

      // cancelExecution already cleared isStreaming; a delayed clear races Stop→queue drain.
      // Any complete must also ignore a newer streamGeneration (re-send after cancel).
      if (errorCode !== "cancelled") {
        setTimeout(() => {
          const current = useChatStore.getState().tabs.find((t) => t.id === tabId);
          if (!current) return;
          if (!canClearStreamingForGeneration(generationAtComplete, current.streamGeneration)) {
            return;
          }
          useChatStore.getState()._setStreaming(tabId, false);
        }, 50);
      }

      const tab = chatStore.tabs.find((t) => t.id === tabId);
      if (tab?.sessionAgent === "plan") {
        void chatStore.refreshPlanDraftFromDisk(tabId);
      }

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
