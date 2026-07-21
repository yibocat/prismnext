import { BUILTIN_TOOLS } from "../tools";
import {
  LEGACY_DRAFT_PLAN_REL,
  RESEARCH_PLAN_DRAFTS_DIR_REL,
  RESEARCH_PLANS_DIR_REL,
} from "../../shared/research-plan";

/** OpenCode built-ins prismnext always enables (privacy-first defaults otherwise hide them). */
export const OPENCODE_STANDARD_TOOLS: Record<string, boolean> = {
  websearch: true,
  webfetch: true,
  grep: true,
  glob: true,
  bash: true,
  edit: true,
  write: true,
  read: true,
  apply_patch: true,
  question: true,
  task: true,
  todowrite: true,
  skill: true,
};

/**
 * Merge OpenCode `tools` config — always force-enable prismnext-managed tools.
 *
 * Unlike `writeDefaultConfig()` (which skips existing configs), this runs on
 * every startup so new custom tools (delete, move, …) appear in the model's
 * toolbox even when the user already has an opencode.json on disk.
 */
export function buildEnabledToolsConfig(
  existing?: Record<string, unknown>,
  overrides?: Record<string, boolean>,
): Record<string, boolean> {
  const merged: Record<string, boolean> = {};
  if (existing) {
    for (const [key, value] of Object.entries(existing)) {
      if (typeof value === "boolean") merged[key] = value;
    }
  }
  for (const [key, value] of Object.entries(OPENCODE_STANDARD_TOOLS)) {
    merged[key] = value;
  }
  for (const tool of BUILTIN_TOOLS) {
    merged[tool.name] = true;
  }
  if (overrides) {
    Object.assign(merged, overrides);
  }
  return merged;
}

/**
 * Align OpenCode built-in `plan` agent edit allowlist with Prism plans dir
 * (we do not use project `.opencode/plans/` — see opencode-and-skills-layout).
 *
 * Mirrors OpenCode agent.ts: edit deny-all except plan markdown paths.
 */
export function ensurePlanAgentPermissionConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const agent = (config.agent as Record<string, unknown> | undefined) ?? {};
  const plan = (agent.plan as Record<string, unknown> | undefined) ?? {};
  const permission = (plan.permission as Record<string, unknown> | undefined) ?? {};
  const existingEdit = permission.edit;

  const editRules: Record<string, string> =
    existingEdit && typeof existingEdit === "object" && !Array.isArray(existingEdit)
      ? { ...(existingEdit as Record<string, string>) }
      : typeof existingEdit === "string"
        ? { "*": existingEdit }
        : { "*": "deny" };

  editRules["*"] = editRules["*"] ?? "deny";
  editRules[`${RESEARCH_PLANS_DIR_REL}/**`] = "allow";
  editRules[`${RESEARCH_PLANS_DIR_REL}/*.md`] = "allow";
  editRules[`${RESEARCH_PLAN_DRAFTS_DIR_REL}/**`] = "allow";
  editRules[LEGACY_DRAFT_PLAN_REL] = "allow";
  editRules[".opencode/plans/*.md"] = editRules[".opencode/plans/*.md"] ?? "allow";

  return {
    ...config,
    agent: {
      ...agent,
      plan: {
        ...plan,
        permission: {
          ...permission,
          edit: editRules,
        },
      },
    },
  };
}
