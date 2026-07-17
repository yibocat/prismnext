/**
 * Shared copy when the orchestrator hard-denies OpenCode built-in Task subagents.
 * Used by main (ACP reject) and renderer (opaque "Task cancelled" rewrite).
 */

/** User-visible error when ACP rejects a builtin Task — not a manual cancel. */
export function formatOrchestratorBuiltinTaskDeniedMessage(
  subagentId: string | null | undefined,
): string {
  const id = (subagentId && subagentId.trim()) || "general";
  return (
    `Built-in Task @${id} is disabled on the orchestrator (this is not a user cancel). ` +
    "Call platform tools directly in this conversation — e.g. literature-stage after Paper Search MCP, " +
    "literature-search, or citation-health. Do not use Task/@Explore to read OpenCode tool-output files."
  );
}

/** OpenCode often returns only this JSON after we reject Task permission. */
export function isOpaqueTaskCancelledResult(content: unknown): boolean {
  const raw =
    typeof content === "string"
      ? content.trim()
      : content == null
        ? ""
        : JSON.stringify(content);
  if (!raw) return false;
  if (/^task cancelled\.?$/i.test(raw)) return true;
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    return typeof parsed?.error === "string" && /task cancelled/i.test(parsed.error);
  } catch {
    return /["']error["']\s*:\s*["']Task cancelled["']/i.test(raw);
  }
}
