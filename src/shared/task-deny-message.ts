/**
 * Shared copy when Task is rejected or OpenCode returns opaque "Task cancelled".
 * Used by main (ACP reject) and renderer (display rewrite).
 */

import { formatTaskError } from "./task-error-codes";

function normalizeSubagentId(subagentId: string | null | undefined): string {
  if (!subagentId?.trim()) return "general";
  return subagentId.trim().replace(/^@/, "").toLowerCase();
}

/** Reserved OpenCode subagents (plan/build) denied on orchestrator sessions. */
export function formatReservedTaskSubagentDeniedMessage(
  subagentId: string | null | undefined,
): string {
  return formatTaskError("reserved_subagent_denied", { subagentId });
}

/**
 * @deprecated Use {@link formatReservedTaskSubagentDeniedMessage} for plan/build denies.
 * Kept for ACP callers that still import this name.
 */
export function formatOrchestratorBuiltinTaskDeniedMessage(
  subagentId: string | null | undefined,
): string {
  return formatReservedTaskSubagentDeniedMessage(subagentId);
}

/**
 * Plan mode clears the expert orchestrator — Expert Task cannot run.
 * Prefer this over the reserved-subagent copy (experts are not OpenCode built-ins).
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
 * @deprecated Prefer {@link formatTaskError} with `opencode_cancelled`.
 */
export function formatExpertTaskCancelledMessage(
  subagentId: string | null | undefined,
): string {
  return formatTaskError("opencode_cancelled", { subagentId });
}

/**
 * Rewrite opaque `{"error":"Task cancelled"}` for the UI.
 * Always uses structured opencode_cancelled — no "builtin disabled" for open built-ins.
 */
export function resolveOpaqueTaskCancelledDisplay(
  subagentId: string | null | undefined,
): string {
  return formatTaskError("opencode_cancelled", { subagentId });
}

/** Exact opaque OpenCode cancel only — do not swallow richer provider errors. */
function isExactTaskCancelledPhrase(value: string): boolean {
  return /^task cancelled\.?$/i.test(value.trim());
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
  if (isExactTaskCancelledPhrase(raw)) return true;
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    return typeof parsed?.error === "string" && isExactTaskCancelledPhrase(parsed.error);
  } catch {
    // Only the exact opaque JSON shape — not substrings inside longer errors.
    return /^\s*\{\s*"error"\s*:\s*"Task cancelled"\s*\}\s*$/i.test(raw);
  }
}

export { formatTaskError, type TaskErrorCode } from "./task-error-codes";
