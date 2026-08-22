/**
 * OpenCode built-in Task subagents — not prismnext experts.
 * Orchestrator may call open built-ins (general/explore/command/scout) and experts;
 * reserved plan/build stay denied on orchestrator sessions.
 */

import { formatTaskError, type TaskErrorCode } from "../../shared/agent/task-error-codes";
export const OPEN_BUILTIN_TASK_SUBAGENTS = [
  "general",
  "explore",
  "command",
  "scout",
] as const;

export const RESERVED_TASK_SUBAGENTS = ["plan", "build"] as const;

export const OPENCODE_BUILTIN_TASK_SUBAGENTS = [
  ...OPEN_BUILTIN_TASK_SUBAGENTS,
  ...RESERVED_TASK_SUBAGENTS,
] as const;

export type OpencodeBuiltinTaskSubagent = (typeof OPENCODE_BUILTIN_TASK_SUBAGENTS)[number];

const BUILTIN_SET = new Set<string>(OPENCODE_BUILTIN_TASK_SUBAGENTS);

export function normalizeTaskSubagentId(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim().replace(/^@/, "").toLowerCase();
}

function readTaskInput(params: Record<string, unknown>): Record<string, unknown> | null {
  const tc = (params.toolCall ?? params.tool_call) as Record<string, unknown> | undefined;
  const candidates = [
    tc?.input,
    tc?.arguments,
    tc?.args,
    params.input,
    params.arguments,
    params.args,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      return c as Record<string, unknown>;
    }
  }
  return null;
}

/** Extract Task subagent id from an ACP permission payload (when present). */
export function extractTaskSubagentType(params: Record<string, unknown>): string | null {
  const input = readTaskInput(params);
  if (!input) return null;
  return normalizeTaskSubagentId(
    input.subagent_type ?? input.subagentType ?? input.agent,
  );
}

export function isOpencodeBuiltinTaskSubagent(subagentId: string): boolean {
  return BUILTIN_SET.has(subagentId.toLowerCase());
}

/**
 * Deny Task → reserved OpenCode subagents (plan/build) on primary orchestrator sessions.
 *
 * When `subagentId` is missing, do **not** deny here. OpenCode often asks ACP
 * permission before `subagent_type` is visible on the payload (empty rawInput);
 * false-denying that case kills legitimate Expert Tasks (e.g. research-design-coach).
 */
export function shouldDenyReservedTaskSubagent(
  subagentId: string | null | undefined,
): boolean {
  if (!subagentId) return false;
  const id = normalizeTaskSubagentId(subagentId);
  return id === "plan" || id === "build";
}

/**
 * When the user @-mentioned experts, Task may only target those ids this turn.
 * Missing / placeholder `subagentId` (`expert`) → do not deny (type not visible yet).
 * Main-agent platform tools are unaffected — this gates Task targets only.
 */
export function shouldDenyOutsideTaskAllowlist(
  allowlist: readonly string[] | null | undefined,
  subagentId: string | null | undefined,
): boolean {
  if (!allowlist?.length) return false;
  const id = normalizeTaskSubagentId(subagentId);
  if (!id || id === "expert") return false;
  const allowed = new Set(
    allowlist
      .map((r) => normalizeTaskSubagentId(r))
      .filter((r): r is string => !!r),
  );
  return !allowed.has(id);
}

/**
 * Pure Task permission denial resolver for ACP `requestPermission`.
 * Order: nested → reserved plan/build → @ Task allowlist → allow.
 *
 * Plan session mode may Task explore/experts like Build; only OpenCode
 * reserved subtypes `@plan` / `@build` stay denied (name clash with Prism modes).
 */
export function resolveTaskPermissionDenial(args: {
  isSubAgentSession: boolean;
  subagentId: string | null;
  sessionAgent: "build" | "plan";
  /** Composer @ ids for this turn; empty/absent = no Task-target restriction. */
  taskAllowlist?: readonly string[] | null;
}): { code: TaskErrorCode; message: string } | null {
  if (args.isSubAgentSession) {
    return {
      code: "nested_task_denied",
      message: formatTaskError("nested_task_denied"),
    };
  }
  if (shouldDenyReservedTaskSubagent(args.subagentId)) {
    return {
      code: "reserved_subagent_denied",
      message: formatTaskError("reserved_subagent_denied", { subagentId: args.subagentId }),
    };
  }
  if (shouldDenyOutsideTaskAllowlist(args.taskAllowlist, args.subagentId)) {
    return {
      code: "task_allowlist_denied",
      message: formatTaskError("task_allowlist_denied", {
        subagentId: args.subagentId,
        allowlist: args.taskAllowlist,
      }),
    };
  }
  return null;
}

/**
 * @deprecated Use `shouldDenyReservedTaskSubagent` — open built-ins are allowed now.
 */
export function shouldDenyOrchestratorBuiltinTask(
  subagentId: string | null | undefined,
): boolean {
  return shouldDenyReservedTaskSubagent(subagentId);
}

export {
  formatExpertTaskCancelledMessage,
  formatOrchestratorBuiltinTaskDeniedMessage,
  formatPlanModeExpertTaskDeniedMessage,
  isOpaqueTaskCancelledResult,
  resolveOpaqueTaskCancelledDisplay,
} from "../../shared/agent/task-deny-message";

/** Orchestrator Task allowlist — deny wildcard + reserved; allow open built-ins + experts. */
export function buildTaskPermissionBlock(allowedExpertIds: string[]): Record<string, string> {
  const rules: Record<string, string> = { "*": "deny" };
  for (const id of OPEN_BUILTIN_TASK_SUBAGENTS) rules[id] = "allow";
  for (const id of RESERVED_TASK_SUBAGENTS) rules[id] = "deny";
  for (const id of allowedExpertIds) rules[id] = "allow";
  return rules;
}
