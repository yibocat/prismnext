/** Parse `opencode --version` stdout (first line). */

export function parseOpencodeVersionOutput(stdout: string): string | null {
  const line = (stdout || "").trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (!line) return null;
  const m = line.match(/^v?(\d+\.\d+\.\d+\S*)/i);
  if (m?.[1]) return m[1];
  if (/^[\w.+-]+$/.test(line)) return line.replace(/^v/i, "");
  return null;
}

/** OpenCode ≥1.18 derives model variants from models.dev `reasoning_options`. */
export const OPENCODE_REASONING_FROM_CATALOG_MIN = "1.18.0";

function parseVersionParts(version: string): [number, number, number] | null {
  const m = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function openCodeVersionAtLeast(
  version: string | null | undefined,
  minimum: string,
): boolean {
  const a = version ? parseVersionParts(version) : null;
  const b = parseVersionParts(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

/** Whether Prism can skip writing variants into opencode.json (runtime builds them). */
export function shouldSkipEffortVariantConfigSync(
  version: string | null | undefined,
): boolean {
  return openCodeVersionAtLeast(version, OPENCODE_REASONING_FROM_CATALOG_MIN);
}
