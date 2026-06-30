import type { BrowserWindow } from "electron";
import { AcpService } from "./service";
import { createLogger } from "../services/logger";
import { registerChatSession, unregisterChatSession, resolveChatTabId } from "../services/chat-session-registry";
import {
  inferToolNameFromInput,
  inferToolNameFromOutput,
  resolveLiteratureToolTitle,
} from "./tool-name-infer";

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

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  registerSession(sessionId: string, tabId: string): void {
    registerChatSession(sessionId, tabId);
    // Clean up any previous session mapping for this tab (prevents stale routing)
    const prevSession = this.tabToSession.get(tabId);
    if (prevSession && prevSession !== sessionId) {
      this.sessionToTab.delete(prevSession);
    }
    this.sessionToTab.set(sessionId, tabId);
    this.tabToSession.set(tabId, sessionId);
    // Clear accumulators for new session
    this.accumText.clear();
    this.accumThinking.clear();
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
      }
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
    if (this.tabToSession.size === 1) {
      return [...this.tabToSession.keys()][0];
    }
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
      ?? params?.session?.parentSessionId;
    if (typeof parentId === "string" && parentId) {
      const parentTab = this.resolveTabForSession(parentId, params);
      if (parentTab) {
        registerChatSession(sessionId, parentTab);
        this.sessionToTab.set(sessionId, parentTab);
        return parentTab;
      }
    }

    // Single active chat tab: sub-agent sessions inherit that tab.
    if (this.tabToSession.size === 1) {
      const onlyTab = [...this.tabToSession.keys()][0];
      registerChatSession(sessionId, onlyTab);
      this.sessionToTab.set(sessionId, onlyTab);
      return onlyTab;
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
      if (!toolName && (titleLower === "delete" || titleLower === "move" || titleLower === "question" || titleLower === "bash")) {
        toolName = titleLower;
      }
      if (!toolName && resolveLiteratureToolTitle(titleLower)) {
        toolName = titleLower;
      }

      if (!toolName) {
        toolName =
          fromInput ||
          fromKind ||
          (typeof tc.kind === "string" ? tc.kind : "") ||
          "";
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

      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.part.updated",
        data: {
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
        if (
          updateId
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
          updateId
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
      const resultContent = this.extractToolResultContent(rawResult, toolNameHint);

      // Single message.updated event — tool_result + optional backfill
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.updated",
        data: {
          message: {
            content: [{
              type: "tool_result",
              tool_use_id: updateId,
              content: resultContent,
              is_error: tu.status === "failed" || tu.state?.status === "failed",
              status: tu.status || tu.state?.status || "completed",
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
          data: { part: { type: "thinking", thinking: full }, delta },
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
          data: { part: { type: "text", text: full }, delta },
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
