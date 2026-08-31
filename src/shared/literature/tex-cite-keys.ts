/** Extract LaTeX `\\cite{…}` keys. Pure — no fs. */

const CITE_COMMAND_RE =
  /\\(?:[a-zA-Z@*]+)?cite(?:[a-zA-Z*]*)?(?:\*)?\{([^}]*)\}/g;

export function extractCiteKeysFromTex(texContent: string): string[] {
  const keys = new Set<string>();
  for (const match of texContent.matchAll(CITE_COMMAND_RE)) {
    const inner = match[1]?.trim();
    if (!inner || inner === "*") continue;
    for (const part of inner.split(",")) {
      const key = part.trim();
      if (key) keys.add(key);
    }
  }
  return [...keys].sort();
}
