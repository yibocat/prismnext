export type PermissionMode = "ask" | "auto" | "readonly";

export type OpenCodePermissionRule = "allow" | "ask" | "deny";

export const DEFAULT_PERMISSION_MODE: PermissionMode = "ask";

export interface PermissionModeOption {
  value: PermissionMode;
  label: string;
  shortLabel: string;
  description: string;
}

export const PERMISSION_MODE_OPTIONS: PermissionModeOption[] = [
  {
    value: "ask",
    label: "Ask",
    shortLabel: "Ask",
    description: "Prompt before editing files or running shell commands",
  },
  {
    value: "auto",
    label: "Auto",
    shortLabel: "Auto",
    description: "Allow file edits automatically; still ask for shell commands",
  },
  {
    value: "readonly",
    label: "Read-only",
    shortLabel: "Read",
    description: "Only read and search — block edits and shell commands",
  },
];

export function resolvePermissionMode(mode?: string | null): PermissionMode {
  if (mode === "auto" || mode === "readonly") return mode;
  return DEFAULT_PERMISSION_MODE;
}

/** OpenCode `permission` block for each chat permission mode. */
export function getPermissionRulesForMode(
  mode: PermissionMode,
): Record<string, OpenCodePermissionRule> {
  switch (mode) {
    case "auto":
      return {
        edit: "allow",
        write: "allow",
        apply_patch: "allow",
        bash: "ask",
        webfetch: "allow",
        websearch: "allow",
        question: "allow",
        task: "allow",
        skill: "allow",
      };
    case "readonly":
      return {
        edit: "deny",
        write: "deny",
        apply_patch: "deny",
        bash: "deny",
        read: "allow",
        grep: "allow",
        glob: "allow",
        list: "allow",
        webfetch: "allow",
        websearch: "allow",
        question: "allow",
        task: "allow",
        skill: "allow",
        todowrite: "allow",
      };
    case "ask":
    default:
      return {
        edit: "ask",
        write: "ask",
        apply_patch: "ask",
        bash: "ask",
        read: "allow",
        grep: "allow",
        glob: "allow",
        list: "allow",
        webfetch: "allow",
        websearch: "allow",
        question: "allow",
        task: "allow",
        skill: "allow",
      };
  }
}

/** Resolve the effective permission rule for a tool under the given mode. */
export function getPermissionRuleForTool(
  mode: PermissionMode,
  toolName: string,
): OpenCodePermissionRule | undefined {
  const key = toolName.toLowerCase();
  const rules = getPermissionRulesForMode(mode);
  if (key in rules) return rules[key];
  if (key === "apply_patch" || key === "patch") return rules.apply_patch ?? rules.patch;
  return undefined;
}

/** Extract tool name from an ACP/OpenCode permission request payload. */
export function extractPermissionToolName(params: Record<string, unknown>): string {
  const tc = (params.toolCall ?? params.tool_call) as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    params.toolName,
    params.tool_name,
    params.tool,
    params.name,
    params.kind,
    params.permission,
    params.permissionType,
    params.type,
    tc?.toolName,
    tc?.tool_name,
    tc?.tool,
    tc?.name,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().toLowerCase();
  }
  const msg = String(params.message ?? params.title ?? "").toLowerCase();
  if (/\b(bash|shell|terminal|command)\b/.test(msg)) return "bash";
  if (/\b(edit|write|patch|apply_patch|file)\b/.test(msg)) return "edit";
  return "";
}

export type PermissionAction = "prompt" | "allow" | "deny";

/** Decide how to handle a permission request for the current mode. */
export function resolvePermissionAction(
  mode: PermissionMode,
  toolName: string,
): PermissionAction {
  const rule = getPermissionRuleForTool(mode, toolName);
  if (rule === "allow") return "allow";
  if (rule === "deny") return "deny";
  if (rule === "ask") return "prompt";
  // Unknown tool: in auto mode allow non-shell; in readonly deny destructive hints
  if (mode === "auto") {
    if (toolName === "bash" || /bash|shell|terminal|command/.test(toolName)) return "prompt";
    return "allow";
  }
  if (mode === "readonly") return "deny";
  return "prompt";
}

/** Whether the UI should prompt the user (OpenCode sent ask, or rule is ask). */
export function shouldPromptForPermission(
  mode: PermissionMode,
  toolName: string,
): boolean {
  return getPermissionRuleForTool(mode, toolName) === "ask";
}
