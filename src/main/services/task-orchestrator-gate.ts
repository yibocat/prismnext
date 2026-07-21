/**
 * OpenCode built-in Task subagents — not prismnext experts.
 * Orchestrator must call platform tools directly; Task is for allowlisted experts only.
 */

export const OPENCODE_BUILTIN_TASK_SUBAGENTS = [
  "general",
  "explore",
  "command",
  "plan",
  "build",
  "scout",
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
 * Deny Task → OpenCode built-in subagent on primary orchestrator sessions.
 *
 * When `subagentId` is missing, do **not** deny here. OpenCode often asks ACP
 * permission before `subagent_type` is visible on the payload (empty rawInput);
 * false-denying that case kills legitimate Expert Tasks (e.g. research-design-coach).
 * Built-ins without an explicit type still hit OpenCode `permission.task`
 * (`"*": deny` + `general: deny`) after ACP allows.
 */
export function shouldDenyOrchestratorBuiltinTask(
  subagentId: string | null | undefined,
): boolean {
  if (!subagentId) return false;
  return isOpencodeBuiltinTaskSubagent(subagentId);
}

export {
  formatExpertTaskCancelledMessage,
  formatOrchestratorBuiltinTaskDeniedMessage,
  formatPlanModeExpertTaskDeniedMessage,
  isOpaqueTaskCancelledResult,
  resolveOpaqueTaskCancelledDisplay,
} from "../../shared/task-deny-message";

/** Orchestrator Task allowlist — deny OpenCode built-ins + wildcard; allow prismnext experts only. */
export function buildTaskPermissionBlock(allowedExpertIds: string[]): Record<string, string> {
  const rules: Record<string, string> = { "*": "deny" };
  for (const id of OPENCODE_BUILTIN_TASK_SUBAGENTS) {
    rules[id] = "deny";
  }
  for (const id of allowedExpertIds) {
    rules[id] = "allow";
  }
  return rules;
}
