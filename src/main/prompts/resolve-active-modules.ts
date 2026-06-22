import { ALL_MODULES } from "./modules";
import type { PromptContext, PromptModule } from "./types";

const WORKSPACE_MODULE = "workspace-folders";

/**
 * Resolve which knowledge modules inject into the system prompt.
 *
 * - No profile scope → all globally enabled modules (Settings → Prompts & Rules).
 * - Profile scope → intersection(profile.modules, globally enabled).
 */
export function resolveActiveModules(
  ctx: Pick<PromptContext, "profileModules">,
): PromptModule[] {
  if (!ctx.profileModules?.length) {
    return ALL_MODULES.filter((m) => m.enabled);
  }

  const allowed = new Set(ctx.profileModules);
  return ALL_MODULES.filter((m) => {
    const inProfileScope = allowed.has(m.key) || m.key === WORKSPACE_MODULE;
    return inProfileScope && m.enabled;
  });
}

export function resolveActiveModuleKeys(
  ctx: Pick<PromptContext, "profileModules">,
): string[] {
  return resolveActiveModules(ctx).map((m) => m.key);
}
