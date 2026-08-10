import type { BrowserWindow } from "electron";
import { AcpService } from "./service";
import { createLogger } from "../services/logger";
import {
  registerChatSession,
  unregisterChatSession,
  resolveChatTabId,
  getSessionProjectRoot,
  getSessionTaskAllowlist,
  markSessionTaskAllowlistSatisfied,
  flushDeferredTaskAllowlistFollowUp,
} from "../services/chat-session-registry";
import {
  inferToolNameFromInput,
  inferToolNameFromOutput,
  resolveLiteratureToolTitle,
  resolveMcpToolTitle,
  resolvePrismToolTitle,
} from "./tool-name-infer";
import {
  buildTaskDelegationStagingPreface,
  enrichTaskToolResultContent,
  syncEnrichedTaskToolResultToOpenCode,
} from "../services/session-citations-context";
import { buildTaskDelegationCiteAuditPreface } from "../services/session-cite-audit-context";
import {
  formatOrchestratorBuiltinTaskDeniedMessage,
  isOpaqueTaskCancelledResult,
  normalizeTaskSubagentId,
  resolveOpaqueTaskCancelledDisplay,
  shouldDenyOutsideTaskAllowlist,
  shouldDenyReservedTaskSubagent,
} from "../services/task-orchestrator-gate";
import { formatTaskError } from "../../shared/task-error-codes";
import {
  extractBackgroundTaskSessionId,
  isBackgroundTaskJoinInject,
  isBackgroundTaskStartedResult,
  listBackgroundTaskJoins,
  type BackgroundTaskInject,
} from "../../shared/opencode-background-task";
import {
  durationSecFromOpenCodeTime,
  extractOpenCodeTime,
} from "../../shared/opencode-part-time";
import { buildSubAgentActivityBlocks } from "../../shared/opencode-session-activity";
import {
  parseAcpUsageUpdate,
  type AcpUsageUpdate,
} from "../../shared/session-context-usage";
import {
  loadSessionContext,
  persistSessionContext,
} from "../services/session-context-store";
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
  private unregisterNotifications = new Map<AcpService, () => void>();
  /** Parent tab → queued Task tool invocations awaiting a subagent session link. */
  private pendingTasksByTab = new Map<
    string,
    Array<{ toolUseId: string; expertId: string; prompt: string }>
  >();
  /** Task tool_use id → resolved subagent id (updated on backfill). */
  private taskToolExpertById = new Map<string, string>();
  /** Task tool_use id → parent tab while the OpenCode Task is still open. */
  private openTaskToolToTab = new Map<string, string>();
  /** Latest ACP usage_update per session (authoritative context ring fill). */
  private lastUsageBySession = new Map<
    string,
    AcpUsageUpdate & { at: number }
  >();
  /**
   * Background Task tool_use ids whose Timeline-A early "started" already settled
   * but Timeline-B (child / inject) has not — keep UI running until join.
   */
  /** Background Task tool_use ids awaiting Timeline-B join. */
  private backgroundOpenTasks = new Set<string>();
  /** Parent sessionId → last session.status (for post-join resume settle). */
  private parentSessionStatus = new Map<string, string>();
  /** Parent sessionId → last noteTurnContent timestamp. */
  private parentLastContentAt = new Map<string, number>();
  /** Resolvers woken when a tab's backgroundOpenTasks set becomes empty. */
  private backgroundSettleWaiters = new Map<string, Set<() => void>>();
  /** Subagent OpenCode session → parent Task tool_use id. */
  private subSessionToTaskTool = new Map<string, string>();
  /** Task tool_use id → UI-degrade timer (soft hint only; does not fail Task). */
  private taskLinkTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  /** Task tool_use id → await_timeout escalate timer (still unlinked after budget). */
  private taskAwaitTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * When to show the muted "activity stream not attached" hint.
   * Kept short for UX — background orphan retries continue longer.
   */
  private static readonly TASK_LINK_UI_DEGRADE_MS = 12_000;
  /**
   * How long to keep retrying parent_id lookups for orphan child sessions.
   * Covers late OpenCode SQLite commits; independent of UI degrade.
   */
  private static readonly ORPHAN_RETRY_BUDGET_MS = 90_000;
  /** Escalate unlinked Task UI from link_degraded → await_timeout (does not abort parent). */
  private static readonly TASK_AWAIT_TIMEOUT_MS = 90_000;
  /** First window: poll parent_id densely (late commits usually land here). */
  private static readonly ORPHAN_DENSE_WINDOW_MS = 5_000;
  private static readonly ORPHAN_DENSE_DELAY_MS = 250;
  /**
   * Child sessions whose updates arrived before we could resolve parent_id /
   * pending Task. Retried when parent_id appears or a Task is enqueued.
   */
  private orphanSubSessions = new Map<string, { firstSeenAt: number; retries: number }>();
  private orphanRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * session/update payloads dropped while a child had no Task link yet.
   * Replayed through mapSessionUpdate after linkSubAgentSession succeeds —
   * otherwise the panel stays on “Working…” with an empty stream.
   */
  private orphanUpdateBuffer = new Map<string, any[]>();
  private static readonly ORPHAN_UPDATE_MAX = 250;
  /** While a tab has pending Task slots, poll SQLite for new child sessions. */
  private childSessionPollTimers = new Map<string, ReturnType<typeof setInterval>>();
  private static readonly CHILD_SESSION_POLL_MS = 500;
  /**
   * After Task↔child link: poll OpenCode SQLite for subagent parts.
   * OpenCode often does not forward child session/update over ACP — without
   * this the run panel stays on Working… / 暂无活动 despite real tool work.
   */
  private subAgentDbSyncTimers = new Map<string, ReturnType<typeof setInterval>>();
  private subAgentDbSyncFingerprint = new Map<string, string>();
  /** Faster than 400ms so SQLite-only text growth feels closer to streaming. */
  private static readonly SUBAGENT_DB_SYNC_MS = 200;
  /**
   * While Task tools are still open on a tab, poll parent SQLite for synthetic
   * join injects. OpenCode often resumes the parent with inject in context
   * without forwarding every inject (or even Timeline-A tool_call_update) over
   * ACP — without this, cards stay on 执行中 after the main agent already
   * summarized.
   */
  private backgroundJoinPollTimers = new Map<string, ReturnType<typeof setInterval>>();
  private static readonly BACKGROUND_JOIN_POLL_MS = 400;
  /** Task tool_use ids the user stopped from the run panel (Stop). */
  private userStoppedTasks = new Set<string>();
  /**
   * Waiters for Task Stop settlement — resolve when parent Task tool_result
   * is rewritten to user_cancel (OpenCode truth), not when HTTP abort returns.
   */
  private userStoppedSettlement = new Map<
    string,
    {
      resolve: (value: { settled: true }) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  /** Default budget for parent Task to finish after child HTTP abort. */
  static readonly USER_STOP_SETTLEMENT_MS = 20_000;
  /**
   * Backoff after the dense window. Last delay repeats until ORPHAN_RETRY_BUDGET_MS.
   */
  private static readonly ORPHAN_RETRY_DELAYS_MS = [
    1_000, 2_000, 5_000, 10_000, 15_000, 20_000,
  ] as const;

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
    // session/new can emit session/update before chat IPC registers the tab —
    // clear false-orphan state and replay any buffered parent updates.
    this.orphanSubSessions.delete(sessionId);
    const orphanTimer = this.orphanRetryTimers.get(sessionId);
    if (orphanTimer) {
      clearTimeout(orphanTimer);
      this.orphanRetryTimers.delete(sessionId);
    }
    if (!unchanged) {
      this.accumText.clear();
      this.accumThinking.clear();
    }
    this.flushOrphanUpdateBuffer(tabId, sessionId);
  }

  unregisterSession(sessionId: string): void {
    unregisterChatSession(sessionId);
    const tabId = this.sessionToTab.get(sessionId);
    if (tabId) this.tabToSession.delete(tabId);
    this.sessionToTab.delete(sessionId);
  }

  start(service = AcpService.getInstance()): void {
    if (this.unregisterNotifications.has(service)) return;

    const unregister = service.onNotification((method, params) => {
      this.handleNotification(method, params);
    });
    this.unregisterNotifications.set(service, unregister);

    log.info("EventMapper started — listening for ACP notifications", {
      projectRoot: service.getProjectPath() || null,
    });
  }

  stop(): void {
    for (const unregister of this.unregisterNotifications.values()) unregister();
    this.unregisterNotifications.clear();
    // Release all session ↔ tab mappings to prevent leaks
    this.sessionToTab.clear();
    this.tabToSession.clear();
    this.accumText.clear();
    this.accumThinking.clear();
  }

  /**
   * Whether any session/update frame was forwarded for the current turn.
   * OpenCode can resolve session/prompt with a bare end_turn and ZERO frames
   * when the provider call fails (its internal error never reaches the wire)
   * — chat:send uses this to flag the turn as "empty" instead of fake-success.
   */
  private turnEmittedContent = false;

  hadTurnContent(): boolean {
    return this.turnEmittedContent;
  }

  /** Visible assistant activity (text / thinking / tools) — not user echo or chrome. */
  private noteTurnContent(sessionId?: string): void {
    this.turnEmittedContent = true;
    const sid = sessionId?.trim();
    if (!sid) return;
    for (const primary of this.tabToSession.values()) {
      if (primary === sid) {
        this.parentLastContentAt.set(sid, Date.now());
        return;
      }
    }
  }

  /** Clear per-turn text/thinking accumulators before a new user prompt. */
  clearTurnAccumulators(): void {
    this.accumText.clear();
    this.accumThinking.clear();
    this.thinkingStartedAt.clear();
    this.turnEmittedContent = false;
  }

  /**
   * Silently drop Task-link watchdogs for this tab (no UI error).
   * Parent `end_turn` can finish while Prism still thinks a Task is "pending
   * link" — the 90s timer must not survive into the next user message.
   */
  releasePendingTaskWatchdogsForTab(tabId: string): void {
    const queue = this.pendingTasksByTab.get(tabId);
    if (!queue?.length) return;
    this.pendingTasksByTab.delete(tabId);
    this.stopChildSessionPoll(tabId);
    for (const pending of queue) {
      this.clearTaskLinkWatchdog(pending.toolUseId);
      this.clearTaskAwaitTimeout(pending.toolUseId);
      log.warn(
        `releasePendingTaskWatchdogsForTab: tab=${tabId} toolUse=${pending.toolUseId} expert=@${pending.expertId}`,
      );
    }
  }

  /**
   * Fail + clear Tasks still waiting for a subagent link on this tab.
   * Called when a new user prompt starts — otherwise a stale 90s watchdog from
   * the previous turn can abort the new turn (opaque "Task cancelled").
   */
  clearPendingTasksForTab(tabId: string, reason?: string): void {
    const queue = this.pendingTasksByTab.get(tabId);
    if (!queue?.length) return;
    this.pendingTasksByTab.delete(tabId);
    this.stopChildSessionPoll(tabId);
    for (const pending of queue) {
      const msg =
        reason?.trim()
        || formatTaskError("superseded", { subagentId: pending.expertId });
      this.clearTaskLinkWatchdog(pending.toolUseId);
      this.clearTaskAwaitTimeout(pending.toolUseId);
      this.openTaskToolToTab.delete(pending.toolUseId);
      this.backgroundOpenTasks.delete(pending.toolUseId);
      this.taskToolExpertById.delete(pending.toolUseId);
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "subAgent.completed",
        data: {
          taskToolUseId: pending.toolUseId,
          status: "error",
          error: msg,
          code: "superseded",
        },
      });
      // Same shape as handleTaskLinkTimeout — stream switch ignores top-level
      // tool_result; UI gets the body via subAgent.completed → _injectToolResult.
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "tool_result",
        data: {
          tool_use_id: pending.toolUseId,
          content: msg,
          is_error: true,
          status: "failed",
          name: "task",
        },
      });
      log.warn(
        `clearPendingTasksForTab: tab=${tabId} toolUse=${pending.toolUseId} expert=@${pending.expertId}`,
      );
    }
  }

  /**
   * When OpenCode backfills Task rawInput (subagent_type arrives late), update
   * the pending slot so timeout / abandon messages name the real expert.
   */
  private refreshPendingTaskFromBackfill(
    tabId: string,
    toolUseId: string,
    toolInput: Record<string, unknown>,
  ): void {
    const queue = this.pendingTasksByTab.get(tabId);
    if (!queue?.length) return;
    const pending = queue.find((t) => t.toolUseId === toolUseId);
    if (!pending) return;
    const explicit =
      toolInput.subagent_type || toolInput.subagentType || toolInput.agent;
    const expertId = normalizeTaskSubagentId(
      typeof explicit === "string" ? explicit : undefined,
    );
    if (!expertId || expertId === pending.expertId) return;
    pending.expertId = expertId;
    this.taskToolExpertById.set(toolUseId, expertId);
    const rawPrompt = String(toolInput.prompt || toolInput.description || pending.prompt || "");
    if (rawPrompt && rawPrompt !== pending.prompt) pending.prompt = rawPrompt;
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.linked",
      data: {
        taskToolUseId: toolUseId,
        expertId,
        prompt: pending.prompt,
        rawPrompt,
        hasStagingPreface: false,
      },
    });
  }

  /**
   * Seal the current thinking segment with a duration before tools/prose start.
   * Live path uses wall clock; hydrate prefers OpenCode `time` when present.
   */
  private sealThinkingDuration(
    tabId: string,
    sessionId: string,
    msgId: string | undefined,
  ): void {
    const key = msgId || `${sessionId}-thinking`;
    const full = this.accumThinking.get(key);
    const started = this.thinkingStartedAt.get(key);
    if (!full?.trim() || started == null) return;
    const ended = Date.now();
    const duration = Math.round(((ended - started) / 1000) * 10) / 10;
    this.thinkingStartedAt.delete(key);
    this.accumThinking.delete(key);
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "message.part.updated",
      data: {
        messageId: msgId,
        part: {
          type: "thinking",
          thinking: full,
          duration,
          timeStart: started,
          timeEnd: ended,
        },
      },
    });
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
        // buffer it and keep retrying parent_id / Task-slot link. Without the
        // buffer, late link leaves the run panel stuck on “Working…”.
        const pendingTabs = Array.from(this.pendingTasksByTab.keys());
        const hasParentId = !!AcpService.getInstanceForSession(sessionId).getSessionParentId(sessionId);
        log.warn(`session/update dropped — no chat tab mapping`, {
          sessionId,
          method,
          pendingTaskTabs: pendingTabs,
          hasParentId,
        });
        this.rememberOrphanSubSession(sessionId);
        this.bufferOrphanUpdate(sessionId, params);
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
      && AcpService.getInstanceForSession(sessionId).isSessionReplaySuppressed()
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
      ?? AcpService.getInstanceForSession(sessionId).getSessionParentId(sessionId)
      ?? undefined;
    if (typeof parentId === "string" && parentId) {
      const parentTab = this.resolveTabForSession(parentId, params);
      if (parentTab) {
        if (!this.subSessionToTaskTool.has(sessionId)) {
          this.linkSubAgentSession(parentTab, sessionId);
        }
        // Only route through the parent tab once the child is bound to a Task
        // tool_use. Binding sessionToTab without subSessionToTaskTool caused
        // activity to hit emitSubAgentActivity and drop (no taskToolUseId),
        // while also skipping the orphan retry path — panel stuck on Working….
        if (this.subSessionToTaskTool.has(sessionId)) {
          if (!this.sessionToTab.has(sessionId)) {
            registerChatSession(
              sessionId,
              parentTab,
              getSessionProjectRoot(parentId),
            );
            this.sessionToTab.set(sessionId, parentTab);
            AcpService.getInstanceForSession(sessionId).markSubAgentSession(sessionId);
          }
          return parentTab;
        }
        this.rememberOrphanSubSession(sessionId);
        return undefined;
      }
    }

    // Sub-agent sessions inherit parent tab via parentSessionId above.
    // Do NOT attribute unmapped sessions to a sole pending-task tab (Bug #7):
    // when Tab A has a pending Task and Tab B's child session arrives first
    // (before B's Task is enqueued), that heuristic permanently binds B → A.
    // Prefer the 90s link watchdog ("Task hangs") over silent misrouting.

    return undefined;
  }

  // Accumulate text/thinking per messageId — OpenCode sends per-word deltas.
  // Capped at MAX_ACCUM_ENTRIES to prevent unbounded growth across many
  // prompt turns within a single session.
  private static readonly MAX_ACCUM_ENTRIES = 200;
  private accumText = new Map<string, string>();
  private accumThinking = new Map<string, string>();
  /** Wall-clock start (ms) for the current thinking accum key. */
  private thinkingStartedAt = new Map<string, number>();
  /** Track which session/update shapes we have already logged to avoid spam. */
  private _seenShapes = new Set<string>();
  private _missedShapes = new Set<string>();
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
    // gate deny only when we CAN see the type AND it's reserved (plan/build).
    // wrongly denying a Task whose expert id is simply not yet visible.
    const explicitSubagent =
      toolInput?.subagent_type || toolInput?.subagentType || toolInput?.agent;
    const expertId =
      normalizeTaskSubagentId(explicitSubagent) || "expert";
    const inputIsEmpty = !toolInput
      || (typeof toolInput === "object" && Object.keys(toolInput).length === 0);
    if (!inputIsEmpty && shouldDenyReservedTaskSubagent(expertId)) {
      log.warn(`task-orchestrator-gate: skip Task @${expertId} tab=${tabId} toolUse=${toolUseId}`);
      return;
    }
    const parentSessionId = this.tabToSession.get(tabId);
    const rawPrompt = String(toolInput?.prompt || toolInput?.description || "");
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
    this.taskToolExpertById.set(toolUseId, expertId);
    this.openTaskToolToTab.set(toolUseId, tabId);
    this.startTaskLinkWatchdog(tabId, toolUseId, expertId);
    this.startTaskAwaitTimeout(tabId, toolUseId, expertId);
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.linked",
      data: { taskToolUseId: toolUseId, expertId, prompt, rawPrompt, hasStagingPreface: !!stagingPreface },
    });
    // Child session/update may have arrived (and been dropped) before this Task
    // was enqueued — try to bind orphans now that a pending slot exists.
    this.tryLinkChildSessionsForTab(tabId);
    this.startChildSessionPoll(tabId);
    // Timeline-A tool_call_update is often missing over ACP; start join poll now
    // so SQLite injects can still settle the Task cards.
    this.reconcileOpenBackgroundTasks(tabId);
  }

  /** Remember an unmapped session and schedule parent_id re-lookups. */
  private rememberOrphanSubSession(sessionId: string): void {
    if (this.subSessionToTaskTool.has(sessionId)) return;
    // Primary chat sessions are never orphans (session/new race).
    for (const primary of this.tabToSession.values()) {
      if (primary === sessionId) return;
    }
    const prev = this.orphanSubSessions.get(sessionId);
    this.orphanSubSessions.set(sessionId, {
      firstSeenAt: prev?.firstSeenAt ?? Date.now(),
      retries: prev?.retries ?? 0,
    });
    this.scheduleOrphanRetry(sessionId);
  }

  /** Keep dropped child session/update payloads for replay after Task link. */
  private bufferOrphanUpdate(sessionId: string, params: any): void {
    const queue = this.orphanUpdateBuffer.get(sessionId) ?? [];
    queue.push(params);
    while (queue.length > EventMapper.ORPHAN_UPDATE_MAX) queue.shift();
    this.orphanUpdateBuffer.set(sessionId, queue);
  }

  private flushOrphanUpdateBuffer(tabId: string, sessionId: string): void {
    const queued = this.orphanUpdateBuffer.get(sessionId);
    if (!queued?.length) {
      this.orphanUpdateBuffer.delete(sessionId);
      return;
    }
    this.orphanUpdateBuffer.delete(sessionId);
    log.info(`replaying ${queued.length} buffered subagent update(s)`, { sessionId, tabId });
    for (const params of queued) {
      try {
        this.mapSessionUpdate(tabId, sessionId, params);
      } catch (err) {
        log.warn(`buffered subagent update replay failed`, {
          sessionId,
          tabId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private startChildSessionPoll(tabId: string): void {
    if (this.childSessionPollTimers.has(tabId)) return;
    if (!this.pendingTasksByTab.get(tabId)?.length) return;
    const timer = setInterval(() => {
      if (!this.pendingTasksByTab.get(tabId)?.length) {
        this.stopChildSessionPoll(tabId);
        return;
      }
      this.tryLinkChildSessionsForTab(tabId);
    }, EventMapper.CHILD_SESSION_POLL_MS);
    timer.unref?.();
    this.childSessionPollTimers.set(tabId, timer);
  }

  private stopChildSessionPoll(tabId: string): void {
    const timer = this.childSessionPollTimers.get(tabId);
    if (!timer) return;
    clearInterval(timer);
    this.childSessionPollTimers.delete(tabId);
  }

  private findSubSessionForTaskTool(taskToolUseId: string): string | undefined {
    for (const [sessionId, toolId] of this.subSessionToTaskTool) {
      if (toolId === taskToolUseId) return sessionId;
    }
    return undefined;
  }

  /** Poll SQLite for subagent parts and push snapshots to the run panel. */
  private startSubAgentDbSync(tabId: string, subSessionId: string): void {
    if (this.subAgentDbSyncTimers.has(subSessionId)) {
      this.syncSubAgentFromDb(tabId, subSessionId);
      return;
    }
    this.syncSubAgentFromDb(tabId, subSessionId);
    const timer = setInterval(() => {
      if (!this.subSessionToTaskTool.has(subSessionId)) {
        this.stopSubAgentDbSync(subSessionId);
        return;
      }
      this.syncSubAgentFromDb(tabId, subSessionId);
    }, EventMapper.SUBAGENT_DB_SYNC_MS);
    timer.unref?.();
    this.subAgentDbSyncTimers.set(subSessionId, timer);
  }

  private stopSubAgentDbSync(subSessionId: string): void {
    const timer = this.subAgentDbSyncTimers.get(subSessionId);
    if (timer) {
      clearInterval(timer);
      this.subAgentDbSyncTimers.delete(subSessionId);
    }
    this.subAgentDbSyncFingerprint.delete(subSessionId);
  }

  private syncSubAgentFromDb(tabId: string, subSessionId: string): void {
    const taskToolUseId = this.subSessionToTaskTool.get(subSessionId);
    if (!taskToolUseId) return;
    if (this.isUserStoppedTask(taskToolUseId)) return;
    const parts = AcpService.getInstanceForSession(subSessionId).listSessionActivityParts(subSessionId);
    const blocks = buildSubAgentActivityBlocks(parts);
    const fingerprint = JSON.stringify(blocks);
    if (this.subAgentDbSyncFingerprint.get(subSessionId) === fingerprint) return;
    this.subAgentDbSyncFingerprint.set(subSessionId, fingerprint);
    if (blocks.length === 0) return;
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.snapshot",
      data: { taskToolUseId, blocks },
    });
  }

  /** Next delay for orphan parent_id re-lookup (dense early, then backoff). */
  private orphanRetryDelayMs(firstSeenAt: number, retries: number): number {
    const ageMs = Date.now() - firstSeenAt;
    if (ageMs < EventMapper.ORPHAN_DENSE_WINDOW_MS) {
      return EventMapper.ORPHAN_DENSE_DELAY_MS;
    }
    // Count only post-dense retries for the backoff ladder index.
    const denseRetries = Math.ceil(
      EventMapper.ORPHAN_DENSE_WINDOW_MS / EventMapper.ORPHAN_DENSE_DELAY_MS,
    );
    const backoffIndex = Math.max(0, retries - denseRetries);
    return (
      EventMapper.ORPHAN_RETRY_DELAYS_MS[
        Math.min(backoffIndex, EventMapper.ORPHAN_RETRY_DELAYS_MS.length - 1)
      ] ?? 20_000
    );
  }

  private scheduleOrphanRetry(sessionId: string): void {
    if (this.orphanRetryTimers.has(sessionId)) return;
    const entry = this.orphanSubSessions.get(sessionId);
    if (!entry) return;
    const delay = this.orphanRetryDelayMs(entry.firstSeenAt, entry.retries);
    const timer = setTimeout(() => {
      this.orphanRetryTimers.delete(sessionId);
      const cur = this.orphanSubSessions.get(sessionId);
      if (!cur) return;
      if (this.subSessionToTaskTool.has(sessionId)) {
        this.orphanSubSessions.delete(sessionId);
        return;
      }
      cur.retries += 1;
      this.orphanSubSessions.set(sessionId, cur);
      // Also scan pending tabs' SQLite children — covers races where we never
      // saw a child update until parent_id / Task slot both exist.
      for (const tabId of this.pendingTasksByTab.keys()) {
        this.tryLinkChildSessionsForTab(tabId);
        if (this.subSessionToTaskTool.has(sessionId)) {
          log.info(`orphan sub-session linked on retry`, {
            sessionId,
            tabId,
            retries: cur.retries,
          });
          this.orphanSubSessions.delete(sessionId);
          return;
        }
      }
      const tabId = this.resolveTabForSession(sessionId);
      if (tabId && this.subSessionToTaskTool.has(sessionId)) {
        log.info(`orphan sub-session linked on retry`, {
          sessionId,
          tabId,
          retries: cur.retries,
        });
        this.orphanSubSessions.delete(sessionId);
        return;
      }
      const ageMs = Date.now() - cur.firstSeenAt;
      if (ageMs < EventMapper.ORPHAN_RETRY_BUDGET_MS) {
        this.scheduleOrphanRetry(sessionId);
      } else {
        log.warn(
          `orphan sub-session gave up after ${Math.round(ageMs / 1000)}s without parent_id`,
          { sessionId, retries: cur.retries },
        );
        this.orphanSubSessions.delete(sessionId);
        this.orphanUpdateBuffer.delete(sessionId);
      }
    }, delay);
    timer.unref?.();
    this.orphanRetryTimers.set(sessionId, timer);
  }

  /**
   * Bind child sessions to pending Task slots for this tab:
   * remembered orphans, half-linked sessionToTab rows, and SQLite children.
   */
  private tryLinkChildSessionsForTab(tabId: string): void {
    if (!this.pendingTasksByTab.get(tabId)?.length) return;
    const parentSessionId = this.tabToSession.get(tabId);
    const candidates = new Set<string>();

    for (const sessionId of this.orphanSubSessions.keys()) {
      candidates.add(sessionId);
    }
    if (parentSessionId) {
      for (const [sessionId, mappedTab] of this.sessionToTab) {
        if (mappedTab !== tabId) continue;
        if (sessionId === parentSessionId) continue;
        if (this.subSessionToTaskTool.has(sessionId)) continue;
        candidates.add(sessionId);
      }
      for (const childId of AcpService.getInstanceForSession(parentSessionId).listChildSessionIds(parentSessionId)) {
        candidates.add(childId);
      }
    }

    for (const sessionId of candidates) {
      if (!this.pendingTasksByTab.get(tabId)?.length) break;
      if (this.subSessionToTaskTool.has(sessionId)) {
        this.orphanSubSessions.delete(sessionId);
        continue;
      }
      const parentId = AcpService.getInstanceForSession(sessionId).getSessionParentId(sessionId);
      if (!parentId) continue;
      if (parentSessionId && parentId !== parentSessionId) continue;
      const parentTab = this.resolveTabForSession(parentId);
      if (parentTab !== tabId) continue;
      // Mark early so nested Task deny does not wait on link.
      AcpService.getInstanceForSession(sessionId).markSubAgentSession(sessionId);
      log.info(`linking child sub-session to pending Task`, { sessionId, tabId });
      this.linkSubAgentSession(tabId, sessionId);
    }
  }

  private emitOrchestratorBuiltinTaskDenied(
    tabId: string,
    msgId: string,
    toolId: string,
    toolInput: Record<string, unknown>,
    subagentId: string,
  ): void {
    this.emitTaskDeniedMessage(
      tabId,
      msgId,
      toolId,
      toolInput,
      formatOrchestratorBuiltinTaskDeniedMessage(subagentId),
    );
  }

  private emitTaskDeniedMessage(
    tabId: string,
    msgId: string,
    toolId: string,
    toolInput: Record<string, unknown>,
    message: string,
  ): void {
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
          title: "task",
          kind: "think",
          status: "failed",
        },
      },
    });
    // Prefer message.updated so the renderer stores a real tool_result (not lost
    // under an unhandled stream type). OpenCode may still emit "Task cancelled"
    // afterward — our explicit error content should already be on the widget.
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "message.updated",
      data: {
        message: {
          content: [{
            type: "tool_result",
            tool_use_id: toolId,
            content: message,
            is_error: true,
            status: "failed",
            name: "task",
          }],
        },
      },
    });
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.completed",
      data: {
        taskToolUseId: toolId,
        status: "error",
        error: message,
      },
    });
  }

  /**
   * Pick which pending Task a child session belongs to.
   * Prefer session.agent / Task-index alignment; only use sole-pending when
   * unambiguous. Never FIFO-guess when multiple Tasks are waiting.
   */
  private pickPendingTaskForChild(
    parentTabId: string,
    subSessionId: string,
  ): { toolUseId: string; expertId: string; prompt: string } | null {
    const queue = this.pendingTasksByTab.get(parentTabId);
    if (!queue?.length) return null;
    const parentSessionId = this.tabToSession.get(parentTabId);
    const service = AcpService.getInstanceForSession(subSessionId);
    const agentName = normalizeTaskSubagentId(
      typeof service.getSessionAgentName === "function"
        ? service.getSessionAgentName(subSessionId)
        : null,
    );

    const takeAt = (index: number) => {
      const [pending] = queue.splice(index, 1);
      if (queue.length === 0) {
        this.pendingTasksByTab.delete(parentTabId);
        this.stopChildSessionPoll(parentTabId);
      } else {
        this.pendingTasksByTab.set(parentTabId, queue);
      }
      return pending ?? null;
    };

    if (agentName) {
      const byAgent = queue.findIndex((p) => p.expertId === agentName);
      if (byAgent >= 0) return takeAt(byAgent);
    }

    if (parentSessionId) {
      for (let i = 0; i < queue.length; i++) {
        const candidate = queue[i]!;
        const resolved = service.resolveChildSessionForTask(
          parentSessionId,
          candidate.toolUseId,
          subSessionId,
        );
        if (resolved === subSessionId) return takeAt(i);
      }
    }

    if (queue.length === 1) return takeAt(0);

    log.warn(
      `ambiguous Task bind skipped: tab=${parentTabId} child=${subSessionId} ` +
        `pending=${queue.length} agent=${agentName ?? "(none)"}`,
    );
    return null;
  }

  private linkSubAgentSession(parentTabId: string, subSessionId: string): void {
    if (this.subSessionToTaskTool.has(subSessionId)) return;
    const pending = this.pickPendingTaskForChild(parentTabId, subSessionId);
    if (!pending) return;
    // Linked successfully — the subagent is now running and will complete on
    // its own. Clear the link watchdog so it doesn't fire a false timeout.
    this.clearTaskLinkWatchdog(pending.toolUseId);
    this.clearTaskAwaitTimeout(pending.toolUseId);
    this.subSessionToTaskTool.set(subSessionId, pending.toolUseId);
    this.sessionToTab.set(subSessionId, parentTabId);
    this.orphanSubSessions.delete(subSessionId);
    const orphanTimer = this.orphanRetryTimers.get(subSessionId);
    if (orphanTimer) {
      clearTimeout(orphanTimer);
      this.orphanRetryTimers.delete(subSessionId);
    }
    const parentSessionId = this.tabToSession.get(parentTabId);
    registerChatSession(
      subSessionId,
      parentTabId,
      parentSessionId ? getSessionProjectRoot(parentSessionId) : undefined,
    );
    AcpService.getInstanceForSession(subSessionId).markSubAgentSession(subSessionId);
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
    // Replay text/thinking/tools that arrived before the Task slot existed.
    this.flushOrphanUpdateBuffer(parentTabId, subSessionId);
    // ACP often omits child session/update — keep the panel fed from SQLite.
    this.startSubAgentDbSync(parentTabId, subSessionId);
    // Recover Timeline A / join if ACP skipped background started tool_result.
    this.reconcileOpenBackgroundTasks(parentTabId);
  }

  /** Link sub-session to pending Task when parent_id is known but link not yet established. */
  private ensureSubAgentTaskLink(tabId: string, subSessionId: string): string | undefined {
    const existing = this.subSessionToTaskTool.get(subSessionId);
    if (existing) return existing;
    const parentSessionId = AcpService.getInstanceForSession(subSessionId).getSessionParentId(subSessionId);
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
    // User Stop — do not keep streaming tools/text into the run panel.
    if (this.isUserStoppedTask(taskToolUseId)) return;
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.activity",
      data: { taskToolUseId, block },
    });
  }

  /** Mark a Task as user-stopped so cancel results are not rewritten as opencode_cancelled. */
  markUserStoppedTask(taskToolUseId: string): void {
    const id = taskToolUseId?.trim();
    if (id) this.userStoppedTasks.add(id);
  }

  isUserStoppedTask(taskToolUseId: string): boolean {
    return this.userStoppedTasks.has(taskToolUseId?.trim() || "");
  }

  /** Linked child session for a Task tool_use (authoritative over renderer memory). */
  resolveSubSessionForTask(taskToolUseId: string): string | undefined {
    return this.findSubSessionForTaskTool(taskToolUseId);
  }

  /**
   * User Stop: freeze the run panel stream immediately. Keep the userStopped
   * mark until OpenCode's Task tool_result arrives so it rewrites to user_cancel
   * for the main agent (do not clear here).
   */
  freezeUserStoppedSubAgent(taskToolUseId: string): string | undefined {
    const id = taskToolUseId?.trim();
    if (!id) return undefined;
    this.markUserStoppedTask(id);
    this.clearTaskLinkWatchdog(id);
    this.clearTaskAwaitTimeout(id);
    const subSessionId = this.findSubSessionForTaskTool(id);
    if (subSessionId) this.stopSubAgentDbSync(subSessionId);
    return subSessionId;
  }

  /**
   * Await OpenCode settling the parent Task after user Stop (tool_result →
   * user_cancel rewrite). Rejects with code `abort_failed` on timeout.
   */
  waitForUserStoppedTaskSettlement(
    taskToolUseId: string,
    timeoutMs: number = EventMapper.USER_STOP_SETTLEMENT_MS,
  ): Promise<{ settled: true }> {
    const id = taskToolUseId?.trim();
    if (!id) {
      return Promise.reject(
        Object.assign(new Error("missing_task_id"), { code: "missing_args" as const }),
      );
    }
    const prev = this.userStoppedSettlement.get(id);
    if (prev) {
      clearTimeout(prev.timer);
      prev.reject(
        Object.assign(new Error("superseded"), { code: "superseded" as const }),
      );
      this.userStoppedSettlement.delete(id);
    }
    return new Promise<{ settled: true }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.userStoppedSettlement.delete(id);
        reject(
          Object.assign(new Error("abort_failed"), { code: "abort_failed" as const }),
        );
      }, timeoutMs);
      this.userStoppedSettlement.set(id, { resolve, reject, timer });
    });
  }

  private settleUserStoppedTask(taskToolUseId: string): void {
    const id = taskToolUseId?.trim();
    if (!id) return;
    const waiter = this.userStoppedSettlement.get(id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.userStoppedSettlement.delete(id);
    waiter.resolve({ settled: true });
  }

  /**
   * Abort/settlement failed before OpenCode finished the Task — drop waiter +
   * userStopped mark so Stop can be retried without a lying rewrite.
   */
  cancelUserStoppedSettlement(
    taskToolUseId: string,
    code: "abort_failed" | "superseded" = "abort_failed",
  ): void {
    const id = taskToolUseId?.trim();
    if (!id) return;
    const waiter = this.userStoppedSettlement.get(id);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.userStoppedSettlement.delete(id);
      waiter.reject(Object.assign(new Error(code), { code }));
    }
    this.clearUserStoppedTask(id);
  }

  private clearUserStoppedTask(taskToolUseId: string): void {
    this.userStoppedTasks.delete(taskToolUseId?.trim() || "");
  }

  private completeSubAgentTask(
    tabId: string,
    taskToolUseId: string,
    isError: boolean,
    error?: string,
  ): void {
    // The subagent finished (success or error) — no need for the link watchdog.
    this.clearTaskLinkWatchdog(taskToolUseId);
    this.clearTaskAwaitTimeout(taskToolUseId);
    // Keep userStopped mark through the Task tool_result rewrite path; clear
    // after rewrite in the tool_call_update handler (not here).
    const subSessionId = this.findSubSessionForTaskTool(taskToolUseId);
    if (subSessionId) {
      // Final SQLite pull so the panel isn't empty when ACP never streamed.
      // Skip when user-stopped — further DB growth must not revive the panel.
      if (!this.isUserStoppedTask(taskToolUseId)) {
        this.syncSubAgentFromDb(tabId, subSessionId);
      }
      this.stopSubAgentDbSync(subSessionId);
    }
    const queue = this.pendingTasksByTab.get(tabId);
    let expertId = this.taskToolExpertById.get(taskToolUseId);
    if (queue) {
      const idx = queue.findIndex((t) => t.toolUseId === taskToolUseId);
      if (idx !== -1) {
        expertId = expertId || queue[idx]!.expertId;
        queue.splice(idx, 1);
        if (queue.length === 0) this.pendingTasksByTab.delete(tabId);
        else this.pendingTasksByTab.set(tabId, queue);
      }
    }
    this.taskToolExpertById.delete(taskToolUseId);
    this.openTaskToolToTab.delete(taskToolUseId);
    this.backgroundOpenTasks.delete(taskToolUseId);
    const parentSessionId = this.tabToSession.get(tabId);
    if (!isError && expertId && expertId !== "expert") {
      if (parentSessionId) {
        markSessionTaskAllowlistSatisfied(parentSessionId, expertId);
      }
    }
    const errorText =
      isError && typeof error === "string" && error.trim() ? error.trim() : undefined;
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.completed",
      data: {
        taskToolUseId,
        status: isError ? "error" : "done",
        ...(errorText ? { error: errorText } : {}),
      },
    });
    // Parent may have end_turn'd while this Task was still open — flush @ nudge now.
    if (parentSessionId && !this.hasOpenTaskToolsForTab(tabId)) {
      void flushDeferredTaskAllowlistFollowUp(parentSessionId);
    }
    if (!this.hasBackgroundOpenTasksForTab(tabId)) {
      this.wakeBackgroundSettleWaiters(tabId);
    }
  }

  /** True while Timeline-A settled as background start but child/inject not joined. */
  isBackgroundOpenTask(taskToolUseId: string): boolean {
    return this.backgroundOpenTasks.has(taskToolUseId?.trim() || "");
  }

  /** True while this tab has ≥1 background Task awaiting Timeline-B join. */
  hasBackgroundOpenTasksForTab(tabId: string): boolean {
    for (const id of this.backgroundOpenTasks) {
      if (this.openTaskToolToTab.get(id) === tabId) return true;
    }
    return false;
  }

  private wakeBackgroundSettleWaiters(tabId: string): void {
    const waiters = this.backgroundSettleWaiters.get(tabId);
    if (!waiters?.size) return;
    for (const wake of waiters) wake();
  }

  /**
   * After parent `session/prompt` returns end_turn while background Tasks are
   * still open: keep the turn alive until joins finish and OpenCode's inject
   * auto-resume goes idle. Without this, chat:complete flips isStreaming=false
   * and the renderer drops the resume stream (only visible after reopen).
   */
  async waitForBackgroundTurnSettle(
    tabId: string,
    opts?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<void> {
    const timeoutMs = opts?.timeoutMs ?? 600_000;
    const signal = opts?.signal;
    const parentSessionId = this.tabToSession.get(tabId);
    const deadline = Date.now() + timeoutMs;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms);
        t.unref?.();
      });

    const aborted = () => Boolean(signal?.aborted);

    // Phase 1 — wait until no background Tasks remain open on this tab.
    this.reconcileOpenBackgroundTasks(tabId);
    while (this.hasBackgroundOpenTasksForTab(tabId)) {
      if (aborted() || Date.now() >= deadline) {
        log.warn(`background turn settle: join phase timed out or aborted`, { tabId });
        break;
      }
      await new Promise<void>((resolve) => {
        const wake = () => {
          clearInterval(poll);
          resolve();
        };
        let set = this.backgroundSettleWaiters.get(tabId);
        if (!set) {
          set = new Set();
          this.backgroundSettleWaiters.set(tabId, set);
        }
        set.add(wake);
        const poll = setInterval(() => {
          this.reconcileOpenBackgroundTasks(tabId);
          if (!this.hasBackgroundOpenTasksForTab(tabId) || aborted() || Date.now() >= deadline) {
            set!.delete(wake);
            if (set!.size === 0) this.backgroundSettleWaiters.delete(tabId);
            clearInterval(poll);
            resolve();
          }
        }, 250);
        poll.unref?.();
      });
    }

    if (aborted() || !parentSessionId) return;

    // Phase 2 — OpenCode may auto-resume the parent after inject. Hold until
    // the parent is idle and quiet for a short debounce after the last content.
    const quietMs = 1_200;
    const settleEpoch = Date.now();
    while (Date.now() < deadline) {
      if (aborted()) return;
      const status = (this.parentSessionStatus.get(parentSessionId) || "idle").toLowerCase();
      const lastContent = this.parentLastContentAt.get(parentSessionId) || 0;
      const anchor = Math.max(lastContent, settleEpoch);
      const idle = status === "idle" || status === "completed" || status === "done";
      const quiet = Date.now() - anchor >= quietMs;
      if (idle && quiet) {
        log.info(`background turn settle: parent quiet after joins`, {
          tabId,
          parentSessionId,
          status,
          quietMs: Date.now() - anchor,
        });
        return;
      }
      await sleep(200);
    }
    log.warn(`background turn settle: resume quiet phase timed out`, { tabId });
  }

  /**
   * Background Timeline-A "started": keep Task open for UI / Stop; emit started.
   * @ allowlist is satisfied on dispatch (not only on join).
   */
  private markBackgroundTaskStarted(
    tabId: string,
    taskToolUseId: string,
    opts: { metadata?: unknown; content?: unknown; rawInput?: unknown },
  ): void {
    this.backgroundOpenTasks.add(taskToolUseId);
    this.openTaskToolToTab.set(taskToolUseId, tabId);
    const expertId =
      this.taskToolExpertById.get(taskToolUseId)
      || this.pendingTasksByTab.get(tabId)?.find((t) => t.toolUseId === taskToolUseId)?.expertId
      || "expert";
    const parentSessionId = this.tabToSession.get(tabId);
    if (parentSessionId && expertId && expertId !== "expert") {
      markSessionTaskAllowlistSatisfied(parentSessionId, expertId);
    }
    const childSessionId = extractBackgroundTaskSessionId({
      metadata: opts.metadata,
      content: opts.content,
    });
    if (childSessionId && !this.subSessionToTaskTool.has(childSessionId)) {
      this.subSessionToTaskTool.set(childSessionId, taskToolUseId);
      AcpService.getInstanceForSession(childSessionId).markSubAgentSession(childSessionId);
      this.sessionToTab.set(childSessionId, tabId);
      this.clearTaskLinkWatchdog(taskToolUseId);
      this.clearTaskAwaitTimeout(taskToolUseId);
      this.startSubAgentDbSync(tabId, childSessionId);
    }
    const prompt =
      this.pendingTasksByTab.get(tabId)?.find((t) => t.toolUseId === taskToolUseId)?.prompt
      || "";
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.started",
      data: {
        taskToolUseId,
        mode: "background",
        expertId,
        prompt,
        ...(childSessionId ? { subSessionId: childSessionId } : {}),
        ...(childSessionId ? { jobId: childSessionId } : {}),
      },
    });
    log.info(`background Task started (Timeline A)`, {
      tabId,
      taskToolUseId,
      expertId,
      childSessionId: childSessionId ?? null,
    });
    this.startBackgroundJoinPoll(tabId);
    // Catch injects that landed in SQLite before we marked Timeline A.
    this.scanParentBackgroundJoinsFromDb(tabId);
  }

  /**
   * Recover background join state from OpenCode SQLite when ACP skipped
   * Timeline-A tool_call_update and/or inject chunks. Safe to call often.
   */
  reconcileOpenBackgroundTasks(tabId: string): void {
    if (!tabId || !this.tabHasOpenTasksForJoin(tabId)) return;
    this.ensureBackgroundTasksFromDb(tabId);
    this.startBackgroundJoinPoll(tabId);
    this.scanParentBackgroundJoinsFromDb(tabId);
  }

  /** True when this tab still has a Task tool open (sync or background). */
  private tabHasOpenTasksForJoin(tabId: string): boolean {
    for (const t of this.openTaskToolToTab.values()) {
      if (t === tabId) return true;
    }
    return false;
  }

  /**
   * Parent DB already has Task tool rows with metadata.background / started stub
   * even when ACP never delivered the terminal tool_call_update.
   */
  private ensureBackgroundTasksFromDb(tabId: string): void {
    const parentSessionId = this.tabToSession.get(tabId);
    if (!parentSessionId) return;
    const parts = AcpService.getInstanceForSession(parentSessionId).listSessionActivityParts(parentSessionId);
    for (const part of parts) {
      const d = part.data;
      const toolName = String(d.tool || d.name || "").toLowerCase();
      if (toolName !== "task") continue;
      const callId = String(d.callID || d.callId || d.id || "").trim();
      if (!callId || this.openTaskToolToTab.get(callId) !== tabId) continue;
      if (this.backgroundOpenTasks.has(callId)) continue;
      const state =
        d.state && typeof d.state === "object" && !Array.isArray(d.state)
          ? (d.state as Record<string, unknown>)
          : null;
      const meta =
        state?.metadata && typeof state.metadata === "object" && !Array.isArray(state.metadata)
          ? (state.metadata as Record<string, unknown>)
          : null;
      const input =
        state?.input && typeof state.input === "object" && !Array.isArray(state.input)
          ? state.input
          : null;
      const output =
        typeof state?.output === "string"
          ? state.output
          : typeof state?.result === "string"
            ? state.result
            : "";
      if (
        !isBackgroundTaskStartedResult({
          metadata: meta,
          rawInput: input,
          content: output,
        })
      ) {
        continue;
      }
      log.info(`background Task recovered from SQLite (ACP Timeline A missed)`, {
        tabId,
        taskToolUseId: callId,
      });
      this.markBackgroundTaskStarted(tabId, callId, {
        metadata: meta,
        content: output,
        rawInput: input,
      });
    }
  }

  private startBackgroundJoinPoll(tabId: string): void {
    if (this.backgroundJoinPollTimers.has(tabId)) return;
    const timer = setInterval(() => {
      if (!this.tabHasOpenTasksForJoin(tabId)) {
        this.stopBackgroundJoinPoll(tabId);
        return;
      }
      this.ensureBackgroundTasksFromDb(tabId);
      this.scanParentBackgroundJoinsFromDb(tabId);
    }, EventMapper.BACKGROUND_JOIN_POLL_MS);
    timer.unref?.();
    this.backgroundJoinPollTimers.set(tabId, timer);
  }

  private stopBackgroundJoinPoll(tabId: string): void {
    const timer = this.backgroundJoinPollTimers.get(tabId);
    if (!timer) return;
    clearInterval(timer);
    this.backgroundJoinPollTimers.delete(tabId);
  }

  /**
   * Read synthetic `<task … completed>` injects from the parent session DB and
   * join any still-open Tasks. Mirrors subAgent DB sync: ACP is not the source
   * of truth for every inject.
   */
  private scanParentBackgroundJoinsFromDb(tabId: string): void {
    if (!this.tabHasOpenTasksForJoin(tabId)) return;
    const parentSessionId = this.tabToSession.get(tabId);
    if (!parentSessionId) return;
    const parts = AcpService.getInstanceForSession(parentSessionId).listSessionActivityParts(parentSessionId);
    for (const part of parts) {
      const text =
        typeof part.data.text === "string"
          ? part.data.text
          : typeof part.data.content === "string"
            ? part.data.content
            : "";
      if (!text || !isBackgroundTaskJoinInject(text)) continue;
      for (const parsed of listBackgroundTaskJoins(text)) {
        this.joinBackgroundTaskFromInject(tabId, parsed);
      }
    }
  }

  /** Scan parent-session text for OpenCode injectBackgroundResult markup. */
  private maybeJoinBackgroundTaskFromText(tabId: string, text: string): void {
    if (!text?.trim() || !this.tabHasOpenTasksForJoin(tabId)) return;
    if (!isBackgroundTaskJoinInject(text)) return;
    for (const parsed of listBackgroundTaskJoins(text)) {
      this.joinBackgroundTaskFromInject(tabId, parsed);
    }
    // ACP may deliver only one inject chunk while siblings already sit in SQLite.
    this.scanParentBackgroundJoinsFromDb(tabId);
  }

  /**
   * Resolve which open Task an inject belongs to, then complete it.
   * Match by child session / job id only — never FIFO-steal another open Task
   * when multiple are running (that left the real owner stuck forever).
   */
  private joinBackgroundTaskFromInject(
    tabId: string,
    parsed: BackgroundTaskInject,
  ): void {
    let taskToolUseId =
      this.subSessionToTaskTool.get(parsed.sessionId)
      || [...this.openTaskToolToTab.entries()]
        .filter(([, t]) => t === tabId)
        .map(([id]) => id)
        .find((id) => this.findSubSessionForTaskTool(id) === parsed.sessionId);

    if (!taskToolUseId) {
      taskToolUseId =
        this.resolveBackgroundTaskToolFromParentDb(tabId, parsed.sessionId)
        ?? undefined;
    }

    const openOnTab = [...this.openTaskToolToTab.entries()]
      .filter(([, t]) => t === tabId)
      .map(([id]) => id);

    if (!taskToolUseId && openOnTab.length === 1) {
      // Single open Task: inject must be for it (id aliases happen).
      taskToolUseId = openOnTab[0];
    }

    if (!taskToolUseId) {
      if (openOnTab.length > 1) {
        log.warn(`background inject id unmatched with multiple open Tasks — waiting`, {
          injectId: parsed.sessionId,
          open: openOnTab,
        });
      }
      return;
    }

    // Inject is Timeline B. Complete even when ACP skipped Timeline A
    // (tool never entered backgroundOpenTasks).
    if (
      !this.openTaskToolToTab.has(taskToolUseId)
      && !this.backgroundOpenTasks.has(taskToolUseId)
    ) {
      return;
    }

    if (parsed.sessionId && !this.subSessionToTaskTool.has(parsed.sessionId)) {
      this.subSessionToTaskTool.set(parsed.sessionId, taskToolUseId);
    }
    if (!this.backgroundOpenTasks.has(taskToolUseId)) {
      this.backgroundOpenTasks.add(taskToolUseId);
    }

    const ownerTab = this.openTaskToolToTab.get(taskToolUseId) ?? tabId;
    const isError = parsed.state === "error";
    log.info(`background Task join via inject`, {
      tabId: ownerTab,
      taskToolUseId,
      injectId: parsed.sessionId,
      state: parsed.state,
    });
    this.completeSubAgentTask(
      ownerTab,
      taskToolUseId,
      isError,
      isError ? (parsed.body || parsed.summary || "Background task failed") : undefined,
    );
    if (!this.tabHasOpenTasksForJoin(ownerTab)) {
      this.stopBackgroundJoinPoll(ownerTab);
    }
  }

  /**
   * Parent SQLite Task tool rows carry metadata.sessionId / jobId — use that when
   * live maps missed Timeline-A bind but inject id is the real child session.
   */
  private resolveBackgroundTaskToolFromParentDb(
    tabId: string,
    childSessionId: string,
  ): string | null {
    const parentSessionId = this.tabToSession.get(tabId);
    if (!parentSessionId || !childSessionId) return null;
    const parts = AcpService.getInstanceForSession(parentSessionId).listSessionActivityParts(parentSessionId);
    for (const part of parts) {
      const d = part.data;
      const toolName = String(d.tool || d.name || "").toLowerCase();
      if (toolName !== "task") continue;
      const callId = String(d.callID || d.callId || d.id || "").trim();
      if (!callId || this.openTaskToolToTab.get(callId) !== tabId) continue;
      const state =
        d.state && typeof d.state === "object" && !Array.isArray(d.state)
          ? (d.state as Record<string, unknown>)
          : null;
      const meta =
        state?.metadata && typeof state.metadata === "object" && !Array.isArray(state.metadata)
          ? (state.metadata as Record<string, unknown>)
          : null;
      const metaChild =
        (typeof meta?.sessionId === "string" && meta.sessionId.trim())
        || (typeof meta?.jobId === "string" && meta.jobId.trim())
        || "";
      if (metaChild === childSessionId) return callId;
      const output =
        typeof state?.output === "string"
          ? state.output
          : typeof state?.result === "string"
            ? state.result
            : "";
      const fromOutput = extractBackgroundTaskSessionId({ content: output });
      if (fromOutput === childSessionId) return callId;
    }
    return null;
  }

  /** Child session reached terminal status — join background Task if still open. */
  private maybeCompleteBackgroundTaskFromChildStatus(
    sessionId: string,
    status: string,
  ): boolean {
    const taskToolUseId = this.subSessionToTaskTool.get(sessionId);
    if (!taskToolUseId) return false;
    if (
      !this.backgroundOpenTasks.has(taskToolUseId)
      && !this.openTaskToolToTab.has(taskToolUseId)
    ) {
      return false;
    }
    const tabId = this.openTaskToolToTab.get(taskToolUseId);
    if (!tabId) return false;
    const s = status.toLowerCase();
    if (s === "completed" || s === "idle" || s === "done" || s === "success") {
      log.info(`background Task join via child session.status=${status}`, {
        sessionId,
        taskToolUseId,
      });
      if (!this.backgroundOpenTasks.has(taskToolUseId)) {
        this.backgroundOpenTasks.add(taskToolUseId);
      }
      this.completeSubAgentTask(tabId, taskToolUseId, false);
      if (!this.tabHasOpenTasksForJoin(tabId)) {
        this.stopBackgroundJoinPoll(tabId);
      }
      return true;
    }
    if (
      s === "error"
      || s === "failed"
      || s === "aborted"
      || s === "cancelled"
      || s === "canceled"
    ) {
      if (!this.backgroundOpenTasks.has(taskToolUseId)) {
        this.backgroundOpenTasks.add(taskToolUseId);
      }
      this.completeSubAgentTask(
        tabId,
        taskToolUseId,
        true,
        `Background task ended (${status})`,
      );
      if (!this.tabHasOpenTasksForJoin(tabId)) {
        this.stopBackgroundJoinPoll(tabId);
      }
      return true;
    }
    return false;
  }

  /**
   * User Stop on a background Task: parent tool_call already settled — complete
   * locally after child abort (do not hang waiting for a second tool_result).
   */
  completeBackgroundTaskUserCancel(taskToolUseId: string, message: string): void {
    const id = taskToolUseId?.trim();
    if (!id) return;
    const tabId = this.openTaskToolToTab.get(id);
    if (!tabId) {
      this.backgroundOpenTasks.delete(id);
      return;
    }
    if (!this.backgroundOpenTasks.has(id) && !this.openTaskToolToTab.has(id)) return;
    this.backgroundOpenTasks.add(id);
    this.markUserStoppedTask(id);
    this.completeSubAgentTask(tabId, id, true, message);
    this.settleUserStoppedTask(id);
    this.clearUserStoppedTask(id);
    if (!this.tabHasOpenTasksForJoin(tabId)) {
      this.stopBackgroundJoinPoll(tabId);
    }
  }

  /** True while any Task for this tab has started and not yet completed. */
  hasOpenTaskToolsForTab(tabId: string): boolean {
    for (const t of this.openTaskToolToTab.values()) {
      if (t === tabId) return true;
    }
    return (this.pendingTasksByTab.get(tabId)?.length ?? 0) > 0;
  }

  /** Start (or restart) the UI-degrade timer for a Task tool_use. */
  private startTaskLinkWatchdog(tabId: string, toolUseId: string, expertId: string): void {
    this.clearTaskLinkWatchdog(toolUseId);
    const timer = setTimeout(() => {
      this.taskLinkTimeouts.delete(toolUseId);
      this.handleTaskLinkTimeout(tabId, toolUseId, expertId);
    }, EventMapper.TASK_LINK_UI_DEGRADE_MS);
    timer.unref?.();
    this.taskLinkTimeouts.set(toolUseId, timer);
  }

  /** Clear the UI-degrade timer (subagent linked or task completed). */
  private clearTaskLinkWatchdog(toolUseId: string): void {
    const timer = this.taskLinkTimeouts.get(toolUseId);
    if (timer) {
      clearTimeout(timer);
      this.taskLinkTimeouts.delete(toolUseId);
    }
  }

  private startTaskAwaitTimeout(tabId: string, toolUseId: string, expertId: string): void {
    this.clearTaskAwaitTimeout(toolUseId);
    const timer = setTimeout(() => {
      this.taskAwaitTimeouts.delete(toolUseId);
      this.handleTaskAwaitTimeout(tabId, toolUseId, expertId);
    }, EventMapper.TASK_AWAIT_TIMEOUT_MS);
    timer.unref?.();
    this.taskAwaitTimeouts.set(toolUseId, timer);
  }

  private clearTaskAwaitTimeout(toolUseId: string): void {
    const timer = this.taskAwaitTimeouts.get(toolUseId);
    if (timer) {
      clearTimeout(timer);
      this.taskAwaitTimeouts.delete(toolUseId);
    }
  }

  private isTaskStillUnlinked(tabId: string, toolUseId: string): boolean {
    for (const boundId of this.subSessionToTaskTool.values()) {
      if (boundId === toolUseId) return false;
    }
    return (
      this.pendingTasksByTab.get(tabId)?.some((t) => t.toolUseId === toolUseId)
      || this.openTaskToolToTab.get(toolUseId) === tabId
    );
  }

  /**
   * UI degrade window elapsed without binding a child session.
   * Soft hint only — keep the pending slot so late parent_id retries can still
   * link. Task completion remains owned by OpenCode.
   */
  private handleTaskLinkTimeout(tabId: string, toolUseId: string, expertId: string): void {
    if (!this.isTaskStillUnlinked(tabId, toolUseId)) return;

    const secs = EventMapper.TASK_LINK_UI_DEGRADE_MS / 1000;
    log.warn(
      `task-link-degraded: expert=@${expertId} toolUse=${toolUseId} tab=${tabId} ` +
        `— no child session linked within ${secs}s; orphan retries continue; ` +
        `Task still owned by OpenCode`,
    );
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.linkDegraded",
      data: {
        taskToolUseId: toolUseId,
        expertId,
        code: "link_degraded",
      },
    });
  }

  /**
   * Still unlinked after the await budget — stronger UI signal (await_timeout).
   * Does not abort the parent session; OpenCode still owns Task completion.
   */
  private handleTaskAwaitTimeout(tabId: string, toolUseId: string, expertId: string): void {
    if (!this.isTaskStillUnlinked(tabId, toolUseId)) return;

    const msg = formatTaskError("await_timeout", { subagentId: expertId });
    log.warn(
      `task-await-timeout: expert=@${expertId} toolUse=${toolUseId} tab=${tabId} ` +
        `— still unlinked after ${EventMapper.TASK_AWAIT_TIMEOUT_MS / 1000}s`,
    );
    this.win.webContents.send("chat:stream", {
      tabId,
      type: "subAgent.linkDegraded",
      data: {
        taskToolUseId: toolUseId,
        expertId,
        code: "await_timeout",
        message: msg,
      },
    });
  }

  /** Latest OpenCode usage_update for a session (used by chat:complete). */
  getLastUsageUpdate(sessionId: string): (AcpUsageUpdate & { at: number }) | null {
    return this.lastUsageBySession.get(sessionId) ?? null;
  }

  private mapSessionUpdate(tabId: string, sessionId: string, params: any): void {
    const update: any = params.update || params;
    const chunkType = update.sessionUpdate;

    if (chunkType === "agent_error") {
      const detail =
        (typeof update.message === "string" && update.message)
        || (typeof update.error === "string" && update.error)
        || (typeof update.content === "string" && update.content)
        || "";
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "session.error",
        data: { message: detail, raw: update },
      });
      return;
    }

    // ACP session-usage RFD: { sessionUpdate: "usage_update", used, size }
    const usageUpdate = parseAcpUsageUpdate(update);
    if (usageUpdate) {
      this.lastUsageBySession.set(sessionId, { ...usageUpdate, at: Date.now() });
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "session.usage",
        data: {
          used: usageUpdate.used,
          size: usageUpdate.size,
          cost: usageUpdate.cost ?? null,
          source: "usage_update" as const,
        },
      });
      const projectRoot = getSessionProjectRoot(sessionId);
      if (projectRoot) {
        const prev = loadSessionContext(projectRoot, sessionId);
        persistSessionContext(projectRoot, sessionId, {
          tokens: usageUpdate.used,
          windowSize: usageUpdate.size,
          source: "usage_update",
          updatedAt: Date.now(),
          promptFingerprint: prev?.promptFingerprint,
          hasSystemPromptBlock: prev?.hasSystemPromptBlock,
        });
      }
      log.debug("usage_update", {
        sessionId,
        used: usageUpdate.used,
        size: usageUpdate.size,
      });
      return;
    }

    // Do NOT mark turn content here — user_message_chunk / mode chrome / plan
    // updates must not suppress the empty-turn provider-error path.
    // The ACP SDK's sessionUpdate callback delivers a JSON-RPC notification's
    // `params` field.  The exact shape depends on the SDK version:
    //
    //   Shape A (wrapped):  { sessionId, update: { sessionUpdate, content, tool_call, ... } }
    //   Shape B (flattened): { sessionId, sessionUpdate, content, tool_call, ... }
    //
    // We normalise both here: `update` = the inner bag of fields.
    const content = update.content;
    const msgId = update.messageId;

    // Debug: log every session/update shape ONCE per new shape to aid diagnosis.
    // Uses a simple fingerprint so we don't flood logs on every chunk.
    const shapeKeys = Object.keys(update).sort().join(",");
    if (!this._seenShapes.has(shapeKeys)) {
      this._seenShapes.add(shapeKeys);
      log.debug(`session/update shape: { ${shapeKeys} } sessionUpdate=${chunkType} — sample: ${JSON.stringify(update).slice(0, 300)}`);
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
      // MCP titles (`server_tool`) beat query→websearch inference — paper-search
      // MCP shares the same input keys as builtin websearch.
      if (!toolName) {
        const mcpTitle = resolveMcpToolTitle(titleLower);
        if (mcpTitle) toolName = mcpTitle;
      }

      if (!toolName) {
        // kind "other" is the default for custom prismnext tools (citation-health,
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

      const toolLabel = toolName || String(tc.title || tc.kind || "?").trim() || "?";
      log.info(`tool call: ${toolLabel}`);

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
        AcpService.getInstanceForSession(sessionId).syncBashPermissionFromToolCall({
          sessionId,
          tabId,
          toolCallId: toolId,
          command,
          cwd,
        });
      }

      if ((toolName === "delete" || toolName === "move") && toolId) {
        AcpService.getInstanceForSession(sessionId).syncCustomToolPermissionFromToolCall({
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

      // Thinking segment ends when the first tool starts.
      this.sealThinkingDuration(tabId, sessionId, msgId);

      if (AcpService.getInstanceForSession(sessionId).isSubAgentSession(sessionId)) {
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
        // Only enforce deny gates when we can actually see the subagent type.
        // An empty input means the type isn't on this event — don't false-deny.
        if (!inputIsEmpty && shouldDenyReservedTaskSubagent(subagentId)) {
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
        const parentSessionId = this.tabToSession.get(tabId);
        const allowlist = parentSessionId
          ? getSessionTaskAllowlist(parentSessionId)
          : [];
        // Use explicit type only — never the "expert" placeholder (type not visible yet).
        const visibleId = normalizeTaskSubagentId(explicitSubagent);
        if (
          !inputIsEmpty
          && visibleId
          && shouldDenyOutsideTaskAllowlist(allowlist, visibleId)
        ) {
          log.warn(
            `task-orchestrator-gate: blocked allowlist Task @${visibleId} tab=${tabId} toolUse=${toolId}`,
          );
          this.emitTaskDeniedMessage(
            tabId,
            msgId,
            toolId,
            toolInput,
            formatTaskError("task_allowlist_denied", {
              subagentId: visibleId,
              allowlist,
            }),
          );
          return;
        }
        this.trackTaskToolUse(tabId, toolId, toolInput);
      }

      this.noteTurnContent(sessionId);
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
      const updateId = tu.toolCallId || tu.tool_call_id || tu.callID || tu.id || "";

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

      const tuTitleLower = (tu.title || tu.state?.title || "").toLowerCase();
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
        const prismTitle = resolvePrismToolTitle(tuTitleLower);
        if (prismTitle) backfillName = prismTitle;
      }

      // Prefer MCP `server_tool` title before query→websearch inference.
      if (backfillInput && !backfillName) {
        const mcpTitle = resolveMcpToolTitle(tuTitleLower);
        if (mcpTitle) backfillName = mcpTitle;
      }

      if (backfillInput && !backfillName) {
        backfillName = inferToolNameFromInput(backfillInput) || null;
      }

      // If inference still said websearch but the ACP title is an MCP tool,
      // keep the real MCP name (live UI + widget dispatch).
      if (backfillName === "websearch") {
        const mcpTitle = resolveMcpToolTitle(tuTitleLower);
        if (mcpTitle) backfillName = mcpTitle;
      }
      // query+limit input inference mislabels literature-discover as literature-search
      // during live streaming; title + discover-shaped output are authoritative.
      if (backfillName === "literature-search") {
        const prismTitle = resolvePrismToolTitle(tuTitleLower) || resolveLiteratureToolTitle(tuTitleLower);
        if (prismTitle === "literature-discover") backfillName = prismTitle;
      }

      const outputInferred = inferToolNameFromOutput(rawResult);
      if (
        outputInferred
        && (
          !backfillName
          || backfillName === "websearch"
          || (outputInferred === "literature-discover" && backfillName === "literature-search")
        )
      ) {
        backfillName = outputInferred;
      }

      const toolNameHint = backfillName || tu.tool_name || tu.toolName || "";
      const toolLabel =
        toolNameHint || String(tu.title || tu.state?.title || tu.kind || "?").trim() || "?";

      if (backfillInput) {
        const backfillToolName = (backfillName || "").toLowerCase();
        if (
          (backfillToolName === "task" || tuTitleLower === "task")
          && updateId
        ) {
          this.refreshPendingTaskFromBackfill(tabId, updateId, backfillInput);
        }
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
          || AcpService.getInstanceForSession(sessionId).isSessionReplaySuppressed();
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
          AcpService.getInstanceForSession(sessionId).syncBashPermissionFromToolCall({
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
          AcpService.getInstanceForSession(sessionId).syncCustomToolPermissionFromToolCall({
            sessionId,
            tabId,
            toolCallId: updateId,
            toolName: backfillToolName,
            input: backfillInput,
          });
        }
      }

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
      const isCancelled =
        tuStatus === "cancelled"
        || tuStatus === "canceled"
        || tuStatus === "aborted";
      const isError =
        tuStatus === "failed"
        || tu.state?.status === "failed"
        || isCancelled
        || tuStatus === "error"
        || tuStatus === "timeout"
        || tuStatus === "timed_out";
      const isTerminal = isTerminalSuccess || isError;
      const normalizedToolHint = (backfillName || toolNameHint || "").toLowerCase();
      const parentSessionId = this.tabToSession.get(tabId);

      // Task failures: rewrite cancel so the main agent and UI share actionable text.
      // User Stop must stay user_cancel — never the "not a user cancel" opaque rewrite.
      let userStoppedTask = false;
      let userStoppedError: string | undefined;
      if (normalizedToolHint === "task" && isError && updateId) {
        const subFromBackfill =
          backfillInput && typeof backfillInput === "object"
            ? normalizeTaskSubagentId(
                (backfillInput as Record<string, unknown>).subagent_type
                ?? (backfillInput as Record<string, unknown>).subagentType
                ?? (backfillInput as Record<string, unknown>).agent,
              )
            : null;
        const pendingId =
          this.pendingTasksByTab.get(tabId)?.find((t) => t.toolUseId === updateId)?.expertId
          ?? null;
        let displayId = subFromBackfill || normalizeTaskSubagentId(pendingId);
        if (!displayId || displayId === "expert") displayId = null;
        userStoppedTask = this.isUserStoppedTask(updateId);
        if (userStoppedTask) {
          resultContent = formatTaskError("user_cancel", { subagentId: displayId });
          userStoppedError =
            typeof resultContent === "string" ? resultContent : String(resultContent);
          if (parentSessionId) {
            void AcpService.getInstanceForSession(parentSessionId)
              .patchSessionToolOutput(parentSessionId, updateId, resultContent)
              .catch(() => {});
          }
        } else if (isOpaqueTaskCancelledResult(resultContent)) {
          resultContent = resolveOpaqueTaskCancelledDisplay(displayId);
          // Persist readable failure into OpenCode so later turns / hydration see it
          // (live model may already have received opaque cancel from OpenCode).
          if (parentSessionId) {
            void AcpService.getInstanceForSession(parentSessionId)
              .patchSessionToolOutput(parentSessionId, updateId, resultContent)
              .catch(() => {});
          }
        }
      }

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

      const _isSubAgent = AcpService.getInstanceForSession(sessionId).isSubAgentSession(sessionId);
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
        const taskMeta =
          tu.metadata
          ?? tu.state?.metadata
          ?? tu._meta
          ?? null;
        const backgroundStarted =
          !isError
          && isBackgroundTaskStartedResult({
            metadata: taskMeta,
            rawInput: backfillInput,
            content: resultContent,
          });
        if (backgroundStarted) {
          this.markBackgroundTaskStarted(tabId, updateId, {
            metadata: taskMeta,
            content: resultContent,
            rawInput: backfillInput,
          });
        } else {
          this.completeSubAgentTask(tabId, updateId, isError, userStoppedError);
          if (userStoppedTask || this.isUserStoppedTask(updateId)) {
            this.settleUserStoppedTask(updateId);
            this.clearUserStoppedTask(updateId);
          }
        }
      }

      if (
        enrichedTaskForOpenCode
        && parentSessionId
        && updateId
        && !AcpService.getInstanceForSession(sessionId).isSessionReplaySuppressed()
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
      const _sentStatus = isError
        ? "failed"
        : /success|finished|done/i.test(_rawSentStatus)
          ? "completed"
          : (_rawSentStatus || "completed");
      log.info(`tool result: ${toolLabel}`);
      const ocTime = extractOpenCodeTime(tu) ?? extractOpenCodeTime({ state: tu.state });
      const ocDuration = durationSecFromOpenCodeTime(ocTime);
      const timeStart =
        ocTime && typeof ocTime === "object" && typeof (ocTime as { start?: unknown }).start === "number"
          ? (ocTime as { start: number }).start
          : undefined;
      const timeEnd =
        ocTime && typeof ocTime === "object" && typeof (ocTime as { end?: unknown }).end === "number"
          ? (ocTime as { end: number }).end
          : undefined;
      this.noteTurnContent(sessionId);
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.updated",
        data: {
          message: {
            content: [{
              type: "tool_result",
              tool_use_id: updateId,
              content: resultContent,
              is_error: isError,
              status: _sentStatus,
              _backfillInput: backfillInput,
              _backfillName: backfillName,
              ...(ocDuration != null ? { duration: ocDuration } : {}),
              ...(timeStart != null ? { timeStart: timeStart } : {}),
              ...(timeEnd != null ? { timeEnd: timeEnd } : {}),
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
      if (AcpService.getInstanceForSession(sessionId).isSubAgentSession(sessionId)) {
        // Same delta accumulation as the main session — otherwise upsert replaces
        // the trailing text with each tiny chunk and the final reply looks non-streaming.
        const isThinking =
          chunkType === "agent_thought_chunk" || chunkType === "thought_message_chunk";
        if (isThinking) {
          const key = msgId || `${sessionId}-thinking`;
          if (!this.thinkingStartedAt.has(key)) {
            this.thinkingStartedAt.set(key, Date.now());
          }
          const delta = content.text;
          const full = (this.accumThinking.get(key) || "") + delta;
          this.accumThinking.set(key, full);
          this.pruneAccum(this.accumThinking);
          this.emitSubAgentActivity(tabId, sessionId, {
            type: "thinking",
            text: full,
            thinking: full,
          });
        } else {
          const key = msgId || `${sessionId}-text`;
          const delta = content.text;
          const full = (this.accumText.get(key) || "") + delta;
          this.accumText.set(key, full);
          this.pruneAccum(this.accumText);
          this.emitSubAgentActivity(tabId, sessionId, {
            type: "text",
            text: full,
          });
        }
        return;
      }

      // ── Thinking chunks (agent_thought_chunk OR thought_message_chunk) ──
      if (chunkType === "agent_thought_chunk" || chunkType === "thought_message_chunk") {
        const key = msgId || `${sessionId}-thinking`;
        if (!this.thinkingStartedAt.has(key)) {
          this.thinkingStartedAt.set(key, Date.now());
        }
        const delta = content.text;
        const full = (this.accumThinking.get(key) || "") + delta;
        this.accumThinking.set(key, full);
        this.pruneAccum(this.accumThinking);
        this.noteTurnContent(sessionId);
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
        // Background join inject arrives as a synthetic parent prompt (user role).
        // Scan for completion markup without rendering as a chat user bubble.
        if (typeof content.text === "string" && content.text) {
          const key = `${sessionId}-bg-inject`;
          const full = (this.accumText.get(key) || "") + content.text;
          this.accumText.set(key, full);
          this.pruneAccum(this.accumText);
          this.maybeJoinBackgroundTaskFromText(tabId, full);
        }
        // User turns are rendered from composer/display snapshots — never replay
        // stored user chunks (includes injected system prompt on session/load).
        return;
      } else if (chunkType === "agent_message_chunk") {
        // Prose starts — seal any open thinking so Thought for / Worked for freeze.
        this.sealThinkingDuration(tabId, sessionId, msgId);
        // ── Message text chunks (agent response or user echo) ──
        const key = msgId || `${sessionId}-text`;
        const delta = content.text;
        const full = (this.accumText.get(key) || "") + delta;
        this.accumText.set(key, full);
        this.pruneAccum(this.accumText);
        this.maybeJoinBackgroundTaskFromText(tabId, full);
        this.noteTurnContent(sessionId);
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
        this.noteTurnContent(sessionId);
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
      log.info(`tool call: ${legacyName || "?"}`);
      this.noteTurnContent(sessionId);
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
      if (AcpService.getInstanceForSession(sessionId).isSubAgentSession(sessionId)) {
        if (typeof update.agent_thought_chunk === "string" && update.agent_thought_chunk) {
          const key = msgId || `${sessionId}-thinking`;
          if (!this.thinkingStartedAt.has(key)) {
            this.thinkingStartedAt.set(key, Date.now());
          }
          const delta = update.agent_thought_chunk;
          const full = (this.accumThinking.get(key) || "") + delta;
          this.accumThinking.set(key, full);
          this.pruneAccum(this.accumThinking);
          this.emitSubAgentActivity(tabId, sessionId, {
            type: "thinking",
            text: full,
            thinking: full,
          });
        }
        if (typeof update.agent_message_chunk === "string" && update.agent_message_chunk) {
          const key = msgId || `${sessionId}-text`;
          const delta = update.agent_message_chunk;
          const full = (this.accumText.get(key) || "") + delta;
          this.accumText.set(key, full);
          this.pruneAccum(this.accumText);
          this.emitSubAgentActivity(tabId, sessionId, {
            type: "text",
            text: full,
          });
        }
        return;
      }
      if (typeof update.agent_thought_chunk === "string" && update.agent_thought_chunk) {
        const key = msgId || `${sessionId}-thinking`;
        if (!this.thinkingStartedAt.has(key)) {
          this.thinkingStartedAt.set(key, Date.now());
        }
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
        this.sealThinkingDuration(tabId, sessionId, msgId);
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
        log.debug(`Unhandled session/update shape: { ${shape} } — sample keys: ${JSON.stringify(Object.keys(update))}`);
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

    // Track primary-session status for background turn settle (post-inject resume).
    for (const primary of this.tabToSession.values()) {
      if (primary === sessionId) {
        this.parentSessionStatus.set(sessionId, String(status || ""));
        break;
      }
    }

    // Background child finished — complete parent Task card even if inject was missed.
    if (this.maybeCompleteBackgroundTaskFromChildStatus(sessionId, String(status || ""))) {
      return;
    }

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
          data: { status, sessionId, ...params },
        });
        break;
    }
  }
}
