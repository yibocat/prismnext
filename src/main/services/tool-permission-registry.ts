import type { PermissionRule, PermissionMode } from "./permission-modes";

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
  rules: Record<PermissionMode, PermissionRule>;
}

/** Ask + Edit auto ask; Auto allow; Read-only deny. */
const FILE_MUTATION: Record<PermissionMode, PermissionRule> = {
  ask: "ask",
  edit_auto: "allow",
  auto: "allow",
  readonly: "deny",
};

/** Ask + Edit auto ask; Auto allow (OpenCode --auto); Read-only deny. */
const SHELL: Record<PermissionMode, PermissionRule> = {
  ask: "ask",
  edit_auto: "ask",
  auto: "allow",
  readonly: "deny",
};

/** Destructive: still ask in Edit auto; allow in full Auto. */
const DESTRUCTIVE: Record<PermissionMode, PermissionRule> = {
  ask: "ask",
  edit_auto: "ask",
  auto: "allow",
  readonly: "deny",
};

const READ_ONLY: Record<PermissionMode, PermissionRule> = {
  ask: "allow",
  edit_auto: "allow",
  auto: "allow",
  readonly: "allow",
};

/**
 * Single source of truth for tool permission rules + UI metadata.
 *
 * Lists every prismnext host tool and the Pi primitives that need a rule row
 * (built-in or prismnext custom). Rules drive readonly-mode mapping and renderer
 * widget metadata; runtime gate decisions happen in PermissionGate + the shared
 * smart permission policy.
 *
 * prismnext custom tools (`delete`, `move`) use destructive rules.
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
  "literature-discover": { permissionGroup: "network", confirmUx: "none", rules: READ_ONLY },
  "literature-read": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "literature-read-pdf": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "literature-intensive-reading": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "literature-stage": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "literature-add": { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: FILE_MUTATION },
  "literature-delete": { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: DESTRUCTIVE },
  "citation-health": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "literature-export-bib": { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: FILE_MUTATION },
  "latex-root": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  // latex-compile spawns the project engine (tectonic / pdflatex / …) via compiler.ts
  // under `.prismnext/compile/` — follow SHELL rules; never run those engines via bash.
  "latex-compile": { permissionGroup: "shell", confirmUx: "none", rules: SHELL },
  "research-brief-read": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "research-brief-update": { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: FILE_MUTATION },
  "project-rule-write": { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: FILE_MUTATION },
  "suggest-plan": { permissionGroup: "interactive", confirmUx: "none", rules: READ_ONLY },
  "experiment-log": { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: FILE_MUTATION },
  // experiment-run spawns a PTY (subprocess) — must follow SHELL rules.
  "experiment-run": { permissionGroup: "shell", confirmUx: "command", rules: SHELL },
  "results-snapshot": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "provenance-query": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "interaction-list": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "interaction-read": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "interaction-write": { permissionGroup: "file_write", confirmUx: "inline", diskMutation: true, rules: FILE_MUTATION },
  "interaction-open": { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY },
  "image-describe": { permissionGroup: "network", confirmUx: "none", rules: READ_ONLY },
};

export function getToolPermissionEntry(toolName: string): ToolPermissionEntry | undefined {
  const key = toolName.toLowerCase();
  if (TOOL_PERMISSION_REGISTRY[key]) return TOOL_PERMISSION_REGISTRY[key];
  if (key.startsWith("write")) return TOOL_PERMISSION_REGISTRY.write;
  if (key.startsWith("edit")) return TOOL_PERMISSION_REGISTRY.edit;
  if (key.startsWith("apply_patch")) return TOOL_PERMISSION_REGISTRY.apply_patch;
  if (key.startsWith("lsp")) return TOOL_PERMISSION_REGISTRY.read;
  if (key.includes("bash") || key === "execute" || key === "terminal") {
    return TOOL_PERMISSION_REGISTRY.bash;
  }
  return undefined;
}

export function buildPermissionRulesForMode(
  mode: PermissionMode,
): Record<string, PermissionRule> {
  const out: Record<string, PermissionRule> = {};
  for (const [name, entry] of Object.entries(TOOL_PERMISSION_REGISTRY)) {
    out[name] = entry.rules[mode];
  }
  return out;
}
