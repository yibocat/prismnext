/**
 * Bash that still needs a human. Everything else is unlisted:
 * if the cwd is in the project, it runs.
 *
 * Do not add mkdir / python / git / make here. Those are not exceptions.
 */

import { normalizeBashCommand } from "./bash-allow-always";

export type BashException = "install" | "delete";

/** Package managers changing the machine. Not “every command we have seen”. */
const INSTALL_RE =
  /(?:^|[;&|\n]|&&|\|\|)\s*(?:sudo\s+)?(?:\S*\/)?(?:(?:python3?|uv)\s+-m\s+pip|uv\s+pip|pip3?|npm|pnpm|yarn|brew|apt-get|apt)\s+(?:install|uninstall|add|ci|remove|update|sync)\b/i;

/** Recursive / directory delete. Plain `rm file` is a reserved host verb, checked first. */
const DELETE_RE =
  /(?:^|[;&|\n]|&&|\|\|)\s*(?:sudo\s+)?(?:\S*\/)?(?:rm|rmdir|unlink)\b/i;

export function matchBashException(command: string): BashException | null {
  const cmd = normalizeBashCommand(command);
  if (!cmd) return null;
  if (INSTALL_RE.test(cmd)) return "install";
  if (DELETE_RE.test(cmd)) return "delete";
  return null;
}
