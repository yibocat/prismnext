import type { TerminalProcessStatus } from "@/types/terminal";

export { shellDisplayName, isGenericTerminalTabTitle, defaultUserTerminalTitle } from "./shell-label";

/** Resolve the cwd for a new terminal session. */
export function resolveTerminalRoot(
  checkoutRoot: string | null | undefined,
  projectRoot: string | null | undefined,
): string | null {
  return checkoutRoot || projectRoot || null;
}

/** Basename for tab title from an absolute path. */
export function terminalTabTitleFromCwd(cwd: string): string {
  return cwd.split(/[/\\]/).filter(Boolean).pop() || cwd;
}

/** Tab/toolbar label from the command the user last submitted. */
export function terminalTabLabelFromCommand(
  command: string,
  maxLen = 48,
  fallback = "Shell",
): string {
  const trimmed = command.trim();
  if (!trimmed) return fallback;
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

/** Whether closing should prompt because a command may still be running. */
export function isTerminalCommandBusy(busy: boolean | undefined): boolean {
  return busy === true;
}
