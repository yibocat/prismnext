/**
 * Cross-process contracts for the unified terminal Execution control plane.
 * Keep Electron and node-pty types out of this file.
 */

export type TerminalExecutionOrigin = "agent-bash" | "experiment-run" | "user-task";

export type TerminalExecutionState =
  | "created"
  | "awaiting-permission"
  | "queued"
  | "starting"
  | "running"
  | "cancel-requested"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed-out"
  | "lost";

export const TERMINAL_EXECUTION_STATES = [
  "created",
  "awaiting-permission",
  "queued",
  "starting",
  "running",
  "cancel-requested",
  "completed",
  "failed",
  "cancelled",
  "timed-out",
  "lost",
] as const satisfies readonly TerminalExecutionState[];

export const TERMINAL_EXECUTION_FINAL_STATES = [
  "completed",
  "failed",
  "cancelled",
  "timed-out",
  "lost",
] as const satisfies readonly TerminalExecutionState[];

const TERMINAL_EXECUTION_STATE_SET = new Set<string>(TERMINAL_EXECUTION_STATES);
const TERMINAL_EXECUTION_FINAL_SET = new Set<string>(TERMINAL_EXECUTION_FINAL_STATES);

export function isTerminalExecutionState(value: unknown): value is TerminalExecutionState {
  return typeof value === "string" && TERMINAL_EXECUTION_STATE_SET.has(value);
}

export function terminalExecutionIsFinal(state: TerminalExecutionState): boolean {
  return TERMINAL_EXECUTION_FINAL_SET.has(state);
}

/** Chat bash belongs to one conversation window. Experiment runs stay per-job. */
export function isChatScopedExecution(
  summary: Pick<TerminalExecutionSummary, "origin" | "chatTabId">,
): boolean {
  const chatTabId = (summary.chatTabId || "").trim();
  return summary.origin === "agent-bash" && chatTabId.length > 0 && chatTabId !== "experiment";
}

export type TerminalExecutionEventType =
  | "created"
  | "permission"
  | "started"
  | "output"
  | "cancel-requested"
  | "exited";

export interface TerminalExecutionEvent {
  executionId: string;
  sequence: number;
  type: TerminalExecutionEventType;
  at: number;
  data?: string;
  exitCode?: number;
  state?: TerminalExecutionState;
}

export interface TerminalExecutionSummary {
  executionId: string;
  origin: TerminalExecutionOrigin;
  state: TerminalExecutionState;
  command: string;
  cwd: string;
  projectId: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number | null;
  chatTabId?: string;
  opencodeSessionId?: string;
  toolCallId?: string;
  experimentId?: string;
  runId?: string;
  transcriptPath?: string;
  eventsPath?: string;
  stderrPath?: string;
  transcriptTail?: string;
  /** Captured command stderr (tee file), when the transport requested it. */
  stderrTail?: string;
}

/** @deprecated Use TerminalExecutionSummary. Kept as a short alias for call sites. */
export type ExecutionSummary = TerminalExecutionSummary;
/** @deprecated Use TerminalExecutionEvent. */
export type ExecutionEvent = TerminalExecutionEvent;

export interface ExecutionReplayArgs {
  executionId: string;
  fromSequence: number;
}

export type ExecutionGetResult =
  | { ok: true; summary: TerminalExecutionSummary }
  | { ok: false; error: string };

export type ExecutionFindByToolCallIdResult =
  | { ok: true; summary: TerminalExecutionSummary }
  | { ok: false; error: string };

export type ExecutionReplayResult =
  | { ok: true; summary: TerminalExecutionSummary; events: TerminalExecutionEvent[] }
  | { ok: false; error: string };

export type ExecutionCancelResult =
  | { ok: true }
  | { ok: false; error: string };

export type ExecutionRerunResult =
  | { ok: true; executionId: string }
  | { ok: false; error: string };

export type ExecutionListRunningResult =
  | { ok: true; summaries: TerminalExecutionSummary[] }
  | { ok: false; error: string };

export interface ExecutionApplyProjectSwitchArgs {
  projectId: string;
  stopExperimentIds?: string[];
}

export type ExecutionApplyProjectSwitchResult =
  | { ok: true }
  | { ok: false; error: string };

export const DEFAULT_TERMINAL_EXECUTION_SETTINGS = {
  jobMonitorAutoOpen: true,
  jobMonitorCloseCancels: false,
  jobMonitorKeepFinishedMs: 60_000,
  jobMonitorIdleCloseMs: 600_000,
} as const;

export interface TerminalExecutionSettings {
  jobMonitorAutoOpen: boolean;
  jobMonitorCloseCancels: boolean;
  jobMonitorKeepFinishedMs: number;
  jobMonitorIdleCloseMs: number;
}

/** New Job Monitor keys plus legacy AI-terminal aliases used during migration. */
export interface TerminalExecutionSettingsInput {
  jobMonitorAutoOpen?: boolean;
  jobMonitorCloseCancels?: boolean;
  jobMonitorKeepFinishedMs?: number;
  jobMonitorIdleCloseMs?: number;
  aiTerminalAutoOpen?: boolean;
  aiTerminalCloseTabKillsProcess?: boolean;
  aiTerminalPostExitGraceMs?: number;
  aiTerminalIdleCloseMs?: number;
}

export function toTerminalExecutionSettingsPatch(
  next: Partial<TerminalExecutionSettings>,
  current?: TerminalExecutionSettingsInput | null,
): TerminalExecutionSettings & {
  aiTerminalAutoOpen: boolean;
  aiTerminalCloseTabKillsProcess: boolean;
  aiTerminalPostExitGraceMs: number;
  aiTerminalIdleCloseMs: number;
} {
  const resolved = resolveTerminalExecutionSettings({ ...current, ...next });
  return {
    ...resolved,
    aiTerminalAutoOpen: resolved.jobMonitorAutoOpen,
    aiTerminalCloseTabKillsProcess: resolved.jobMonitorCloseCancels,
    aiTerminalPostExitGraceMs: resolved.jobMonitorKeepFinishedMs,
    aiTerminalIdleCloseMs: resolved.jobMonitorIdleCloseMs,
  };
}

export function resolveTerminalExecutionSettings(
  raw?: TerminalExecutionSettingsInput | null,
): TerminalExecutionSettings {
  return {
    jobMonitorAutoOpen: pickBoolean(
      raw?.jobMonitorAutoOpen,
      raw?.aiTerminalAutoOpen,
      DEFAULT_TERMINAL_EXECUTION_SETTINGS.jobMonitorAutoOpen,
    ),
    jobMonitorCloseCancels: pickBoolean(
      raw?.jobMonitorCloseCancels,
      raw?.aiTerminalCloseTabKillsProcess,
      DEFAULT_TERMINAL_EXECUTION_SETTINGS.jobMonitorCloseCancels,
    ),
    jobMonitorKeepFinishedMs: pickNumber(
      raw?.jobMonitorKeepFinishedMs,
      raw?.aiTerminalPostExitGraceMs,
      DEFAULT_TERMINAL_EXECUTION_SETTINGS.jobMonitorKeepFinishedMs,
    ),
    jobMonitorIdleCloseMs: pickNumber(
      raw?.jobMonitorIdleCloseMs,
      raw?.aiTerminalIdleCloseMs,
      DEFAULT_TERMINAL_EXECUTION_SETTINGS.jobMonitorIdleCloseMs,
    ),
  };
}

function pickBoolean(
  primary: boolean | undefined,
  legacy: boolean | undefined,
  fallback: boolean,
): boolean {
  if (typeof primary === "boolean") return primary;
  if (typeof legacy === "boolean") return legacy;
  return fallback;
}

function pickNumber(
  primary: number | undefined,
  legacy: number | undefined,
  fallback: number,
): number {
  if (typeof primary === "number" && Number.isFinite(primary)) return primary;
  if (typeof legacy === "number" && Number.isFinite(legacy)) return legacy;
  return fallback;
}
