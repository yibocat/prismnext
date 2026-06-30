import type { OpenCodePermissionRule, PermissionMode } from "./permission-modes";

export type PermissionConfirmUx = "diff" | "command" | "patch" | "inline" | "none";

export type PermissionGroup =
  | "file_write"
  | "shell"
  | "patch"
  | "read"
  | "network"
  | "interactive";

export interface ToolPermissionEntry {
  permissionGroup?: PermissionGroup;
  confirmUx: PermissionConfirmUx;
  usesProposedChange?: boolean;
  diskMutation?: boolean;
  rules: Record<PermissionMode, OpenCodePermissionRule>;
}

const FILE_MUTATION: Record<PermissionMode, OpenCodePermissionRule> = {
  ask: "ask",
  auto: "allow",
  readonly: "deny",
};

const SHELL: Record<PermissionMode, OpenCodePermissionRule> = {
  ask: "ask",
  auto: "ask",
  readonly: "deny",
};

const DESTRUCTIVE: Record<PermissionMode, OpenCodePermissionRule> = {
  ask: "ask",
  auto: "ask",
  readonly: "deny",
};

const READ_ONLY: Record<PermissionMode, OpenCodePermissionRule> = {
  ask: "allow",
  auto: "allow",
  readonly: "allow",
};

/**
 * Single source of truth for tool permission rules + UI metadata.
 *
 * Only tools that actually exist in OpenCode (built-in or Prism custom) are
 * listed here.  See https://opencode.ai/docs/tools/ and
 * https://opencode.ai/docs/permissions/ for the authoritative list.
 *
 * Prism custom tools (`delete`, `move`) use destructive rules. Like custom
 * `bash`, OpenCode may invoke `execute()` before ACP `requestPermission`;
 * tools poll the file bridge and main process syncs the gate from tool_call.
 */
export const TOOL_PERMISSION_REGISTRY: Record<string, ToolPermissionEntry> = {
  edit: { permissionGroup: "file_write", confirmUx: "diff", diskMutation: true, rules: FILE_MUTATION },
  write: { permissionGroup: "file_write", confirmUx: "diff", diskMutation: true, rules: FILE_MUTATION },
  apply_patch: { permissionGroup: "patch", confirmUx: "patch", diskMutation: true, rules: FILE_MUTATION },
  delete: { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: DESTRUCTIVE },
  move: { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: DESTRUCTIVE },
  bash: { permissionGroup: "shell", confirmUx: "command", rules: SHELL },
  read: { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  grep: { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  glob: { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  webfetch: { permissionGroup: "network", confirmUx: "none", rules: READ_ONLY },
  websearch: { permissionGroup: "network", confirmUx: "none", rules: READ_ONLY },
  question: { permissionGroup: "interactive", confirmUx: "none", rules: READ_ONLY },
  task: { confirmUx: "none", rules: READ_ONLY },
  skill: { confirmUx: "none", rules: READ_ONLY },
  todowrite: { confirmUx: "none", rules: READ_ONLY },
  "literature-search": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "literature-read": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "literature-stage": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "literature-add": { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: FILE_MUTATION },
  "literature-cite": { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: FILE_MUTATION },
};

export function getToolPermissionEntry(toolName: string): ToolPermissionEntry | undefined {
  const key = toolName.toLowerCase();
  if (TOOL_PERMISSION_REGISTRY[key]) return TOOL_PERMISSION_REGISTRY[key];
  if (key.startsWith("write")) return TOOL_PERMISSION_REGISTRY.write;
  if (key.startsWith("edit")) return TOOL_PERMISSION_REGISTRY.edit;
  if (key.startsWith("apply_patch")) return TOOL_PERMISSION_REGISTRY.apply_patch;
  if (key.startsWith("lsp")) {
    return { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY };
  }
  return undefined;
}

export function buildPermissionRulesForMode(
  mode: PermissionMode,
): Record<string, OpenCodePermissionRule> {
  const rules: Record<string, OpenCodePermissionRule> = {};
  for (const [tool, entry] of Object.entries(TOOL_PERMISSION_REGISTRY)) {
    rules[tool] = entry.rules[mode];
  }
  return rules;
}
