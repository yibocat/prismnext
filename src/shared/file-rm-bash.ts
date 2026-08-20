/**
 * Agent bash must not delete project files with `rm` — that is the delete tool.
 * Recursive `rm -r` / `rm -rf` is left to the smart permission prompt.
 */

import { TOOL_NAMES } from "./tool-names";

const FILE_RM_SEGMENT_RE =
  /(?:^|[;&|\n]|&&|\|\|)\s*(?:sudo\s+)?(?:\S*\/)?(?:rm|unlink)(?=\s)([^;&|\n]*)/gi;

function flagsAreRecursive(flags: string): boolean {
  return /(?:^|[\s])-(?:-recursive|[A-Za-z]*[rR][A-Za-z]*)(?:\s|$)/.test(flags);
}

export function isFileRmBashCommand(command: string): boolean {
  const c = command.trim();
  if (!c) return false;
  FILE_RM_SEGMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_RM_SEGMENT_RE.exec(c)) !== null) {
    const rest = m[1] ?? "";
    if (flagsAreRecursive(rest)) continue;
    if (/\S/.test(rest.replace(/^[\s-]+/, "") || rest)) return true;
    if (m[0].includes("unlink")) return true;
  }
  return false;
}

export function fileRmBashBlockMessage(): string {
  return (
    `prismnext: do not delete files via bash \`rm\` / \`unlink\`. ` +
    `Use the \`${TOOL_NAMES.delete}\` tool with the project-relative path.`
  );
}
