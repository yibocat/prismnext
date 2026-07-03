import { ALL_MODULES } from "./modules";
import type { PromptContext, PromptModule } from "./types";

const WORKSPACE_MODULE = "workspace-folders";

function buildModulePromptText(mod: PromptModule, ctx: PromptContext): string {
  if (mod.build) return mod.build(ctx);
  if (mod.prompt) return mod.prompt;
  return "";
}

/** Modules injected into global `_prism-system.md` (always on — not agent-selectable). */
export function resolveStableSystemModules(): PromptModule[] {
  return ALL_MODULES.filter((m) => !m.profileOnly);
}

/** Profile-only modules an agent editor may attach to `agent.md`. */
export function resolveProfileSelectableModules(): PromptModule[] {
  return ALL_MODULES.filter((m) => m.profileOnly);
}

/**
 * Join scoped module prompts for agent profile sync (orchestrator / expert agent.md).
 * Only profile-selected modules — workspace is already in `_prism-system.md`.
 */
export function composeProfileModulePrompts(
  profileModules: string[] | undefined,
  ctx: PromptContext = {},
): string {
  if (!profileModules?.length) return "";

  const allowed = new Set(profileModules);
  const parts: string[] = [];
  for (const mod of ALL_MODULES) {
    if (!mod.profileOnly || !allowed.has(mod.key)) continue;
    const text = buildModulePromptText(mod, ctx).trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

/**
 * Effective module keys for an agent profile (UI + metadata lines).
 * Workspace is always present via OpenCode instructions; profile adds optional modules.
 */
export function resolveActiveModuleKeys(
  ctx: Pick<PromptContext, "profileModules">,
): string[] {
  const keys = [WORKSPACE_MODULE];
  if (ctx.profileModules?.length) {
    const allowed = new Set(ctx.profileModules);
    for (const mod of ALL_MODULES) {
      if (mod.profileOnly && allowed.has(mod.key)) keys.push(mod.key);
    }
  }
  return keys.sort((a, b) => a.localeCompare(b));
}

/** @deprecated alias — stable system layer uses resolveStableSystemModules directly. */
export function resolveActiveModules(
  _ctx: Pick<PromptContext, "profileModules">,
): PromptModule[] {
  return resolveStableSystemModules();
}
