import {
  resolveEffectivePermissionRule,
  type SessionAgent,
} from "../../shared/session-agent";
import {
  buildPermissionRulesForMode as buildLegacyPermissionRulesForMode,
  getToolPermissionEntry,
} from "./tool-permission-registry";
import {
  buildSmartOpenCodePermissionRules,
  resolveSmartPermissionAction,
  type SmartPermissionContext,
  type PermissionRulesConfig,
  buildPermissionRulesConfig,
  emptyPermissionRulesConfig,
} from "../../shared/smart-permission-policy";

/**
 * Chat permission modes (prismnext):
 * - ask: prompt for edits + shell
 * - edit_auto: allow file edits; still ask for shell / destructive (legacy "Auto")
 * - auto: OpenCode-style full auto-approve (all non-deny tools run without prompts)
 * - readonly: block edits + shell
 */
export type PermissionMode = "ask" | "edit_auto" | "auto" | "readonly";

export type OpenCodePermissionRule = "allow" | "ask" | "deny";

export const DEFAULT_PERMISSION_MODE: PermissionMode = "edit_auto";

/** Bump when mode semantics change; used to migrate stored settings once. */
export const PERMISSION_MODE_SCHEMA_VERSION = 2;

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

/** Ask / Edit auto need prismnext PTY bash so shell runs only after UI approval. */
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
  if (resolvePermissionMode(mode) === "readonly") {
    return buildLegacyPermissionRulesForMode("readonly");
  }
  return buildSmartOpenCodePermissionRules();
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

function ruleToPermissionAction(rule: OpenCodePermissionRule): PermissionAction {
  if (rule === "allow") return "allow";
  if (rule === "deny") return "deny";
  return "prompt";
}

export type { PermissionRulesConfig } from "../../shared/smart-permission-policy";
export { buildPermissionRulesConfig, emptyPermissionRulesConfig } from "../../shared/smart-permission-policy";

/** Build user permission rules from persisted app settings (main or renderer shape). */
export function buildPermissionRulesFromSettings(
  settings: {
    permissionAllowedPaths?: unknown;
    permissionAllowRules?: unknown;
    permissionDenyRules?: unknown;
    bashAllowAlwaysPatterns?: unknown;
    toolAllowAlways?: unknown;
  } | null | undefined,
): PermissionRulesConfig {
  if (!settings) return emptyPermissionRulesConfig();
  return buildPermissionRulesConfig({
    permissionAllowedPaths: settings.permissionAllowedPaths as string[] | undefined,
    permissionAllowRules: settings.permissionAllowRules as string[] | undefined,
    permissionDenyRules: settings.permissionDenyRules as string[] | undefined,
    bashAllowAlwaysPatterns: settings.bashAllowAlwaysPatterns as string[] | undefined,
    toolAllowAlways: settings.toolAllowAlways as string[] | undefined,
  });
}
export function resolvePermissionAction(
  mode: PermissionMode,
  toolName: string,
  agent?: SessionAgent,
  ctx?: {
    filePath?: string | null;
    projectRoot?: string | null;
    bashCommand?: string | null;
    bashCwd?: string | null;
    sourcePath?: string | null;
    destinationPath?: string | null;
    sessionId?: string | null;
    planDraftPending?: boolean;
  },
  rules?: PermissionRulesConfig,
): PermissionAction {
  if (resolvePermissionMode(mode) === "readonly") {
    if (agent && agent !== "build") {
      return ruleToPermissionAction(
        resolveEffectivePermissionRule(mode, agent, toolName, ctx),
      );
    }
    const rule = getPermissionRuleForTool("readonly", toolName);
    if (rule === "allow") return "allow";
    if (rule === "deny") return "deny";
    return "deny";
  }

  const smartCtx: SmartPermissionContext = {
    toolName,
    sessionAgent: agent,
    filePath: ctx?.filePath,
    projectRoot: ctx?.projectRoot,
    bashCommand: ctx?.bashCommand,
    bashCwd: ctx?.bashCwd,
    sourcePath: ctx?.sourcePath,
    destinationPath: ctx?.destinationPath,
    sessionId: ctx?.sessionId,
    planDraftPending: ctx?.planDraftPending,
  };
  return resolveSmartPermissionAction(smartCtx, rules ?? emptyPermissionRulesConfig());
}

/** Whether the UI should prompt the user — smart policy: only explicit prompt actions. */
export function shouldPromptForPermission(
  mode: PermissionMode,
  toolName: string,
  ctx?: Omit<SmartPermissionContext, "toolName">,
  rules?: PermissionRulesConfig,
): boolean {
  if (resolvePermissionMode(mode) === "readonly") return false;
  return resolveSmartPermissionAction({ toolName, ...ctx }, rules ?? emptyPermissionRulesConfig()) === "prompt";
}

/**
 * How prismnext should handle a custom-tool bridge gate from `tool_call` alone
 * (OpenCode may skip ACP `requestPermission` when the rule is already allow).
 *
 * - auto_allow: write bridge approval (+ run bash) — no UI
 * - deny: write bridge denial — no UI
 * - prompt: emit PermissionGatePanel / synthetic bash-gate
 */
export type BridgeToolCallSyncAction = "auto_allow" | "deny" | "prompt";

export function resolveBridgeToolCallSyncAction(
  mode: PermissionMode,
  toolName: string,
  agent?: SessionAgent,
): BridgeToolCallSyncAction {
  const action = resolvePermissionAction(mode, toolName, agent);
  if (action === "allow") return "auto_allow";
  if (action === "deny") return "deny";
  return "prompt";
}

/** Modes that auto-apply disk mutations without a proposed-change review. */
export function isEditAutoApplyMode(mode: PermissionMode | string | undefined): boolean {
  return resolvePermissionMode(mode) !== "readonly";
}
