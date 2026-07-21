/**
 * Shared copy when Task is rejected or OpenCode returns opaque "Task cancelled".
 * Used by main (ACP reject) and renderer (display rewrite).
 */

/** OpenCode built-in Task subagents — keep in sync with task-orchestrator-gate. */
const OPENCODE_BUILTIN_TASK_SUBAGENTS = new Set([
  "general",
  "explore",
  "command",
  "plan",
  "build",
  "scout",
]);

function normalizeSubagentId(subagentId: string | null | undefined): string {
  if (!subagentId?.trim()) return "general";
  return subagentId.trim().replace(/^@/, "").toLowerCase();
}

function isBuiltinTaskSubagent(id: string): boolean {
  return OPENCODE_BUILTIN_TASK_SUBAGENTS.has(id);
}

/** User-visible error when ACP rejects a builtin Task — not a manual cancel. */
export function formatOrchestratorBuiltinTaskDeniedMessage(
  subagentId: string | null | undefined,
): string {
  const id = normalizeSubagentId(subagentId);
  return (
    `Built-in Task @${id} is disabled on the orchestrator (this is not a user cancel). ` +
    "Call platform tools directly in this conversation — e.g. literature-stage after Paper Search MCP, " +
    "literature-search, or citation-health. Do not use Task/@Explore to read OpenCode tool-output files."
  );
}

/**
 * Plan mode clears the expert orchestrator — Expert Task cannot run.
 * Prefer this over the builtin-disabled copy (experts are not OpenCode built-ins).
 */
export function formatPlanModeExpertTaskDeniedMessage(
  subagentId: string | null | undefined,
): string {
  const id = normalizeSubagentId(subagentId);
  return (
    `Plan mode cannot run Expert Task @${id} (this is not a user cancel). ` +
    "Plan clears the expert orchestrator for this tab — switch to Build to delegate experts, " +
    "or continue in this conversation with platform tools (e.g. research-brief-read / research-brief-update) " +
    "and write the plan draft yourself."
  );
}

/**
 * Expert Task failed with opaque OpenCode cancel — do NOT claim "builtin disabled".
 */
export function formatExpertTaskCancelledMessage(
  subagentId: string | null | undefined,
): string {
  const id = normalizeSubagentId(subagentId);
  return (
    `Task @${id} was cancelled before the expert finished (this is not a user cancel). ` +
    "If this tab is in Plan mode, switch to Build and retry — Plan clears the expert orchestrator. " +
    "Otherwise retry the Task, or continue with platform tools directly in this conversation."
  );
}

/**
 * Rewrite opaque `{"error":"Task cancelled"}` for the UI.
 * Built-ins → orchestrator disable copy; Prism experts / other ids → expert cancel copy.
 */
export function resolveOpaqueTaskCancelledDisplay(
  subagentId: string | null | undefined,
): string {
  const id = normalizeSubagentId(subagentId);
  if (!subagentId?.trim() || isBuiltinTaskSubagent(id)) {
    return formatOrchestratorBuiltinTaskDeniedMessage(id);
  }
  return formatExpertTaskCancelledMessage(id);
}

/** OpenCode often returns only this JSON after we reject Task permission. */
export function isOpaqueTaskCancelledResult(content: unknown): boolean {
  const raw =
    typeof content === "string"
      ? content.trim()
      : content == null
        ? ""
        : JSON.stringify(content);
  if (!raw) return false;
  if (/^task cancelled\.?$/i.test(raw)) return true;
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    return typeof parsed?.error === "string" && /task cancelled/i.test(parsed.error);
  } catch {
    return /["']error["']\s*:\s*["']Task cancelled["']/i.test(raw);
  }
}
