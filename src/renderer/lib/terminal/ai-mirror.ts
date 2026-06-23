/** Format mirrored bash output for AI terminal xterm display. */

export function formatMirrorCommandLine(command: string, cwd?: string): string {
  const prefix = cwd ? `\x1b[2m# ${cwd}\x1b[0m\r\n` : "";
  return `${prefix}\x1b[1;32m$\x1b[0m ${command}\r\n`;
}

export function formatMirrorOutput(output: string): string {
  if (!output) return "";
  const normalized = output.endsWith("\n") ? output : `${output}\n`;
  return normalized.replace(/\n/g, "\r\n");
}

export function formatMirrorExitFooter(exitCode?: number, isError?: boolean): string {
  if (exitCode === undefined) return "";
  const color = exitCode === 0 && !isError ? "33" : "31";
  return `\r\n\x1b[1;${color}m[exit ${exitCode}]\x1b[0m\r\n`;
}

export function formatMirrorDenied(command: string): string {
  return `${formatMirrorCommandLine(command)}\x1b[1;31m[permission denied]\x1b[0m\r\n`;
}

export function formatMirrorHeader(): string {
  return "\x1b[2m── AI Agent Terminal (read-only mirror) ──\x1b[0m\r\n\r\n";
}

/** Rebuild mirror text for a single completed bash tool (widget replay). */
export function buildMirrorFromBash(bash: {
  command: string;
  cwd?: string;
  output?: string;
  exitCode?: number;
  isError?: boolean;
  status?: "running" | "completed" | "denied";
}): string {
  let text = formatMirrorHeader();
  if (bash.status === "denied") {
    text += formatMirrorDenied(bash.command);
    return text;
  }
  text += formatMirrorCommandLine(bash.command, bash.cwd);
  if (bash.output) text += formatMirrorOutput(bash.output);
  if (bash.exitCode !== undefined) {
    text += formatMirrorExitFooter(bash.exitCode, bash.isError);
  }
  return text;
}

/** Truncate terminal snippet output for composer / prompt size limits. */
export function truncateTerminalOutput(output: string, maxLen = 32_000): string {
  if (output.length <= maxLen) return output;
  return `${output.slice(0, maxLen)}\n… [truncated ${output.length - maxLen} chars]`;
}
