import type { BrowserWindow } from "electron";
import { AcpService } from "./service";
import { createLogger } from "../services/logger";
import { registerChatSession, unregisterChatSession, resolveChatTabId, getSessionProjectRoot } from "../services/chat-session-registry";
import {
  inferToolNameFromInput,
  inferToolNameFromOutput,
  resolveLiteratureToolTitle,
  resolvePrismToolTitle,
} from "./tool-name-infer";
import {
  buildTaskDelegationStagingPreface,
  enrichTaskToolResultContent,
  syncEnrichedTaskToolResultToOpenCode,
} from "../services/session-citations-context";
import { buildTaskDelegationCiteAuditPreface } from "../services/session-cite-audit-context";
import {
  normalizeTaskSubagentId,
  shouldDenyOrchestratorBuiltinTask,
} from "../services/task-orchestrator-gate";

const log = createLogger("event-mapper", "agent");

/**
 * Routes OpenCode ACP JSON-RPC notifications to Electron IPC channels.
 *
 * Registered on AcpService.onNotification. Maintains bidirectional
 * sessionId ↔ tabId mapping so streaming events for different chat tabs
 * are routed to the correct renderer, and stale mappings are cleaned up
 * automatically when a tab creates a new session.
 */
export class EventMapper {
  private win: BrowserWindow;
  private sessionToTab = new Map<string, string>();
  private tabToSession = new Map<string, string>();
  private unregisterNotification: (() => void) | null = null;
  /** Parent tab → queued Task tool invocations awaiting a subagent session link. */
  private pendingTasksByTab = new Map<
    string,
    Array<{ toolUseId: string; expertId: string; prompt: string }>
  >();
  /** Subagent OpenCode session → parent Task tool_use id. */
  private subSessionToTaskTool = new Map<string, string>();
  /** Task tool_use id → link watchdog timer. Prevents the parent turn from
   *  hanging forever when a subagent session never links back to a chat tab
   *  (e.g. OpenCode didn't write parent_id, or the child session/update
   *  notifications arrive before the SQLite session row commits). On fire,
   *  emits a visible error to the renderer so the user isn't left staring at a
   *  "Waiting for expert session…" spinner. */
  private taskLinkTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  /** Grace period for a subagent session to link back to its parent tab.
   *  Generous because OpenCode may take time to spawn the child and commit its
   *  session row; the watchdog only fires when linking genuinely fails. */
  private static readonly TASK_LINK_TIMEOUT_MS = 90_000;

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  registerSession(sessionId: string, tabId: string): void {
    registerChatSession(sessionId, tabId);
    const prevSession = this.tabToSession.get(tabId);
    const prevTab = this.sessionToTab.get(sessionId);
    const unchanged = prevSession === sessionId && prevTab === tabId;
    // Clean up any previous session mapping for this tab (prevents stale routing)
    if (prevSession && prevSession !== sessionId) {
      this.sessionToTab.delete(prevSession);
    }
    // If this session was wrongly mapped to another tab, clear that back-reference.
    if (prevTab && prevTab !== tabId) {
      if (this.tabToSession.get(prevTab) === sessionId) {
        this.tabToSession.delete(prevTab);
      }
    }
    this.sessionToTab.set(sessionId, tabId);
    this.tabToSession.set(tabId, sessionId);
    if (!unchanged) {
      this.accumText.clear();
      this.accumThinking.clear();
    }
  }

  unregisterSession(sessionId: string): void {
    unregisterChatSession(sessionId);
    const tabId = this.sessionToTab.get(sessionId);
    if (tabId) this.tabToSession.delete(tabId);
    this.sessionToTab.delete(sessionId);
  }

  start(): void {
    if (this.unregisterNotification) return;

    const service = AcpService.getInstance();
    this.unregisterNotification = service.onNotification((method, params) => {
      this.handleNotification(method, params);
    });

    log.info("EventMapper started — listening for ACP notifications");
  }

  stop(): void {
    if (this.unregisterNotification) {
      this.unregisterNotification();
      this.unregisterNotification = null;
    }
    // Release all session ↔ tab mappings to prevent leaks
    this.sessionToTab.clear();
    this.tabToSession.clear();
    this.accumText.clear();
    this.accumThinking.clear();
  }

  /** Clear per-turn text/thinking accumulators before a new user prompt. */
  clearTurnAccumulators(): void {
    this.accumText.clear();
    this.accumThinking.clear();
  }

  // ─── Internal ──────────────────────────────────────────────

  private handleNotification(method: string, params: any): void {
    // Global agent lifecycle events — no session/tab mapping needed
    if (method === "agent/reconnected") {
      this.win.webContents.send("chat:stream", {
        tabId: "",
        type: "agent.reconnected",
        data: {},
      });
      return;
    }
    if (method === "agent/connectionLost") {
      this.win.webContents.send("chat:stream", {
        tabId: "",
        type: "agent.connectionLost",
        data: params,
      });
      return;
    }

    const sessionId = this.extractSessionId(method, params);
    const tabId = method === "session/permission"
      ? this.resolveTabForPermission(sessionId, params)
      : this.resolveTabForSession(sessionId, params);
    if (!tabId) {
      if (method === "session/permission") {
        log.warn("permission:dropped — no chat tab mapping", {
          sessionId,
          permissionId: params?.id || params?.permissionId,
          toolCallId: params?.toolCallId || params?.tool_call_id,
          toolName: params?.toolName || params?.tool_name,
        });
      } else if (sessionId && method === "session/update") {
        // A subagent session/update that couldn't be mapped to a parent tab —
        // its activity (text/thinking/tool_use) is silently dropped from the
        // UI. This is the symptom of the "Task hangs invisibly" bug: OpenCode
        // spawned the expert, but we can't tell which chat tab owns it. Log
        // loudly so it's diagnosable.
        const pendingTabs = Array.from(this.pendingTasksByTab.keys());
        log.warn(`session/update dropped — no chat tab mapping`, {
          sessionId,
          method,
          pendingTaskTabs: pendingTabs,
          hasParentId: !!AcpService.getInstance().getSessionParentId(sessionId),
        });
      }
      return;
    }

    // ── Suppress historical replay during session/load ───────────
    // When OpenCode re-hydrates a session after restart (ensureSessionHydrated
    // → session/load), it replays ALL stored session/update notifications
    // (tool_call, tool_call_update, agent_message_chunk, agent_thought_chunk,
    // session/status, session/todo, session/plan). The renderer already has
    // the full history from the SQLite session:load read — forwarding these
    // replayed events as live chat:stream would re-render every historical
    // tool call and reply under the user's new message.
    // session/permission is already guarded inside the requestPermission
    // callback (returns early when sessionReplaySuppress > 0), so it never
    // emits during replay and is intentionally NOT suppressed here.
    if (
      method !== "session/permission"
      && AcpService.getInstance().isSessionReplaySuppressed()
    ) {
      log.debug(`replay-suppressed: ${method} tabId=${tabId} sessionId=${sessionId ?? "(none)"}`);
      return;
    }

    switch (method) {
      case "session/update":
        this.mapSessionUpdate(tabId, sessionId!, params);
        break;

      case "session/status":
        this.mapSessionStatus(tabId, sessionId!, params);
        break;

      case "session/todo":
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "todo.updated",
          data: params,
        });
        break;

      case "session/permission":
        this.win.webContents.send("chat:permission", {
          tabId,
          permissionId: params.id || params.permissionId,
          message: params.message || params.title || params.toolCall?.title || "",
          options: params.options || {},
          toolCallId: params.toolCallId || params.tool_call_id || params.callID ||
            params.toolCall?.toolCallId || params.toolCall?.tool_call_id || params.toolCall?.callID || params.toolCall?.id,
          toolName: params.toolName || params.tool_name || params.tool ||
            params.toolCall?.toolName || params.toolCall?.tool_name || params.toolCall?.tool,
          raw: params,
        });
        break;

      case "session/plan":
        // OpenCode plan event — the agent's execution plan with steps
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "plan.updated",
          data: params,
        });
        break;

      default:
        // Unknown notification — skip
        break;
    }
  }

  private extractSessionId(method: string, params: any): string | undefined {
    // Standard ACP: sessionId is in params
    if (params?.sessionId) return params.sessionId;
    if (params?.session?.id) return params.session.id;
    if (params?.info?.id) return params.info.id;
    return undefined;
  }

  /** Permission callbacks may omit sessionId — fall back to hinted tabId or sole active tab. */
  private resolveTabForPermission(sessionId: string | undefined, params?: any): string | undefined {
    if (typeof params?.tabId === "string" && params.tabId) {
      return params.tabId;
    }
    const fromSession = this.resolveTabForSession(sessionId, params);
    if (fromSession) return fromSession;
    return undefined;
  }

  /**
   * Resolve renderer tab for an OpenCode session, including sub-agent sessions
   * spawned by the task tool (inherit parent tab mapping).
   */
  private resolveTabForSession(sessionId: string | undefined, params?: any): string | undefined {
    if (!sessionId) return undefined;

    const cached = this.sessionToTab.get(sessionId);
    if (cached) return cached;

    const fromRegistry = resolveChatTabId(sessionId);
    if (fromRegistry) {
      this.sessionToTab.set(sessionId, fromRegistry);
      return fromRegistry;
    }

    const parentId =
      params?.parentSessionId
      ?? params?.parent_session_id
      ?? params?.session?.parentId
      ?? params?.session?.parentSessionId
      ?? AcpService.getInstance().getSessionParentId(sessionId)
      ?? undefined;
    if (typeof parentId === "string" && parentId) {
      const parentTab = this.resolveTabForSession(parentId, params);
      if (parentTab) {
        if (!this.subSessionToTaskTool.has(sessionId)) {
          this.linkSubAgentSession(parentTab, sessionId);
        }
        if (!this.sessionToTab.has(sessionId)) {
          registerChatSession(
            sessionId,
            parentTab,
            getSessionProjectRoot(parentId),
          );
          this.sessionToTab.set(sessionId, parentTab);
          AcpService.getInstance().markSubAgentSession(sessionId);
        }
        return parentTab;
      }
    }

    // Sub-agent sessions inherit parent tab via parentSessionId above.
    // Do NOT fall back to the sole registered tab — that misroutes other sessions.

    // Last-resort heuristic: if we still can't resolve the tab AND there is
    // exactly ONE chat tab with a pending Task (i.e. an expert subagent was
    // just dispatched and hasn't linked yet), attribute this unmapped session
    // to that tab. This recovers the common failure mode where OpenCode didn't
    // write parent_id (or the row isn't committed yet) so the child session's
    // activity would otherwise be silently dropped — the "Task hangs invisibly"
    // bug. Safe because top-level chat sessions are registered before they
    // emit, so an unmapped session here is almost certainly a subagent.
    const pendingTabs = Array.from(this.pendingTasksByTab.keys());
    if (pendingTabs.length === 1) {
      const soleTab = pendingTabs[0];
      log.info(
        `resolveTabForSession: heuristic — attributing unmapped session ${sessionId} ` +
          `to sole pending-task tab ${soleTab}`,
      );
      if (!this.subSessionToTaskTool.has(sessionId)) {
        this.linkSubAgentSession(soleTab, sessionId);
      }
      if (!this.sessionToTab.has(sessionId)) {
        const parentSessionId = this.tabToSession.get(soleTab);
        registerChatSession(
          sessionId,
          soleTab,
          parentSessionId ? getSessionProjectRoot(parentSessionId) : undefined,
        );
        this.sessionToTab.set(sessionId, soleTab);
        AcpService.getInstance().markSubAgentSession(sessionId);
      }
      return soleTab;
    }

    return undefined;
  }

  // Accumulate text/thinking per messageId — OpenCode sends per-word deltas.
  // Capped at MAX_ACCUM_ENTRIES to prevent unbounded growth across many
  // prompt turns within a single session.
  private static readonly MAX_ACCUM_ENTRIES = 200;
  private accumText = new Map<string, string>();
  private accumThinking = new Map<string, string>();
  /** Track which session/update shapes we have already logged to avoid spam. */
  private _seenShapes = new Set<string>();
  private _missedShapes = new Set<string>();
  private _seenToolCallShapes = new Set<string>();

  /** Prune oldest entries if a Map exceeds the cap. */
  private pruneAccum(map: Map<string, string>): void {
    while (map.size > EventMapper.MAX_ACCUM_ENTRIES) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
  }

  // ACP ToolKind → OpenCode tool name mapping.  The ACP spec defines `kind`
  // as an enum (read/edit/delete/move/search/execute/think/fetch/switch_mode/other).
  // We map each to its corresponding OpenCode built-in tool for Widget routing.
  // "other" defaults to "task" as the most common case; backfill corrects
  // the name for todowrite, question, skill etc. when real input arrives.
  //
  // IMPORTANT: OpenCode dispatches the Task tool (subagent delegation) with
  // `kind: "think"` and `title: "task"` — NOT `kind: "other"`. Without an
  // explicit Task check, such calls fall through to KIND_TO_TOOL["think"]=
  // "todowrite" and are never recognized as Task delegations, so the subagent
  // is neither tracked nor rendered (the "Task hangs invisibly" bug). The
  // `title === "task"` signal is authoritative for Task dispatch.
  private static readonly KIND_TO_TOOL: Record<string, string> = {
    read:        "read",
    edit:        "edit",
    delete:      "delete",
    move:        "move",
    search:      "grep",
    execute:     "bash",
    think:       "todowrite",
    fetch:       "webfetch",
    switch_mode: "mode_change",
    other:       "task",
  };

  private trackTaskToolUse(tabId: string, toolUseId: string, toolInput: any): void {
    if (!toolUseId) return;
    // On the live tool_call event, OpenCode sends Task dispatches with
    // kind:"think" and an EMPTY rawInput — the subagent_type is only visible to
    // the permission layer (which already allowed it). Without an input we
    // cannot know the expert id yet, so we track with a placeholder and let the
    // gate deny only when we CAN see the type AND it's a built-in. This avoids
    // wrongly denying a Task whose expert id is simply not yet visible.
    const explicitSubagent =
      toolInput?.subagent_type || toolInput?.subagentType || toolInput?.agent;
    const expertId =
      normalizeTaskSubagentId(explicitSubagent) || "expert";
    const inputIsEmpty = !toolInput
      || (typeof toolInput === "object" && Object.keys(toolInput).length === 0);
    if (!inputIsEmpty && shouldDenyOrchestratorBuiltinTask(expertId)) {
      log.warn(`task-orchestrator-gate: skip Task @${expertId} tab=${tabId} toolUse=${toolUseId}`);
      return;
    }
    const rawPrompt = String(toolInput?.prompt || toolInput?.description || "");
    const parentSessionId = this.tabToSession.get(tabId);
    const prefaceParts: string[] = [];
    if (parentSessionId) {
      const stagingPreface = buildTaskDelegationStagingPreface(parentSessionId);
      if (stagingPreface) prefaceParts.push(stagingPreface);
      const citeAuditPreface = buildTaskDelegationCiteAuditPreface(parentSessionId);
      if (citeAuditPreface) prefaceParts.push(citeAuditPreface);
    }
    const stagingPreface = prefaceParts.join("\n");
    const prompt = stagingPreface ? `${stagingPreface}${rawPrompt}` : rawPrompt;
    const queue = this.pendingTasksByTab.get(tabId) ?? [];
    queue.push({ toolUseId, expertId, prompt });
    this.pendingTasksByTab.set(tabId, queue);
    this.startTaskLinkWatchdog(tabId, toolUseId, expertId);
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.linked",
      data: { taskToolUseId: toolUseId, expertId, prompt, rawPrompt, hasStagingPreface: !!stagingPreface },
    });
  }

  private emitOrchestratorBuiltinTaskDenied(
    tabId: string,
    msgId: string,
    toolId: string,
    toolInput: Record<string, unknown>,
    subagentId: string,
  ): void {
    const message =
      `Task delegation to @${subagentId} is disabled on the orchestrator. ` +
      "Call platform tools directly in this conversation (e.g. citation-health, literature-search).";
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "message.part.updated",
      data: {
        messageId: msgId,
        part: {
          type: "tool",
          id: toolId,
          name: "task",
          input: toolInput,
          status: "failed",
        },
      },
    });
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "tool_result",
      data: {
        messageId: msgId,
        tool_use_id: toolId,
        content: message,
        is_error: true,
      },
    });
  }

  private linkSubAgentSession(parentTabId: string, subSessionId: string): void {
    const queue = this.pendingTasksByTab.get(parentTabId);
    if (!queue?.length) return;
    const pending = queue.shift()!;
    if (queue.length === 0) this.pendingTasksByTab.delete(parentTabId);
    else this.pendingTasksByTab.set(parentTabId, queue);
    // Linked successfully — the subagent is now running and will complete on
    // its own. Clear the link watchdog so it doesn't fire a false timeout.
    this.clearTaskLinkWatchdog(pending.toolUseId);
    this.subSessionToTaskTool.set(subSessionId, pending.toolUseId);
    this.sessionToTab.set(subSessionId, parentTabId);
    const parentSessionId = this.tabToSession.get(parentTabId);
    registerChatSession(
      subSessionId,
      parentTabId,
      parentSessionId ? getSessionProjectRoot(parentSessionId) : undefined,
    );
    AcpService.getInstance().markSubAgentSession(subSessionId);
    this.win.webContents.send("chat:stream", {
      tabId: parentTabId,
      type: "subAgent.linked",
      data: {
        taskToolUseId: pending.toolUseId,
        expertId: pending.expertId,
        prompt: pending.prompt,
        subSessionId,
      },
    });
  }

  /** Link sub-session to pending Task when parent_id is known but link not yet established. */
  private ensureSubAgentTaskLink(tabId: string, subSessionId: string): string | undefined {
    const existing = this.subSessionToTaskTool.get(subSessionId);
    if (existing) return existing;
    const parentSessionId = AcpService.getInstance().getSessionParentId(subSessionId);
    if (!parentSessionId) return undefined;
    const parentTab = this.resolveTabForSession(parentSessionId);
    if (parentTab !== tabId) return undefined;
    if (!this.pendingTasksByTab.get(tabId)?.length) return undefined;
    this.linkSubAgentSession(tabId, subSessionId);
    return this.subSessionToTaskTool.get(subSessionId);
  }

  private emitSubAgentActivity(
    tabId: string,
    sessionId: string,
    block: Record<string, unknown>,
  ): void {
    const taskToolUseId =
      this.subSessionToTaskTool.get(sessionId)
      ?? this.ensureSubAgentTaskLink(tabId, sessionId);
    if (!taskToolUseId) return;
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.activity",
      data: { taskToolUseId, block },
    });
  }

  private completeSubAgentTask(tabId: string, taskToolUseId: string, isError: boolean): void {
    // The subagent finished (success or error) — no need for the link watchdog.
    this.clearTaskLinkWatchdog(taskToolUseId);
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.completed",
      data: { taskToolUseId, status: isError ? "error" : "done" },
    });
  }

  /** Start (or restart) the link watchdog for a Task tool_use. */
  private startTaskLinkWatchdog(tabId: string, toolUseId: string, expertId: string): void {
    this.clearTaskLinkWatchdog(toolUseId);
    const timer = setTimeout(() => {
      this.taskLinkTimeouts.delete(toolUseId);
      this.handleTaskLinkTimeout(tabId, toolUseId, expertId);
    }, EventMapper.TASK_LINK_TIMEOUT_MS);
    timer.unref?.();
    this.taskLinkTimeouts.set(toolUseId, timer);
  }

  /** Clear the link watchdog (subagent linked or task completed). */
  private clearTaskLinkWatchdog(toolUseId: string): void {
    const timer = this.taskLinkTimeouts.get(toolUseId);
    if (timer) {
      clearTimeout(timer);
      this.taskLinkTimeouts.delete(toolUseId);
    }
  }

  /** Watchdog fired: the subagent session never linked back to a chat tab. Emit
   *  a visible error so the Task widget stops spinning and the user knows to
   *  cancel/retry. This updates the RENDERER only — it does not unblock OpenCode
   *  (the parent orchestrator may still be waiting for the Task result). The
   *  user can click Stop to abort the turn. */
  private handleTaskLinkTimeout(tabId: string, toolUseId: string, expertId: string): void {
    const queue = this.pendingTasksByTab.get(tabId);
    if (!queue) return; // already linked/completed
    const idx = queue.findIndex((t) => t.toolUseId === toolUseId);
    if (idx === -1) return; // already linked/completed
    queue.splice(idx, 1);
    if (queue.length === 0) this.pendingTasksByTab.delete(tabId);
    else this.pendingTasksByTab.set(tabId, queue);

    const secs = EventMapper.TASK_LINK_TIMEOUT_MS / 1000;
    log.warn(
      `task-link-timeout: expert=@${expertId} toolUse=${toolUseId} tab=${tabId} ` +
        `— subagent session did not link within ${secs}s`,
    );
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.completed",
      data: {
        taskToolUseId: toolUseId,
        status: "error",
        error: `Expert @${expertId} did not start within ${secs}s — its session could not be linked to this chat. The parent turn may be stuck; click Stop to cancel and retry, or run the task inline with platform tools.`,
      },
    });
  }

  private mapSessionUpdate(tabId: string, sessionId: string, params: any): void {
    // The ACP SDK's sessionUpdate callback delivers a JSON-RPC notification's
    // `params` field.  The exact shape depends on the SDK version:
    //
    //   Shape A (wrapped):  { sessionId, update: { sessionUpdate, content, tool_call, ... } }
    //   Shape B (flattened): { sessionId, sessionUpdate, content, tool_call, ... }
    //
    // We normalise both here: `update` = the inner bag of fields.
    const update: any = params.update || params;
    const content = update.content;
    const chunkType = update.sessionUpdate;
    const msgId = update.messageId;

    // Debug: log every session/update shape ONCE per new shape to aid diagnosis.
    // Uses a simple fingerprint so we don't flood logs on every chunk.
    const shapeKeys = Object.keys(update).sort().join(",");
    if (!this._seenShapes.has(shapeKeys)) {
      this._seenShapes.add(shapeKeys);
      log.info(`session/update shape: { ${shapeKeys} } sessionUpdate=${chunkType} — sample: ${JSON.stringify(update).slice(0, 300)}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. Tool call (new tool invocation)
    // ═══════════════════════════════════════════════════════════════
    // OpenCode can deliver tool calls via several paths:
    //   a) { sessionUpdate: "tool_call", tool_call: { tool_call_id, title, kind, tool_name, raw_input } }
    //   b) { tool_call: { ... } }   (flattened, no sessionUpdate marker)
    //   c) { content: { type: "tool", ... } }   (legacy format)
    const tc =
      update.tool_call ||          // ACP standard
      update.toolCall ||           // camelCase variant
      (chunkType === "tool_call" ? update : null);

    if (tc) {
      // ── Tool name ───────────────────────────────────────────
      // ACP has NO `tool_name` field.  Tools are identified by `kind`
      // (a ToolKind enum) plus the shape of `rawInput`.
      const fromKind: string = typeof tc.kind === "string"
        ? (EventMapper.KIND_TO_TOOL[tc.kind] || tc.kind)
        : "";

      const fromInput = inferToolNameFromInput(
        tc.rawInput || tc.raw_input || tc.state?.input || tc.input,
      );

      // Explicit name fields (if any ACP extension populates them), then
      // kind mapping, then input-shape inference, then kind raw as fallback.
      let toolName =
        tc.tool_name || tc.toolName || tc.name ||
        (typeof tc.tool === "string" ? tc.tool : "") ||
        "";

      const titleLower = (tc.title || tc.state?.title || "").toLowerCase();
      // Task tool dispatch (subagent delegation): OpenCode sends these with
      // `title: "task"` (often kind: "think", input empty on the tool_call
      // event). `title === "task"` is the authoritative signal — recognize it
      // BEFORE the kind fallback so it isn't mislabeled as "todowrite".
      const isTaskTitle = titleLower === "task";
      if (!toolName && isTaskTitle) {
        toolName = "task";
      }
      if (!toolName) {
        const prismTitle = resolvePrismToolTitle(titleLower);
        if (prismTitle) toolName = prismTitle;
      }

      if (!toolName) {
        // kind "other" is the default for custom Prism tools (citation-health,
        // etc.) AND real task calls. Real task calls carry prompt+subagent_type
        // in input, caught by fromInput above. For other "other" calls, prefer
        // the raw title over KIND_TO_TOOL["other"]="task" — defaulting to
        // "task" mislabels custom tools as task@general during live streaming
        // (the persisted JSONL keeps the real name, so the bug only shows live
        // and disappears on reload/project-switch).
        if (fromInput) {
          toolName = fromInput;
        } else if (tc.kind === "other") {
          const rawTitle = (tc.title || tc.state?.title || "").trim().toLowerCase();
          toolName = rawTitle || "other";
        } else {
          toolName = fromKind || (typeof tc.kind === "string" ? tc.kind : "") || "";
        }
      }

      // ── Tool ID ──────────────────────────────────────────────
      // ACP uses camelCase: toolCallId.  Also try callID (SQLite) + id (legacy).
      const toolId =
        tc.toolCallId || tc.tool_call_id || tc.callID || tc.id || "";

      // ── Tool input ───────────────────────────────────────────
      // ACP uses camelCase: rawInput.  This is the only field the spec
      // guarantees for tool parameters during live streaming.
      let toolInput: any =
        tc.rawInput || tc.raw_input ||
        tc.state?.input ||
        tc.input ||
        null;

      // Last resort: scan tc for any sub-object that looks like params.
      if (!toolInput || (typeof toolInput === "object" && Object.keys(toolInput).length === 0)) {
        for (const k of Object.keys(tc)) {
          const v = tc[k];
          if (v && typeof v === "object" && !Array.isArray(v) &&
              k !== "state" && k !== "locations" && k !== "content" &&
              k !== "time" && k !== "metadata" &&
              k !== "title" && k !== "kind" && k !== "status" &&
              k !== "sessionUpdate" && k !== "toolCallId" && k !== "_meta") {
            const vKeys = Object.keys(v);
            if (vKeys.length > 0 && vKeys.some(vk => typeof v[vk] !== "object")) {
              toolInput = v;
              break;
            }
          }
        }
      }

      // Fallback: if rawInput is missing/empty, use `title` to carry at
      // least some human-readable context to the Widget.  The Widget can
      // display the title when it has no structured parameters.
      if (!toolInput || (typeof toolInput === "object" && Object.keys(toolInput).length === 0)) {
        const fallbackTitle = tc.title || tc.state?.title || "";
        toolInput = fallbackTitle
          ? { _title: fallbackTitle }
          : {};
      }

      // One-shot debug: log all keys on tc so we can see what OpenCode
      // actually sends during live streaming.
      const tcKeys = Object.keys(tc).sort().join(",");
      if (!this._seenToolCallShapes.has(tcKeys)) {
        this._seenToolCallShapes.add(tcKeys);
        const sample: any = {};
        for (const k of Object.keys(tc).slice(0, 10)) {
          const v = tc[k];
          sample[k] = typeof v === "object"
            ? (Array.isArray(v) ? `[array(${v.length})]` : `{${Object.keys(v).join(",")}}`)
            : String(v).slice(0, 80);
        }
        log.info(`tool_call live shape: keys={ ${tcKeys} } inputSource=${toolInput && Object.keys(toolInput).length > 0 ? JSON.stringify(Object.keys(toolInput)) : "EMPTY"} sample=${JSON.stringify(sample)}`);
      }

      // Detailed debug: log what we're sending to the renderer so we can
      // compare with what the renderer actually receives.
      log.debug(`tool_call IPC: name="${toolName}" id=${toolId} inputKeys=${JSON.stringify(Object.keys(toolInput))} title="${(tc.title || "").slice(0, 60)}" kind=${tc.kind} status=${tc.status || tc.state?.status}`);
      if (toolName === "task" || tc.kind === "other") {
        log.info(`[TASK-TOOL] tool_call detected: name="${toolName}" kind=${tc.kind} title="${(tc.title || "").slice(0, 100)}" inputKeys=${JSON.stringify(Object.keys(toolInput))} hasRawInput=${!!tc.rawInput} hasStateInput=${!!tc.state?.input}`);
      }

      const isBash =
        toolName === "bash"
        || toolName === "shell"
        || toolName === "terminal"
        || toolName === "execute"
        || tc.kind === "execute";
      if (isBash && toolId) {
        const command =
          (typeof toolInput?.command === "string" ? toolInput.command : "")
          || (typeof toolInput?._title === "string" ? toolInput._title : "")
          || (typeof tc.title === "string" ? tc.title : "");
        const cwd =
          (typeof toolInput?.workdir === "string" ? toolInput.workdir : undefined)
          || (typeof toolInput?.cwd === "string" ? toolInput.cwd : undefined);
        AcpService.getInstance().syncBashPermissionFromToolCall({
          sessionId,
          tabId,
          toolCallId: toolId,
          command,
          cwd,
        });
      }

      if ((toolName === "delete" || toolName === "move") && toolId) {
        AcpService.getInstance().syncCustomToolPermissionFromToolCall({
          sessionId,
          tabId,
          toolCallId: toolId,
          toolName,
          input: toolInput,
        });
      }

      // Extract file locations so the renderer can capture old content
      // BEFORE OpenCode modifies files.  Critical for Accept/Reject diff.
      const locations: Array<{ file: string; line?: number }> =
        (tc.locations || []).map((loc: any) => ({
          file: loc.path || loc.file || loc.uri || "",
          line: loc.line || loc.startLine,
        }));

      if (AcpService.getInstance().isSubAgentSession(sessionId)) {
        this.emitSubAgentActivity(tabId, sessionId, {
          type: "tool_use",
          id: toolId,
          name: toolName,
          input: toolInput,
          title: tc.title || tc.state?.title || "",
          status: tc.status || tc.state?.status || "pending",
        });
        return;
      }

      const normalizedToolName = toolName.toLowerCase();
      // A Task dispatch is recognized by toolName "task" (set when title==="task"
      // above) OR kind "other" + subagent_type in input. The title-based path is
      // essential because OpenCode sends Task calls with kind:"think" and an
      // EMPTY rawInput on the tool_call event (the subagent_type is only visible
      // to the permission layer), so the input-shape check below would miss it.
      const looksLikeTask =
        normalizedToolName === "task"
        || isTaskTitle
        || (
          tc.kind === "other"
          && (
            toolInput?.subagent_type
            || toolInput?.subagentType
            || toolInput?.agent
          )
        );
      if (toolId && looksLikeTask) {
        // subagent_type may be absent on the tool_call event (kind:"think",
        // empty input). Defer identification: track the Task with a placeholder,
        // and resolve the real expert id when the subagent session links or its
        // tool_call_update (<task id="ses_..." state="completed">) arrives.
        const explicitSubagent =
          toolInput?.subagent_type || toolInput?.subagentType || toolInput?.agent;
        const subagentId = normalizeTaskSubagentId(explicitSubagent) || "expert";
        const inputIsEmpty = !toolInput
          || (typeof toolInput === "object" && Object.keys(toolInput).length === 0);
        // Only enforce the built-in deny gate when we can actually see the
        // subagent type. An empty input means the type isn't on this event
        // (the permission layer already vetted it) — don't false-deny.
        if (!inputIsEmpty && shouldDenyOrchestratorBuiltinTask(subagentId)) {
          log.warn(
            `task-orchestrator-gate: blocked Task @${subagentId} tab=${tabId} toolUse=${toolId}`,
          );
          this.emitOrchestratorBuiltinTaskDenied(
            tabId,
            msgId,
            toolId,
            toolInput,
            subagentId,
          );
          return;
        }
        this.trackTaskToolUse(tabId, toolId, toolInput);
      }

      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.part.updated",
        data: {
          messageId: msgId,
          part: {
            type: "tool",
            id: toolId,
            name: toolName,
            input: toolInput,
            title: tc.title || tc.state?.title || "",
            kind: tc.kind || "",
            status: tc.status || tc.state?.status || "pending",
            locations,
            _debug: {
              hasRawInput: !!(tc.rawInput || tc.raw_input),
              hasStateInput: !!(tc.state?.input),
              inputSource: toolInput && Object.keys(toolInput).length > 0
                ? Object.keys(toolInput).join(",")
                : "EMPTY",
            },
          },
        },
      });
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. Tool result (tool execution completed / updated)
    // ═══════════════════════════════════════════════════════════════
    const tu =
      update.tool_call_update ||   // ACP standard
      update.toolCallUpdate ||     // camelCase variant
      (chunkType === "tool_call_update" ? update : null);

    if (tu) {
      // Quick sanity log — if this never appears, the `tu` detection is broken
      console.log(`[event-mapper] tool_call_update HIT: sessionUpdate=${chunkType} hasToolCallUpdate=${!!update.tool_call_update} hasToolCallUpdateCamel=${!!update.toolCallUpdate}`);
      const updateId = tu.toolCallId || tu.tool_call_id || tu.callID || tu.id || "";
      // DIAG: capture the full status/title/kind of the tool_call_update so we can
      // see exactly what OpenCode sends and why the renderer may reject it.
      log.info(`tool_call_update IN: id=${updateId} title=${tu.title || tu.state?.title || "(none)"} kind=${tu.kind || "(none)"} status=${tu.status || tu.state?.status || "(none)"} hasRawOutput=${!!(tu.rawOutput || tu.raw_output)} hasContent=${!!(tu.content && tu.content.length)}`);

      // Extract human-readable text from the tool result.
      const rawResult: any =
        tu.rawOutput || tu.raw_output || tu.state?.output || tu.content || "";

      const updateInput =
        tu.rawInput || tu.raw_input || tu.state?.input;
      const backfillInput: any =
        (updateInput && typeof updateInput === "object" && Object.keys(updateInput).length > 0)
          ? updateInput : null;
      let backfillName: string | null = backfillInput
        ? (
            tu.tool_name || tu.toolName ||
            (typeof tu.tool === "string" ? tu.tool : "") ||
            ""
          )
        : null;

      const tuTitleLower = (tu.title || "").toLowerCase();
      // Task tool result: OpenCode sends the tool_call_update for a Task
      // delegation with `title: "task"` (matching the tool_call). Recognize it
      // here so the result is attributed to "task" and completeSubAgentTask fires
      // — without this, a Task whose tool_call was titled "task" but whose
      // rawInput doesn't trigger inferToolNameFromInput would never complete,
      // leaving the parent turn waiting (the "Task hangs" bug).
      if (tuTitleLower === "task") {
        backfillName = "task";
      }
      if (backfillInput && !backfillName && (tuTitleLower === "delete" || tuTitleLower === "move" || tuTitleLower === "question" || tuTitleLower === "bash")) {
        backfillName = tuTitleLower;
      }
      if (backfillInput && !backfillName && resolveLiteratureToolTitle(tuTitleLower)) {
        backfillName = tuTitleLower;
      }

      if (backfillInput && !backfillName) {
        backfillName = inferToolNameFromInput(backfillInput) || null;
      }

      const outputInferred = inferToolNameFromOutput(rawResult);
      if (outputInferred && (!backfillName || backfillName === "websearch")) {
        backfillName = outputInferred;
      }

      if (backfillInput) {
        log.debug(`tool_call_update backfill: id=${updateId} inputKeys=${JSON.stringify(Object.keys(backfillInput))} name=${backfillName || "(unchanged)"}`);
        const backfillToolName = (backfillName || "").toLowerCase();
        const tuStatusLocal = String(tu.status || tu.state?.status || "").toLowerCase();
        const isTerminalStatus =
          tuStatusLocal === "completed"
          || tuStatusLocal === "success"
          || tuStatusLocal === "finished"
          || tuStatusLocal === "done"
          || tuStatusLocal === "failed"
          || tuStatusLocal === "cancelled"
          || tuStatusLocal === "canceled";
        const isHistoricalReplay =
          isTerminalStatus
          || AcpService.getInstance().isSessionReplaySuppressed();
        if (
          !isHistoricalReplay
          && updateId
          && (
            backfillToolName === "bash"
            || backfillToolName === "shell"
            || backfillToolName === "terminal"
            || backfillToolName === "execute"
          )
        ) {
          const command =
            (typeof backfillInput.command === "string" ? backfillInput.command : "")
            || (typeof backfillInput.cmd === "string" ? backfillInput.cmd : "");
          const cwd =
            (typeof backfillInput.workdir === "string" ? backfillInput.workdir : undefined)
            || (typeof backfillInput.cwd === "string" ? backfillInput.cwd : undefined);
          AcpService.getInstance().syncBashPermissionFromToolCall({
            sessionId,
            tabId,
            toolCallId: updateId,
            command,
            cwd,
          });
        }
        if (
          !isHistoricalReplay
          && updateId
          && (backfillToolName === "delete" || backfillToolName === "move")
        ) {
          AcpService.getInstance().syncCustomToolPermissionFromToolCall({
            sessionId,
            tabId,
            toolCallId: updateId,
            toolName: backfillToolName,
            input: backfillInput,
          });
        }
      }

      const toolNameHint = backfillName || tu.tool_name || tu.toolName || "";
      let resultContent = this.extractToolResultContent(rawResult, toolNameHint);
      const tuStatus = String(tu.status || tu.state?.status || "").toLowerCase();
      // OpenCode emits terminal success as `completed`/`success`/`finished`
      // (synonyms). Treat all of them as "completed" for the completion checks
      // below — otherwise a Task result with status `success` would never fire
      // completeSubAgentTask, leaving the subagent widget spinning until the
      // 90s watchdog ("Task hangs" bug).
      const isTerminalSuccess =
        tuStatus === "completed"
        || tuStatus === "success"
        || tuStatus === "finished"
        || tuStatus === "done";
      const isError = tuStatus === "failed" || tu.state?.status === "failed";
      const isTerminal = isTerminalSuccess || isError || tuStatus === "cancelled" || tuStatus === "canceled" || tuStatus === "aborted" || tuStatus === "error" || tuStatus === "timeout" || tuStatus === "timed_out";
      const normalizedToolHint = (backfillName || toolNameHint || "").toLowerCase();
      const parentSessionId = this.tabToSession.get(tabId);
      let enrichedTaskForOpenCode = false;
      if (
        parentSessionId
        && normalizedToolHint === "task"
        && isTerminal
        && !isError
      ) {
        const rawTaskResult = resultContent;
        resultContent = enrichTaskToolResultContent(parentSessionId, resultContent);
        enrichedTaskForOpenCode = resultContent !== rawTaskResult;
      }

      const _isSubAgent = AcpService.getInstance().isSubAgentSession(sessionId);
      log.info(`tool_call_update BRANCH: id=${updateId} sessionId=${sessionId} tabId=${tabId} isSubAgentSession=${_isSubAgent} hint=${(backfillName || toolNameHint || "(none)")} isTerminal=${isTerminal}`);
      if (_isSubAgent) {
        this.emitSubAgentActivity(tabId, sessionId, {
          type: "tool_result",
          tool_use_id: updateId,
          content: resultContent,
          is_error: isError,
          status: tu.status || tu.state?.status || "completed",
          name: toolNameHint,
        });
        return;
      }

      if (
        (backfillName || toolNameHint).toLowerCase() === "task"
        && updateId
        && isTerminal
      ) {
        this.completeSubAgentTask(tabId, updateId, isError);
      }

      if (
        enrichedTaskForOpenCode
        && parentSessionId
        && updateId
        && !AcpService.getInstance().isSessionReplaySuppressed()
      ) {
        void syncEnrichedTaskToolResultToOpenCode(
          parentSessionId,
          updateId,
          this.extractToolResultContent(rawResult, toolNameHint),
        ).catch((err) => {
          log.warn(
            `Task result OpenCode sync failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
      }

      // Single message.updated event — tool_result + optional backfill.
      // Normalize the status sent downstream: OpenCode emits terminal success as
      // `completed` / `success` / `finished` (synonyms). Downstream widgets and
      // the renderer's isFinalToolResult historically only accepted `completed`/
      // `failed`, so a `success`/`finished` result was DROPPED — the tool spun
      // forever and was orphan-synthesized as "No result received". Map all
      // success synonyms to `completed` here.
      const _rawSentStatus = tu.status || tu.state?.status || "";
      const _sentStatus = /success|finished|done/i.test(_rawSentStatus)
        ? "completed"
        : (_rawSentStatus || "completed");
      const _sentIsError = _rawSentStatus.toLowerCase() === "failed" || tu.state?.status === "failed";
      log.info(`tool_call_update OUT: id=${updateId} hint=${(backfillName || toolNameHint || "(none)")} rawStatus=${_rawSentStatus || "(none)"} sentStatus=${_sentStatus} sentIsError=${_sentIsError} contentLen=${typeof resultContent === "string" ? resultContent.length : -1} tabId=${tabId} isSubAgentSession=${AcpService.getInstance().isSubAgentSession(sessionId)}`);
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.updated",
        data: {
          message: {
            content: [{
              type: "tool_result",
              tool_use_id: updateId,
              content: resultContent,
              is_error: _sentIsError,
              status: _sentStatus,
              _backfillInput: backfillInput,
              _backfillName: backfillName,
            }],
          },
        },
      });

      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. Plan event
    // ═══════════════════════════════════════════════════════════════
    if (chunkType === "plan" || update.plan) {
      const plan = update.plan || update;
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "plan.updated",
        data: plan,
      });
      return;
    }

    if (content && content.type === "text" && content.text) {
      if (AcpService.getInstance().isSubAgentSession(sessionId)) {
        const activityType =
          chunkType === "agent_thought_chunk" || chunkType === "thought_message_chunk"
            ? "thinking"
            : "text";
        this.emitSubAgentActivity(tabId, sessionId, {
          type: activityType,
          text: content.text,
          thinking: activityType === "thinking" ? content.text : undefined,
        });
        return;
      }

      // ── Thinking chunks (agent_thought_chunk OR thought_message_chunk) ──
      if (chunkType === "agent_thought_chunk" || chunkType === "thought_message_chunk") {
        const key = msgId || `${sessionId}-thinking`;
        const delta = content.text;
        const full = (this.accumThinking.get(key) || "") + delta;
        this.accumThinking.set(key, full);
        this.pruneAccum(this.accumThinking);
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "message.part.updated",
          data: {
            messageId: msgId,
            part: { type: "thinking", thinking: full },
            delta,
          },
        });
      } else if (chunkType === "user_message_chunk") {
        // User turns are rendered from composer/display snapshots — never replay
        // stored user chunks (includes injected system prompt on session/load).
        return;
      } else if (chunkType === "agent_message_chunk") {
        // ── Message text chunks (agent response or user echo) ──
        const key = msgId || `${sessionId}-text`;
        const delta = content.text;
        const full = (this.accumText.get(key) || "") + delta;
        this.accumText.set(key, full);
        this.pruneAccum(this.accumText);
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "message.part.updated",
          data: {
            messageId: msgId,
            part: { type: "text", text: full },
            delta,
          },
        });
      } else {
        // Generic text update (no recognised chunk type)
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "message.part.updated",
          data: {
            messageId: msgId,
            part: { type: "text", text: content.text },
            delta: content.text,
          },
        });
      }
    } else if (content && (content.type === "tool" || content.type === "tool_use")) {
      // ── Legacy tool call (content.type style) ──
      const legacyName = update.name || update.tool?.name || "";
      log.debug(`legacy tool_call: name="${legacyName}"`);
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.part.updated",
        data: {
          part: {
            type: "tool",
            id: update.id || update.toolId || "",
            name: legacyName,
            input: update.input || update.tool?.input || {},
            title: update.title || "",
            kind: update.kind || "",
            status: update.status || update.state || {},
          },
        },
      });
    } else if (update.type === "tool_result" || update.type === "tool-result") {
      // ── Legacy tool result (update.type style) ──
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.updated",
        data: {
          message: {
            content: [{
              type: "tool_result",
              tool_use_id: update.tool_use_id || update.toolUseId || update.id || "",
              content: update.content || update.result || "",
              is_error: update.isError || update.is_error || false,
            }],
          },
        },
      });
    } else if (typeof update.agent_message_chunk === "string" || typeof update.agent_thought_chunk === "string") {
      // ── SDK-flattened format: { agent_message_chunk: "text", agent_thought_chunk: "text" } ──
      // Some SDK versions deliver text/thinking as top-level string fields
      // without a `content` wrapper or `sessionUpdate` marker.
      if (typeof update.agent_thought_chunk === "string" && update.agent_thought_chunk) {
        const key = msgId || `${sessionId}-thinking`;
        const delta = update.agent_thought_chunk;
        const full = (this.accumThinking.get(key) || "") + delta;
        this.accumThinking.set(key, full);
        this.pruneAccum(this.accumThinking);
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "message.part.updated",
          data: { messageId: msgId, part: { type: "thinking", thinking: full }, delta },
        });
      }
      if (typeof update.agent_message_chunk === "string" && update.agent_message_chunk) {
        const key = msgId || `${sessionId}-text`;
        const delta = update.agent_message_chunk;
        const full = (this.accumText.get(key) || "") + delta;
        this.accumText.set(key, full);
        this.pruneAccum(this.accumText);
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "message.part.updated",
          data: { messageId: msgId, part: { type: "text", text: full }, delta },
        });
      }
    } else {
      // ── Completely unknown shape ──
      // Log at info level (once per shape) so we can identify new ACP event
      // types that need handling.  Also forward to the renderer as a generic
      // stream event so it isn't silently dropped.
      const shape = Object.keys(update).sort().join(",");
      if (!this._missedShapes.has(shape)) {
        this._missedShapes.add(shape);
        log.info(`Unhandled session/update shape: { ${shape} } — sample keys: ${JSON.stringify(Object.keys(update))}`);
      }
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.part.updated",
        data: { part: update },
      });
    }
  }

  private extractToolResultContent(raw: any, toolName?: string): string | Record<string, unknown> {
    const isBash = (toolName || "").toLowerCase() === "bash"
      || (raw && typeof raw === "object" && !Array.isArray(raw) && ("command" in raw || "exit" in raw || "exitCode" in raw));

    if (isBash && raw && typeof raw === "object" && !Array.isArray(raw)) {
      const output = this.extractOutputText(raw);
      const exitRaw = raw.exit ?? raw.exitCode ?? raw.exit_code;
      const exitCode = typeof exitRaw === "number" ? exitRaw : undefined;
      const cwd = typeof raw.cwd === "string" ? raw.cwd
        : typeof raw.workdir === "string" ? raw.workdir
        : undefined;
      return { output, exitCode, cwd };
    }

    return this.extractOutputText(raw);
  }

  /**
   * Extract a human-readable string from an ACP tool result.
   *
   * ACP tool outputs arrive in several shapes:
   *   1. Plain string              → "file content here..."
   *   2. Object with .content      → { content: "file content..." }
   *   3. Object with .output       → { output: "command output", exit: 0 }
   *   4. Array of ToolCallContent  → [{ type: "content", content: { type: "text", text: "..." } }]
   *
   * Returns a single plain string suitable for widget display.
   */
  private extractOutputText(raw: any): string {
    if (!raw) return "";
    if (typeof raw === "string") return raw;

    // Object with a .content, .output, .text, or .result field
    if (typeof raw === "object" && !Array.isArray(raw)) {
      if (typeof raw.content === "string") return raw.content;
      if (typeof raw.output === "string") return raw.output;
      if (typeof raw.text === "string") return raw.text;
      if (typeof raw.result === "string") return raw.result;
      // Object with nested content (e.g. { content: { type: "text", text: "..." } })
      if (raw.content && typeof raw.content === "object" && typeof raw.content.text === "string") {
        return raw.content.text;
      }
      // Last resort: stringify compactly
      return JSON.stringify(raw);
    }

    // Array of ToolCallContent blocks — extract text from each
    if (Array.isArray(raw)) {
      const texts: string[] = [];
      for (const item of raw) {
        if (item.type === "content" && item.content) {
          if (typeof item.content.text === "string") texts.push(item.content.text);
          else if (typeof item.content === "string") texts.push(item.content);
        } else if (item.type === "text" && typeof item.text === "string") {
          texts.push(item.text);
        } else if (typeof item === "string") {
          texts.push(item);
        }
      }
      if (texts.length > 0) return texts.join("\n");
      return JSON.stringify(raw);
    }

    return String(raw);
  }

  private mapSessionStatus(tabId: string, sessionId: string, params: any): void {
    const status = typeof params.status === "string"
      ? params.status
      : params.status?.type || String(params.status);

    log.info(`session.status: ${status} (sessionId=${sessionId})`);

    switch (status) {
      case "completed":
      case "idle":
        // Primary completion is ipc/chat.ts when sendPrompt returns.
        // Also forward status so the renderer can recover if a tool hang
        // prevented chat:complete (isStreaming would otherwise stay true).
        this.accumText.clear();
        this.accumThinking.clear();
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "session.status",
          data: { status, sessionId, ...params },
        });
        break;

      case "error":
        this.accumText.clear();
        this.accumThinking.clear();
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "session.status",
          data: { status, sessionId, ...params },
        });
        break;

      default:
        // running, aborted — forward as stream event for status tracking
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "session.status",
          data: { status, ...params },
        });
        break;
    }
  }
}
