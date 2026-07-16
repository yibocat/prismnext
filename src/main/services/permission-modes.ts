import {
  buildPermissionRulesForMode,
  getToolPermissionEntry,
} from "./tool-permission-registry";

/**
 * Chat permission modes (Prism):
 * - ask: prompt for edits + shell
 * - edit_auto: allow file edits; still ask for shell / destructive (legacy "Auto")
 * - auto: OpenCode-style full auto-approve (all non-deny tools run without prompts)
 * - readonly: block edits + shell
 */
export type PermissionMode = "ask" | "edit_auto" | "auto" | "readonly";

export type OpenCodePermissionRule = "allow" | "ask" | "deny";

export const DEFAULT_PERMISSION_MODE: PermissionMode = "ask";

/** Bump when mode semantics change; used to migrate stored settings once. */
export const PERMISSION_MODE_SCHEMA_VERSION = 2;

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
    description:
      "Prompt before editing files or running shell commands. Shell runs in the PTY terminal only after you Allow.",
  },
  {
    value: "edit_auto",
    label: "Edit auto",
    shortLabel: "Edit",
    description:
      "Allow file edits automatically; still ask for shell and destructive operations. Shell uses PTY after Allow.",
  },
  {
    value: "auto",
    label: "Auto",
    shortLabel: "Auto",
    description:
      "Fully automatic — approve edits, shell, and other tools without prompting (same idea as OpenCode --auto). Explicit denials still apply.",
  },
  {
    value: "readonly",
    label: "Read-only",
    shortLabel: "Read",
    description:
      "Only read and search — block edits and shell commands. Mirror terminal mode is available in advanced settings.",
  },
];

export function resolvePermissionMode(mode?: string | null): PermissionMode {
  if (mode === "auto" || mode === "edit_auto" || mode === "readonly") return mode;
  return DEFAULT_PERMISSION_MODE;
}

/**
 * One-shot migration: before schema v2, stored `"auto"` meant today's `edit_auto`.
 * Returns the mode to persist (may differ from input).
 */
export function migratePermissionModeSetting(
  mode: string | undefined | null,
  schemaVersion: number | undefined | null,
): { mode: PermissionMode; schemaVersion: number; changed: boolean } {
  const version = typeof schemaVersion === "number" ? schemaVersion : 1;
  if (version >= PERMISSION_MODE_SCHEMA_VERSION) {
    return { mode: resolvePermissionMode(mode), schemaVersion: version, changed: false };
  }
  // v1 → v2: rename legacy auto → edit_auto
  if (mode === "auto") {
    return {
      mode: "edit_auto",
      schemaVersion: PERMISSION_MODE_SCHEMA_VERSION,
      changed: true,
    };
  }
  return {
    mode: resolvePermissionMode(mode),
    schemaVersion: PERMISSION_MODE_SCHEMA_VERSION,
    changed: version !== PERMISSION_MODE_SCHEMA_VERSION,
  };
}

/** Ask / Edit auto need Prism PTY bash so shell runs only after UI approval. */
export function resolveEffectiveAgentTerminalMode(
  permissionMode: PermissionMode | string | undefined,
  agentTerminalMode: string | undefined,
): "pty" | "mirror" {
  const perm = resolvePermissionMode(permissionMode);
  if (perm === "ask" || perm === "edit_auto") return "pty";
  return agentTerminalMode === "mirror" ? "mirror" : "pty";
}

/** OpenCode `permission` block for each chat permission mode. */
export function getPermissionRulesForMode(
  mode: PermissionMode,
): Record<string, OpenCodePermissionRule> {
  return buildPermissionRulesForMode(mode);
}

/** Resolve the effective permission rule for a tool under the given mode. */
export function getPermissionRuleForTool(
  mode: PermissionMode,
  toolName: string,
): OpenCodePermissionRule | undefined {
  const entry = getToolPermissionEntry(toolName);
  if (entry) return entry.rules[mode];
  const key = toolName.toLowerCase();
  const rules = getPermissionRulesForMode(mode);
  if (key in rules) return rules[key];
  return undefined;
}

const READ_ONLY_TOOLS = new Set(["read", "grep", "glob"]);

function isReadOnlyToolName(toolName: string): boolean {
  const key = toolName.toLowerCase();
  if (READ_ONLY_TOOLS.has(key)) return true;
  return key.startsWith("lsp");
}

/** Extract tool name from an ACP/OpenCode permission request payload. */
export function extractPermissionToolName(params: Record<string, unknown>): string {
  const tc = (params.toolCall ?? params.tool_call) as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    params.toolName,
    params.tool_name,
    params.tool,
    params.name,
    params.title,
    params.kind,
    params.permission,
    params.permissionType,
    params.type,
    tc?.toolName,
    tc?.tool_name,
    tc?.tool,
    tc?.name,
    tc?.title,
    tc?.kind,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const normalized = c.trim().toLowerCase();
      if (normalized === "execute" || normalized === "terminal") return "bash";
      if (normalized !== "task") return normalized;
    }
  }
  const msg = String(params.message ?? params.title ?? tc?.title ?? "").toLowerCase();
  if (/\bdelete\b/.test(msg)) return "delete";
  if (/\bmove\b/.test(msg)) return "move";
  if (/\b(bash|shell|terminal|command)\b/.test(msg)) return "bash";
  if (/\b(rm\b|mv\b|cp\b|chmod\b|git\s)/.test(msg)) return "bash";
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

  // OpenCode --auto: approve anything that is not explicitly denied.
  if (mode === "auto") {
    if (isReadOnlyToolName(toolName)) return "allow";
    return "allow";
  }

  if (mode === "edit_auto") {
    if (toolName === "bash" || /bash|shell|terminal|command/.test(toolName)) return "prompt";
    if (isReadOnlyToolName(toolName)) return "allow";
    return "deny";
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

/** Modes that auto-apply disk mutations without a proposed-change review. */
export function isEditAutoApplyMode(mode: PermissionMode | string | undefined): boolean {
  const m = resolvePermissionMode(mode);
  return m === "auto" || m === "edit_auto";
}
