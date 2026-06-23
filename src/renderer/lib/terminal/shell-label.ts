/** Human-readable shell name from an absolute path (zsh, bash, PowerShell, cmd, …). */
export function shellDisplayName(shellPath: string | null | undefined): string {
  if (!shellPath?.trim()) return "Shell";
  const base = shellPath.split(/[/\\]/).filter(Boolean).pop() || shellPath;
  const name = base.replace(/\.exe$/i, "");
  const lower = name.toLowerCase();
  if (lower === "powershell") return "PowerShell";
  if (lower === "pwsh") return "pwsh";
  if (lower === "cmd") return "cmd";
  return name;
}

const GENERIC_USER_TERMINAL_TITLES = new Set([
  "Terminal",
  "Shell",
  "zsh",
  "bash",
  "fish",
  "sh",
  "cmd",
  "PowerShell",
  "pwsh",
]);

export function isGenericTerminalTabTitle(title: string | undefined): boolean {
  if (!title?.trim()) return true;
  return GENERIC_USER_TERMINAL_TITLES.has(title.trim());
}

export function defaultUserTerminalTitle(shellPath?: string | null): string {
  return shellDisplayName(shellPath);
}
