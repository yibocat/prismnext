/**
 * agents-render.ts — pure rendering of opencode agent markdown (design §7.1).
 *
 * No IO. The render layer reads ONLY AssetViewV2.runtimeName (the resolver
 * already computed shadowing); agentFileBase / shadowWinners / packShadowRank
 * are gone. The lead agent's permission.task block is generated from the
 * resolved roster (runtimeNames), so switching the active team only changes
 * that block — not the whole file set.
 */

import type { PromptContext } from "../prompts/types";
import {
  composeOrchestratorProfileModulePrompts,
  composeProfileModulePrompts,
  resolveSubagentProfileModuleKeysFor,
} from "../prompts/resolve-active-modules";
import { buildSubagentRosterMarkdown } from "../../shared/agent/subagent-roster";
import { buildTaskPermissionBlock } from "../services/task-orchestrator-gate";
import type { SubagentDefinition } from "../services/agent-subagents";
import type { OrchestratorDefV2, SubagentDefV2 } from "../../shared/teams/view";

// ── YAML serialization (byte-identical to the legacy renderer) ──

function yamlScalar(value: string): string {
  // Quote strings that YAML would otherwise parse as a DIFFERENT type
  // (numbers, booleans, null) — e.g. description "123" must stay a string or
  // opencode rejects the agent config ("Expected string, got 123").
  if (
    /[:#\n"'&*]|^\s/.test(value) ||
    /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(value) ||
    /^(true|false|True|False|TRUE|FALSE|yes|no|Yes|No|on|off|null|Null|NULL|~)$/.test(value)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

/** Quote YAML mapping keys that are illegal unquoted (`*` is an alias indicator). */
function yamlKey(key: string): string {
  if (key === "*" || /[:#\n"'&*!|>%@`{}[\],?]/.test(key) || /^\s|\s$/.test(key)) {
    return JSON.stringify(key);
  }
  return key;
}

function serializeYamlLines(value: unknown, indent = 0): string[] {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) {
    return [`${pad}null`];
  }
  if (typeof value === "string") {
    return [`${pad}${yamlScalar(value)}`];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [`${pad}${String(value)}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "object" && item !== null) {
        return [`${pad}-`, ...serializeYamlLines(item, indent + 1)];
      }
      return [`${pad}- ${yamlScalar(String(item))}`];
    });
  }
  if (typeof value === "object") {
    const lines: string[] = [];
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const safeKey = yamlKey(key);
      if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
        lines.push(`${pad}${safeKey}:`);
        lines.push(...serializeYamlLines(nested, indent + 1));
      } else if (Array.isArray(nested)) {
        lines.push(`${pad}${safeKey}:`);
        lines.push(...serializeYamlLines(nested, indent + 1));
      } else {
        lines.push(`${pad}${safeKey}: ${serializeYamlLines(nested, 0)[0]?.trim() ?? "null"}`);
      }
    }
    return lines;
  }
  return [`${pad}${String(value)}`];
}

function serializeFrontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      lines.push(`${key}:`);
      lines.push(...serializeYamlLines(value, 1));
    } else {
      lines.push(`${key}: ${serializeYamlLines(value, 0)[0]?.trim() ?? "null"}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

// ── Capability refs (prompt modules) ──────────────────────

function appendCapabilityRefs(
  def: SubagentDefV2 | OrchestratorDefV2,
  body: string,
  promptCtx: PromptContext,
  role: "orchestrator" | "subagent",
): string {
  const modulePrompts =
    role === "orchestrator"
      ? composeOrchestratorProfileModulePrompts(promptCtx)
      : composeProfileModulePrompts(
          resolveSubagentProfileModuleKeysFor(def as SubagentDefinition),
          promptCtx,
        );
  const sections: string[] = [body.trim()];
  if (modulePrompts) {
    sections.push("", "---", "", modulePrompts);
  }
  return sections.join("\n");
}

function mergePermissions(
  base: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (
      key in merged &&
      typeof merged[key] === "object" &&
      merged[key] !== null &&
      !Array.isArray(merged[key]) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      merged[key] = { ...(merged[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

// ── Roster section ────────────────────────────────────────

export interface RosterRefMd {
  id: string;
  name: string;
  description: string;
}

/** Appended at sync time — the lead agent's roster as a markdown section. */
export function appendRosterSection(body: string, members: RosterRefMd[]): string {
  const trimmed = body.trim();
  const roster = buildSubagentRosterMarkdown(members);
  return [trimmed, "", "---", roster].join("\n");
}

// ── Renderers ─────────────────────────────────────────────

export function renderSubagentMarkdown(
  def: SubagentDefV2,
  instructionsBody: string,
  promptCtx: PromptContext = {},
  options?: { defaultModel?: string | null },
): string {
  const frontmatter: Record<string, unknown> = {
    description: def.description,
    mode: "subagent",
  };
  const model =
    (typeof def.model === "string" && def.model.trim()) ||
    (typeof options?.defaultModel === "string" && options.defaultModel.trim()) ||
    "";
  if (model) frontmatter.model = model;
  if (def.temperature !== undefined) frontmatter.temperature = def.temperature;
  // Platform rule: subagents never nest Task — authors only write domain work.
  frontmatter.permission = mergePermissions(def.permission, {
    task: { "*": "deny" },
  });
  const body = appendCapabilityRefs(def, instructionsBody, promptCtx, "subagent");
  return `${serializeFrontmatter(frontmatter)}\n\n${body}\n`;
}

export function renderOrchestratorMarkdown(
  def: OrchestratorDefV2,
  instructionsBody: string,
  roster: RosterRefMd[],
  promptCtx: PromptContext = {},
): string {
  const taskRules = buildTaskPermissionBlock(roster.map((e) => e.id));
  const permission = mergePermissions(def.permission, { task: taskRules });
  const frontmatter: Record<string, unknown> = {
    description: def.description,
    mode: "primary",
    permission,
  };
  if (def.model) frontmatter.model = def.model;
  if (def.temperature !== undefined) frontmatter.temperature = def.temperature;
  const bodyWithRoster = appendRosterSection(instructionsBody, roster);
  const body = appendCapabilityRefs(def, bodyWithRoster, promptCtx, "orchestrator");
  return `${serializeFrontmatter(frontmatter)}\n\n${body}\n`;
}

// ── Content hash (unchanged algorithm) ────────────────────

export function agentContentHash(md: string): string {
  let hash = 5381;
  for (let i = 0; i < md.length; i++) {
    hash = ((hash << 5) + hash + md.charCodeAt(i)) >>> 0;
  }
  return (hash >>> 0).toString(36);
}
