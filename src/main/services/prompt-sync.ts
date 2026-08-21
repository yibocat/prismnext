import type { PromptContext } from "../prompts/types";

export const PRISM_SYSTEM_FILE = "_prism-system.md";
export const PRISM_AGENTS_REL = ".prismnext/agent/AGENTS.md";
export const PRISM_SYSTEM_REL = ".prismnext/agent/_prism-system.md";

/** Paths relative to session cwd — OpenCode `instructions` array entries. */
export const PRISM_OPENCODE_INSTRUCTIONS = [
  PRISM_AGENTS_REL,
  PRISM_SYSTEM_REL,
] as const;

/** No-op. Generated prompts are not written into the paper folder. */
export function ensurePrismGeneratedPromptGitignored(_projectRoot: string): void {}

/**
 * No-op. Pi composes the system prompt in memory.
 * Do not write `_prism-system.md` into the paper folder.
 */
export function syncProjectPromptFile(_projectRoot: string, _ctx: PromptContext): void {}

/** Merge OpenCode `instructions` into app-level config. Returns whether paths changed. */
export function mergeOpencodeInstructions(
  config: Record<string, unknown>,
): { config: Record<string, unknown>; changed: boolean } {
  const desired = [...PRISM_OPENCODE_INSTRUCTIONS];
  const existing = config.instructions;
  const existingList = Array.isArray(existing)
    ? existing.map(String)
    : typeof existing === "string"
      ? [existing]
      : [];

  const changed =
    existingList.length !== desired.length
    || desired.some((path, i) => existingList[i] !== path);

  if (!changed) {
    return { config, changed: false };
  }

  return {
    config: { ...config, instructions: desired },
    changed: true,
  };
}
