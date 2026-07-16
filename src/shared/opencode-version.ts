/** Parse `opencode --version` stdout (first line). */

export function parseOpencodeVersionOutput(stdout: string): string | null {
  const line = (stdout || "").trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (!line) return null;
  const m = line.match(/^v?(\d+\.\d+\.\d+\S*)/i);
  if (m?.[1]) return m[1];
  if (/^[\w.+-]+$/.test(line)) return line.replace(/^v/i, "");
  return null;
}
