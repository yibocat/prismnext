import { BUILTIN_TOOLS } from "../tools";

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
