/**
 * Bash "Allow always" patterns — closer to OpenCode: whitelist a command
 * prefix (e.g. `git status*`) rather than the entire bash tool forever.
 */

/** Normalize whitespace for matching. */
export function normalizeBashCommand(command: string): string {
  return (command || "").replace(/\s+/g, " ").trim();
}

/**
 * Derive a persistent always-allow pattern from a concrete command.
 * Examples: `git status --porcelain` → `git status*`; `ls` → `ls*`.
 */
export function bashAlwaysPatternFromCommand(command: string): string {
  const normalized = normalizeBashCommand(command);
  if (!normalized) return "";
  const parts = normalized.split(" ");
  if (parts.length === 1) return `${parts[0]}*`;
  return `${parts[0]} ${parts[1]}*`;
}

/** Simple glob: `*` → any chars, `?` → one char; match against full command. */
export function bashCommandMatchesPattern(command: string, pattern: string): boolean {
  const cmd = normalizeBashCommand(command);
  const pat = normalizeBashCommand(pattern);
  if (!cmd || !pat) return false;
  let reSource = "";
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i]!;
    if (ch === "*") reSource += ".*";
    else if (ch === "?") reSource += ".";
    else if (/[.+^${}()|[\]\\]/.test(ch)) reSource += `\\${ch}`;
    else reSource += ch;
  }
  try {
    return new RegExp(`^${reSource}$`).test(cmd);
  } catch {
    return false;
  }
}

export function bashCommandMatchesAnyPattern(
  command: string,
  patterns: string[] | undefined | null,
): boolean {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  return patterns.some((p) => typeof p === "string" && bashCommandMatchesPattern(command, p));
}
