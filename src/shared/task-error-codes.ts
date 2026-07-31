/**
 * Structured Task error codes — single source for deny/cancel copy.
 * English source strings; renderer i18n wraps where needed.
 */

export type TaskErrorCode =
  | "nested_task_denied"
  | "reserved_subagent_denied"
  | "task_allowlist_denied"
  | "task_allowlist_not_invoked"
  | "link_degraded"
  | "await_timeout"
  | "abort_failed"
  | "superseded"
  | "user_cancel"
  | "opencode_cancelled";

function normalizeSubagentId(subagentId: string | null | undefined): string {
  if (!subagentId?.trim()) return "general";
  return subagentId.trim().replace(/^@/, "").toLowerCase();
}

function formatAllowlist(allowlist?: readonly string[] | null): string {
  const ids = (allowlist ?? [])
    .map((r) => normalizeSubagentId(r))
    .filter(Boolean);
  if (ids.length === 0) return "(none)";
  return ids.map((id) => `@${id}`).join(", ");
}

export function formatTaskError(
  code: TaskErrorCode,
  opts?: {
    subagentId?: string | null;
    detail?: string;
    allowlist?: readonly string[] | null;
  },
): string {
  const id = normalizeSubagentId(opts?.subagentId);
  const detail = opts?.detail?.trim();
  const allowlistText = formatAllowlist(opts?.allowlist);

  switch (code) {
    case "nested_task_denied":
      return (
        "Nested Task is not allowed: subagents cannot call the Task tool. " +
        "Finish your work in this subagent session and return the result to the orchestrator. " +
        "The main agent may start another Task after you complete."
      );
    case "reserved_subagent_denied":
      return (
        `Task @${id} is not available on the orchestrator (this is not a user cancel). ` +
        "Reserved subagents @plan and @build run in dedicated modes — switch to Plan or Build, " +
        "or continue in this conversation with platform tools directly."
      );
    case "task_allowlist_denied":
      return (
        `Task @${id} is outside this turn's @ allowlist: ${allowlistText} ` +
        "(this is not a user cancel). Call Task only with those subagent_type values."
      );
    case "task_allowlist_not_invoked":
      return (
        "You are the orchestrator — not the @-mentioned subagents. " +
        `You did not Task: ${allowlistText}. ` +
        "Immediately call the Task tool once per missing id with subagent_type set to that id " +
        "and a focused sub-prompt for the user's request. Do not role-play as those experts or " +
        "do their specialty work only with platform tools in this turn."
      );
    case "link_degraded":
      return (
        `Task @${id} could not link to its sub-session in time (this is not a user cancel). ` +
        (detail ? `${detail} ` : "") +
        "Retry the Task, or continue with platform tools directly in this conversation."
      );
    case "await_timeout":
      return (
        `Task @${id} did not finish in time (this is not a user cancel). ` +
        "The sub-session may still be running — check recent output, retry the Task, " +
        "or continue with platform tools directly in this conversation."
      );
    case "abort_failed":
      return (
        `Could not stop Task @${id} (the sub-session abort did not settle). ` +
        (detail ? `${detail} ` : "") +
        "The expert may still be running — retry Stop, cancel the whole turn, " +
        "or continue with platform tools directly in this conversation."
      );
    case "superseded":
      return (
        `Task @${id} was superseded by a newer message (this is not a user cancel). ` +
        "Retry the Task if you still need that work, or continue in this conversation."
      );
    case "user_cancel":
      return (
        `The user stopped Task @${id} before it finished. ` +
        "Treat this Task as cancelled and continue — synthesize with what you have, " +
        "or call Task again only if that work is still required."
      );
    case "opencode_cancelled":
      return (
        `Task @${id} was cancelled before it finished (this is not a user cancel). ` +
        "Common causes: the sub-session never linked in time, a newer message superseded a pending Task, " +
        "or OpenCode rejected the Task permission. Retry the Task, or continue with platform tools directly in this conversation."
      );
  }
}
