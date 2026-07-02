import type { BuiltinToolMeta } from "./index";

const REFERENCE_LIBRARY_CONTEXT =
  "Project literature library: `.prismnext/library/library.db` (not .bib files).";

/**
 * Build the OpenCode tool `description` string from registry metadata.
 * This is the only place tool guidance is injected for the LLM — not a prompt module.
 */
export function buildOpencodeToolDescription(meta: BuiltinToolMeta): string {
  const lines: string[] = [];
  if (meta.category === "reference") {
    lines.push(REFERENCE_LIBRARY_CONTEXT);
  }
  lines.push(meta.description.trim());
  if (meta.usageHint?.trim()) {
    lines.push(meta.usageHint.trim());
  }
  if (meta.workflowRules?.length) {
    lines.push("Rules:");
    for (const rule of meta.workflowRules) {
      lines.push(`- ${rule}`);
    }
  }
  return lines.join("\n");
}

/**
 * Replace the top-level `description` field in `export default tool({ ... })`.
 * Used when syncing tool files to OpenCode so registry metadata stays authoritative.
 */
export function patchToolDescription(source: string, description: string): string {
  const toolStart = source.indexOf("export default tool({");
  if (toolStart === -1) return source;

  const descKey = source.indexOf("description:", toolStart);
  if (descKey === -1) return source;

  const argsKey = source.indexOf("\n  args:", descKey);
  if (argsKey === -1) return source;

  const before = source.slice(0, descKey);
  const after = source.slice(argsKey);
  return `${before}description: ${JSON.stringify(description)},\n${after}`;
}
