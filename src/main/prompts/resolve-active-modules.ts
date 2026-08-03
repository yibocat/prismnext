import { ALL_MODULES } from "./modules";
import type { PromptContext, PromptModule } from "./types";

function buildModulePromptText(mod: PromptModule, ctx: PromptContext): string {
  if (mod.build) return mod.build(ctx);
  if (mod.prompt) return mod.prompt;
  return "";
}

/** Modules injected into global `_prism-system.md` (always on — not agent-selectable). */
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
export function resolveExpertProfileModuleKeys(): string[] {
  return ALL_MODULES.filter((m) => m.profileOnly && !m.orchestratorOnly).map((m) => m.key);
}

/**
 * Join scoped module prompts for agent profile sync (orchestrator / expert agent.md).
 * Workspace globals are already in `_prism-system.md`.
 */
export function composeProfileModulePrompts(
  profileModules: string[] | undefined,
  ctx: PromptContext = {},
): string {
  if (!profileModules?.length) return "";

  const allowed = new Set(profileModules);
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

export function composeExpertProfileModulePrompts(ctx: PromptContext = {}): string {
  return composeProfileModulePrompts(resolveExpertProfileModuleKeys(), ctx);
}

/**
 * Effective module keys for an agent profile (UI + metadata lines).
 * Workspace is always present via OpenCode instructions; profile adds bundled modules.
 */
export function resolveActiveModuleKeys(
  ctx: Pick<PromptContext, "profileModules"> & { role?: "orchestrator" | "expert" },
): string[] {
  const keys = resolveStableSystemModules().map((m) => m.key);
  const profileKeys =
    ctx.profileModules ??
    (ctx.role === "expert"
      ? resolveExpertProfileModuleKeys()
      : ctx.role === "orchestrator"
        ? resolveOrchestratorProfileModuleKeys()
        : []);
  if (profileKeys.length) {
    const allowed = new Set(profileKeys);
    for (const mod of ALL_MODULES) {
      if (mod.profileOnly && allowed.has(mod.key)) keys.push(mod.key);
    }
  }
  return [...new Set(keys)].sort((a, b) => a.localeCompare(b));
}

export function resolveOrchestratorActiveModuleKeys(): string[] {
  return resolveActiveModuleKeys({ role: "orchestrator" });
}

export function resolveExpertActiveModuleKeys(): string[] {
  return resolveActiveModuleKeys({ role: "expert" });
}
