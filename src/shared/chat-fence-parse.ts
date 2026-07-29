/**
 * Shared parser for chat code fences that use `key: value` lines
 * (```artifact with path:, ```interaction with id:, …).
 */

export function parseKeyedFenceBody(
  raw: string,
  primaryKey: "path" | "id",
): { primary: string; title?: string } | null {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  let primary = "";
  let title: string | undefined;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.+)$/.exec(trimmed);
    if (m) {
      const key = m[1]!.toLowerCase();
      const val = m[2]!.trim();
      if (key === primaryKey && val) primary = val;
      else if (key === "title" && val) title = val;
      continue;
    }
    if (!primary) primary = trimmed;
  }

  primary = primary.trim();
  if (!primary || primary.includes("..")) return null;
  return { primary, title };
}
