/** AI terminal session lifecycle — phase machine + GC rules (Phase B). */

export type AiTerminalPhase = "idle" | "running" | "completed" | "dismissed";

/** AiTerminalView data source — live PTY stream vs mirror log replay. */
export type AiTerminalViewMode = "live" | "replay";

export interface AiTerminalSessionState {
  /** Mirror log key — OpenCode sessionId when bound, else provisional chatTabId. */
  sessionId: string;
  chatTabId: string;
  phase: AiTerminalPhase;
  activeToolCallId?: string;
  activeCommand?: string;
  startedAt?: number;
  exitedAt?: number;
  lastViewedAt: number;
  aiTabId?: string;
  pinned?: boolean;
}

export interface AiTerminalGcSettings {
  postExitGraceMs: number;
  idleCloseMs: number;
}

export const AI_TERMINAL_POST_EXIT_GRACE_MS_DEFAULT = 60_000;
export const AI_TERMINAL_IDLE_CLOSE_MS_DEFAULT = 600_000;
export const AI_TERMINAL_SWEEP_INTERVAL_MS = 30_000;

export function shouldGcAiTerminalTab(
  state: AiTerminalSessionState,
  now: number,
  activeOpenCodeSessionId: string | null,
  settings: AiTerminalGcSettings,
): boolean {
  if (state.phase !== "completed") return false;
  if (state.pinned) return false;
  if (!state.aiTabId) return false;
  if (activeOpenCodeSessionId && state.sessionId === activeOpenCodeSessionId) return false;
  if (state.exitedAt == null) return false;
  if (now - state.exitedAt < settings.postExitGraceMs) return false;
  if (now - state.lastViewedAt < settings.idleCloseMs) return false;
  return true;
}

export function formatAiTerminalStatus(state: AiTerminalSessionState | undefined): string | null {
  if (!state || state.phase === "idle") return null;
  if (state.phase === "running") {
    const cmd = state.activeCommand?.trim() || "shell command";
    const short = cmd.length > 48 ? `${cmd.slice(0, 48)}…` : cmd;
    return `Running — ${short}`;
  }
  if (state.phase === "completed") return "Idle — last command finished";
  if (state.phase === "dismissed") return "Terminal closed — output saved";
  return null;
}

/** PTY + running → live stream; everything else replays sessionMirrorLog. */
export function resolveAiTerminalViewMode(
  agentTerminalMode: "mirror" | "pty" | undefined,
  sessionPhase: AiTerminalPhase | undefined,
): AiTerminalViewMode {
  if (agentTerminalMode === "pty" && sessionPhase === "running") return "live";
  return "replay";
}

export function aiTabTitleWithPhase(baseTitle: string, phase: AiTerminalPhase | undefined): string {
  if (phase === "running" && !baseTitle.endsWith(" ●")) {
    return `${baseTitle} ●`;
  }
  return baseTitle.replace(/ ●$/, "");
}
