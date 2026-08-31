import { ALL_MODULES } from "./modules";
import type { PromptContext, PromptModule } from "./types";

/** Legacy module keys still referenced in team JSON / cached profiles. */
const PROMPT_MODULE_KEY_ALIASES: Record<string, string> = {
  "latex-workspace": "manuscript-compile",
};

function normalizePromptModuleKey(key: string): string {
  return PROMPT_MODULE_KEY_ALIASES[key] ?? key;
}

function buildModulePromptText(mod: PromptModule, ctx: PromptContext): string {
  if (mod.build) return mod.build(ctx);
  if (mod.prompt) return mod.prompt;
  return "";
}

/** Modules injected into the global system baseline (always on — not agent-selectable). */
export function resolveStableSystemModules(): PromptModule[] {
  return ALL_MODULES.filter((m) => !m.profileOnly);
}

/** Profile modules attached to every agent profile (orchestrator + experts). */
export function resolveSharedProfileModules(): PromptModule[] {
  return ALL_MODULES.filter(
    (m) => m.profileOnly && !m.orchestratorOnly && !m.expertOnly,
  );
}

/** Profile modules attached only to the primary orchestrator. */
export function resolveOrchestratorOnlyProfileModules(): PromptModule[] {
  return ALL_MODULES.filter((m) => m.profileOnly && m.orchestratorOnly);
}

/** Profile modules attached only to expert/subagent agent.md. */
export function resolveExpertOnlyProfileModules(): PromptModule[] {
  return ALL_MODULES.filter((m) => m.profileOnly && m.expertOnly);
}

/** @deprecated Use resolveSharedProfileModules — kept for settings preview labels. */
export function resolveProfileSelectableModules(): PromptModule[] {
  return ALL_MODULES.filter((m) => m.profileOnly);
}

/** Module keys for the primary orchestrator agent.md (shared + orchestrator-only). */
export function resolveOrchestratorProfileModuleKeys(): string[] {
  return ALL_MODULES.filter((m) => m.profileOnly && !m.expertOnly).map((m) => m.key);
}

/** Module keys for expert/subagent agent.md (shared + expert-only). */
export function resolveSubagentProfileModuleKeys(): string[] {
  return ALL_MODULES.filter((m) => m.profileOnly && !m.orchestratorOnly).map((m) => m.key);
}

/**
 * Module keys for one expert's agent.md. The expert definition's `modules`
 * list trims the shared profile modules to what this expert actually needs —
 * an expert Task call pays the full system-side cost of every module we
 * attach (peer-reviewer needs no experiments/latex compile chain). expertOnly
 * modules (subagent-role) are always kept; unknown keys are ignored.
 */
export function resolveSubagentProfileModuleKeysFor(def: { modules?: string[] }): string[] {
  const all = resolveSubagentProfileModuleKeys();
  if (!def.modules?.length) return all;
  const sharedKeys = new Set(resolveSharedProfileModules().map((m) => m.key));
  const picked = def.modules.map(normalizePromptModuleKey).filter((k) => sharedKeys.has(k));
  const alwaysKept = all.filter((k) => !sharedKeys.has(k));
  return [...new Set([...picked, ...alwaysKept])];
}

/**
 * Join scoped module prompts for the live orchestrator / expert system prompt.
 * Workspace globals are already in composeStableSystem.
 */
export function composeProfileModulePrompts(
  profileModules: string[] | undefined,
  ctx: PromptContext = {},
): string {
  if (!profileModules?.length) return "";

  const allowed = new Set(profileModules.map(normalizePromptModuleKey));
  const profileModuleSummaries = ALL_MODULES.filter(
    (m) =>
      m.profileOnly &&
      allowed.has(m.key) &&
      m.key !== "orchestrator-judgment" &&
      m.key !== "subagent-role",
  ).map((m) => ({ key: m.key, label: m.label, description: m.description }));

  const enrichedCtx: PromptContext = {
    ...ctx,
    profileModules,
    profileModuleSummaries,
  };

  const parts: string[] = [];
  for (const mod of ALL_MODULES) {
    if (!mod.profileOnly || !allowed.has(mod.key)) continue;
    const text = buildModulePromptText(mod, enrichedCtx).trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

export function composeOrchestratorProfileModulePrompts(ctx: PromptContext = {}): string {
  return composeProfileModulePrompts(resolveOrchestratorProfileModuleKeys(), ctx);
}

export function composeSubagentProfileModulePrompts(ctx: PromptContext = {}): string {
  return composeProfileModulePrompts(resolveSubagentProfileModuleKeys(), ctx);
}

/**
 * Effective module keys for an agent profile (UI + metadata lines).
 * Workspace is always present via OpenCode instructions; profile adds bundled modules.
 */
export function resolveActiveModuleKeys(
  ctx: Pick<PromptContext, "profileModules"> & { role?: "orchestrator" | "subagent" },
): string[] {
  const keys = resolveStableSystemModules().map((m) => m.key);
  const profileKeys =
    ctx.profileModules ??
    (ctx.role === "subagent"
      ? resolveSubagentProfileModuleKeys()
      : ctx.role === "orchestrator"
        ? resolveOrchestratorProfileModuleKeys()
        : []);
  if (profileKeys.length) {
    const allowed = new Set(profileKeys.map(normalizePromptModuleKey));
    for (const mod of ALL_MODULES) {
      if (mod.profileOnly && allowed.has(mod.key)) keys.push(mod.key);
    }
  }
  return [...new Set(keys)].sort((a, b) => a.localeCompare(b));
}

export function resolveOrchestratorActiveModuleKeys(): string[] {
  return resolveActiveModuleKeys({ role: "orchestrator" });
}

export function resolveSubagentActiveModuleKeys(): string[] {
  return resolveActiveModuleKeys({ role: "subagent" });
}
