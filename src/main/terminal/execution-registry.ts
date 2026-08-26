import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  terminalExecutionIsFinal,
  type TerminalExecutionEvent,
  type TerminalExecutionEventType,
  type TerminalExecutionOrigin,
  type TerminalExecutionState,
  type TerminalExecutionSummary,
} from "../../shared/execution";
// node-pty is desktop/native. Host list/handshake must not load it.

export interface ExecutionTransportHandlers {
  onOutput(data: string): void;
  onExit(exitCode: number, extras?: { stderr?: string }): void;
}

export interface ExecutionTransport {
  start(
    execution: TerminalExecutionSummary,
    handlers: ExecutionTransportHandlers,
    context?: ExecutionTransportStartContext,
  ): Promise<void>;
  cancel(executionId: string, reason: string): Promise<void>;
}

export interface CreateExecutionInput {
  origin: TerminalExecutionOrigin;
  command: string;
  cwd: string;
  projectId: string;
  chatTabId?: string;
  opencodeSessionId?: string;
  toolCallId?: string;
  experimentId?: string;
  runId?: string;
  envExtra?: Record<string, string>;
  captureStderr?: string;
}

export interface CreateExecutionOptions {
  start?: boolean;
}

export interface ExecutionTransportStartContext {
  envExtra?: Record<string, string>;
  captureStderr?: string;
}

export interface ExecutionRegistryOptions {
  transport: ExecutionTransport;
  historyRoot: string;
  now?: () => number;
  generateId?: () => string;
  maxCachedEvents?: number;
  /** Host detach: keep a disk-backed job running across stdio restarts. */
  recoverLive?: (summary: TerminalExecutionSummary) => boolean;
}

export interface ExecutionReplayView {
  summary: TerminalExecutionSummary;
  events: TerminalExecutionEvent[];
}

export interface ExecutionRegistry {
  create(input: CreateExecutionInput, options?: CreateExecutionOptions): Promise<TerminalExecutionSummary>;
  start(executionId: string): Promise<void>;
  reject(executionId: string, result: { output: string; exitCode: number }): Promise<void>;
  get(executionId: string): TerminalExecutionSummary | undefined;
  findByToolCallId(toolCallId: string): TerminalExecutionSummary | undefined;
  replay(executionId: string, fromSequence: number): Promise<ExecutionReplayView>;
  cancel(executionId: string, reason: string): Promise<void>;
  cancelForChat(chatTabId: string): Promise<void>;
  applyProjectSwitch(projectId: string, options?: { stopExperimentIds?: string[] }): Promise<void>;
  finalizeForQuit(): Promise<void>;
  subscribe(listener: (event: TerminalExecutionEvent) => void): () => void;
  listRunning(projectId?: string): TerminalExecutionSummary[];
  waitForFinal(executionId: string): Promise<TerminalExecutionSummary>;
}

const LEGAL_TRANSITIONS: Record<TerminalExecutionState, readonly TerminalExecutionState[]> = {
  created: ["awaiting-permission", "queued", "starting", "running", "failed", "cancelled"],
  "awaiting-permission": ["queued", "starting", "cancelled", "failed"],
  queued: ["starting", "cancelled", "failed"],
  starting: ["running", "completed", "failed", "cancelled", "timed-out", "lost"],
  running: ["cancel-requested", "completed", "failed", "cancelled", "timed-out", "lost"],
  "cancel-requested": ["cancelled", "completed", "failed", "timed-out", "lost"],
  completed: [],
  failed: [],
  cancelled: [],
  "timed-out": [],
  lost: [],
};

interface ExecutionRecord {
  summary: TerminalExecutionSummary;
  events: TerminalExecutionEvent[];
  nextSequence: number;
  finalized: boolean;
  envExtra?: Record<string, string>;
  captureStderr?: string;
}

export function createExecutionRegistry(options: ExecutionRegistryOptions): ExecutionRegistry {
  const now = options.now ?? Date.now;
  const generateId = options.generateId ?? (() => randomUUID());
  const maxCachedEvents = options.maxCachedEvents ?? 5_000;
  const records = new Map<string, ExecutionRecord>();
  const listeners = new Set<(event: TerminalExecutionEvent) => void>();

  function historyDir(executionId: string): string {
    return join(options.historyRoot, executionId);
  }

  function snapshot(record: ExecutionRecord): TerminalExecutionSummary {
    return { ...record.summary };
  }

  function persistMetadata(record: ExecutionRecord): void {
    const dir = historyDir(record.summary.executionId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "metadata.json"), `${JSON.stringify(record.summary, null, 2)}\n`, "utf8");
  }

  function persistEvent(record: ExecutionRecord, event: TerminalExecutionEvent): void {
    const dir = historyDir(record.summary.executionId);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
    if (event.type === "output" && event.data) {
      appendFileSync(join(dir, "transcript.log"), event.data, "utf8");
    }
  }

  function setState(record: ExecutionRecord, next: TerminalExecutionState): void {
    const current = record.summary.state;
    if (current === next) return;
    if (!LEGAL_TRANSITIONS[current].includes(next)) {
      throw new Error(`illegal execution transition: ${current} -> ${next}`);
    }
    record.summary.state = next;
  }

  function emit(
    record: ExecutionRecord,
    type: TerminalExecutionEventType,
    extra?: Pick<TerminalExecutionEvent, "data" | "exitCode" | "state">,
  ): TerminalExecutionEvent {
    const event: TerminalExecutionEvent = {
      executionId: record.summary.executionId,
      sequence: record.nextSequence,
      type,
      at: now(),
      ...extra,
    };
    record.nextSequence += 1;
    record.events.push(event);
    if (record.events.length > maxCachedEvents) {
      record.events.splice(0, record.events.length - maxCachedEvents);
    }
    if (type === "output" && extra?.data) {
      record.summary.transcriptTail = `${record.summary.transcriptTail ?? ""}${extra.data}`;
    }
    persistEvent(record, event);
    persistMetadata(record);
    for (const listener of listeners) listener(event);
    return event;
  }

  function persistStderr(record: ExecutionRecord, stderr: string): void {
    if (!stderr) return;
    record.summary.stderrTail = stderr;
    const stderrFile = join(historyDir(record.summary.executionId), "stderr.log");
    writeFileSync(stderrFile, stderr, "utf8");
    record.summary.stderrPath = stderrFile;
  }

  function finalize(record: ExecutionRecord, exitCode: number, extras?: { stderr?: string }): void {
    if (record.finalized) return;
    if (extras?.stderr) persistStderr(record, extras.stderr);
    const nextState: TerminalExecutionState =
      record.summary.state === "cancel-requested" || exitCode === 130
        ? "cancelled"
        : exitCode === 0
          ? "completed"
          : "failed";
    setState(record, nextState);
    record.summary.exitCode = exitCode;
    record.summary.endedAt = now();
    record.finalized = true;
    emit(record, "exited", { exitCode, state: nextState });
  }

  function shouldAbortStart(record: ExecutionRecord): boolean {
    return record.finalized || record.summary.state === "cancel-requested";
  }

  function isPersistedSummary(value: unknown): value is TerminalExecutionSummary {
    if (!value || typeof value !== "object") return false;
    const summary = value as TerminalExecutionSummary;
    return typeof summary.executionId === "string"
      && typeof summary.command === "string"
      && typeof summary.projectId === "string"
      && typeof summary.state === "string";
  }

  function loadPersistedEvents(filePath: string): TerminalExecutionEvent[] {
    if (!existsSync(filePath)) return [];
    const events: TerminalExecutionEvent[] = [];
    for (const line of readFileSync(filePath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as TerminalExecutionEvent;
        if (
          parsed
          && typeof parsed.executionId === "string"
          && typeof parsed.sequence === "number"
          && typeof parsed.type === "string"
        ) {
          events.push(parsed);
        }
      } catch {
        // skip a corrupt line
      }
    }
    return events.sort((a, b) => a.sequence - b.sequence);
  }

  function restoreFromDisk(): void {
    if (!existsSync(options.historyRoot)) return;
    let names: string[] = [];
    try {
      names = readdirSync(options.historyRoot);
    } catch {
      return;
    }
    for (const name of names) {
      const metaPath = join(options.historyRoot, name, "metadata.json");
      if (!existsSync(metaPath)) continue;
      let summary: TerminalExecutionSummary;
      try {
        const parsed: unknown = JSON.parse(readFileSync(metaPath, "utf8"));
        if (!isPersistedSummary(parsed)) continue;
        summary = parsed;
      } catch {
        continue;
      }
      const events = loadPersistedEvents(join(options.historyRoot, name, "events.ndjson"));
      const nextSequence = events.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
      let finalized = terminalExecutionIsFinal(summary.state);
      if (!finalized) {
        if (options.recoverLive?.(summary)) {
          summary = { ...summary, state: "running" };
        } else {
          summary = {
            ...summary,
            state: "lost",
            endedAt: summary.endedAt ?? now(),
          };
          finalized = true;
        }
      }
      const record: ExecutionRecord = {
        summary,
        events,
        nextSequence,
        finalized,
      };
      records.set(summary.executionId, record);
      persistMetadata(record);
    }
  }

  restoreFromDisk();

  async function startRecord(record: ExecutionRecord): Promise<void> {
    if (shouldAbortStart(record)) return;
    if (record.summary.state === "created") setState(record, "starting");
    if (shouldAbortStart(record)) return;
    if (record.summary.state === "starting") {
      setState(record, "running");
      record.summary.startedAt = now();
      emit(record, "started", { state: "running" });
    }
    if (shouldAbortStart(record)) return;
    try {
      await options.transport.start(
        snapshot(record),
        {
          onOutput(data) {
            if (record.finalized) return;
            emit(record, "output", { data });
          },
          onExit(exitCode, extras) {
            finalize(record, exitCode, extras);
          },
        },
        { envExtra: record.envExtra, captureStderr: record.captureStderr },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit(record, "output", { data: message });
      finalize(record, 1);
    }
  }

  return {
    async create(input, createOptions) {
      const executionId = generateId();
      const createdAt = now();
      const dir = historyDir(executionId);
      const summary: TerminalExecutionSummary = {
        executionId,
        origin: input.origin,
        state: createOptions?.start === false ? "created" : "starting",
        command: input.command,
        cwd: input.cwd,
        projectId: input.projectId,
        createdAt,
        chatTabId: input.chatTabId,
        opencodeSessionId: input.opencodeSessionId,
        toolCallId: input.toolCallId,
        experimentId: input.experimentId,
        runId: input.runId,
        transcriptPath: join(dir, "transcript.log"),
        eventsPath: join(dir, "events.ndjson"),
        transcriptTail: "",
      };
      const record: ExecutionRecord = {
        summary,
        events: [],
        nextSequence: 1,
        finalized: false,
        envExtra: input.envExtra,
        captureStderr: input.captureStderr,
      };
      records.set(executionId, record);
      persistMetadata(record);
      if (createOptions?.start !== false) {
        await startRecord(record);
      }
      return snapshot(record);
    },

    async start(executionId) {
      const record = records.get(executionId);
      if (!record) throw new Error(`execution_not_found:${executionId}`);
      await startRecord(record);
    },

    async reject(executionId, result) {
      const record = records.get(executionId);
      if (!record || record.finalized) return;
      if (result.output) emit(record, "output", { data: result.output });
      finalize(record, result.exitCode);
    },

    get(executionId) {
      const record = records.get(executionId);
      return record ? snapshot(record) : undefined;
    },

    findByToolCallId(toolCallId) {
      const key = (toolCallId || "").trim();
      if (!key) return undefined;
      let best: ExecutionRecord | undefined;
      for (const record of records.values()) {
        if (record.summary.toolCallId !== key) continue;
        if (!best) {
          best = record;
          continue;
        }
        const bestFinal = terminalExecutionIsFinal(best.summary.state);
        const nextFinal = terminalExecutionIsFinal(record.summary.state);
        if (bestFinal && !nextFinal) {
          best = record;
        } else if (bestFinal === nextFinal && record.summary.createdAt >= best.summary.createdAt) {
          best = record;
        }
      }
      return best ? snapshot(best) : undefined;
    },

    async replay(executionId, fromSequence) {
      const record = records.get(executionId);
      if (!record) {
        throw new Error(`execution_not_found:${executionId}`);
      }
      return {
        summary: snapshot(record),
        events: record.events.filter((event) => event.sequence > fromSequence),
      };
    },

    async cancel(executionId, reason) {
      const record = records.get(executionId);
      if (!record || record.finalized) return;
      if (record.summary.state === "running") {
        setState(record, "cancel-requested");
        emit(record, "cancel-requested", { state: "cancel-requested", data: reason });
        await options.transport.cancel(executionId, reason);
        return;
      }
      emit(record, "cancel-requested", { data: reason });
      finalize(record, 130);
    },

    async cancelForChat(chatTabId) {
      const targets = [...records.values()].filter(
        (record) =>
          record.summary.chatTabId === chatTabId
          && record.summary.origin === "agent-bash"
          && !terminalExecutionIsFinal(record.summary.state),
      );
      for (const record of targets) {
        await this.cancel(record.summary.executionId, "chat-stop");
      }
    },

    async applyProjectSwitch(projectId, options) {
      const stopIds = new Set(options?.stopExperimentIds ?? []);
      const targets = [...records.values()].filter((record) => {
        if (record.summary.projectId !== projectId) return false;
        if (terminalExecutionIsFinal(record.summary.state)) return false;
        if (record.summary.origin === "agent-bash" || record.summary.origin === "user-task") {
          return true;
        }
        return record.summary.origin === "experiment-run" && stopIds.has(record.summary.executionId);
      });
      for (const record of targets) {
        await this.cancel(record.summary.executionId, "project-close");
      }
    },

    async finalizeForQuit() {
      const targets = [...records.values()].filter(
        (record) => !terminalExecutionIsFinal(record.summary.state),
      );
      for (const record of targets) {
        await this.cancel(record.summary.executionId, "app-quit");
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    listRunning(projectId) {
      return [...records.values()]
        .filter((record) => !terminalExecutionIsFinal(record.summary.state))
        .filter((record) => !projectId || record.summary.projectId === projectId)
        .map(snapshot);
    },

    waitForFinal(executionId) {
      const record = records.get(executionId);
      if (!record) {
        return Promise.reject(new Error(`execution_not_found:${executionId}`));
      }
      if (record.finalized) {
        return Promise.resolve(snapshot(record));
      }
      return new Promise((resolve) => {
        const unsubscribe = this.subscribe((event) => {
          if (event.executionId !== executionId || event.type !== "exited") return;
          unsubscribe();
          resolve(snapshot(record));
        });
      });
    },
  };
}

export function createAiPtyExecutionTransport(): ExecutionTransport {
  const sessionByExecution = new Map<string, string>();
  return {
    async start(execution, handlers, context) {
      const { runAiCommand } = await import("./ai-pty");
      const sessionId = execution.opencodeSessionId ?? execution.executionId;
      sessionByExecution.set(execution.executionId, sessionId);
      void runAiCommand({
        command: execution.command,
        cwd: execution.cwd,
        sessionId,
        chatTabId: execution.chatTabId ?? "",
        requestId: execution.executionId,
        toolCallId: execution.toolCallId,
        envExtra: context?.envExtra,
        captureStderr: context?.captureStderr,
        onChunk: (chunk) => handlers.onOutput(chunk),
      }).then(
        (result) => handlers.onExit(result.exitCode, { stderr: result.stderr }),
        (err) => {
          const message = err instanceof Error ? err.message : String(err);
          handlers.onOutput(message);
          handlers.onExit(1);
        },
      );
    },
    async cancel(executionId) {
      const { cancelAiCommandForSession } = await import("./ai-pty");
      cancelAiCommandForSession(sessionByExecution.get(executionId) ?? executionId);
    },
  };
}

let singleton: ExecutionRegistry | undefined;

export function initExecutionRegistry(
  historyRoot: string,
  transport = createAiPtyExecutionTransport(),
  extras?: Pick<ExecutionRegistryOptions, "recoverLive">,
): ExecutionRegistry {
  singleton = createExecutionRegistry({ transport, historyRoot, ...extras });
  return singleton;
}

export function getExecutionRegistry(): ExecutionRegistry {
  if (!singleton) {
    throw new Error("ExecutionRegistry is not initialized");
  }
  return singleton;
}

export function ensureExecutionRegistry(historyRoot?: string): ExecutionRegistry {
  try {
    return getExecutionRegistry();
  } catch {
    return initExecutionRegistry(
      historyRoot
        ?? process.env.PRISM_EXECUTION_HISTORY_ROOT
        ?? join(tmpdir(), "prism-execution-history"),
    );
  }
}

export function _resetExecutionRegistryForTests(): void {
  singleton = undefined;
}
