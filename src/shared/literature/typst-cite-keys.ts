/** Extract Typst citation keys and bibliography paths. Pure — no fs. */

const CITE_CALL_RE = /#cite\s*\(([^)]*)\)/g;
const CITE_LABEL_RE = /<([^>]+)>/g;
const CITE_LABEL_CALL_RE = /#cite\s*\(\s*label\s*\(\s*"([^"]+)"\s*\)/g;
/** `@key` not preceded by identifier / path chars; skip `@preview` / `@local`. */
const AT_CITE_RE = /(^|[^A-Za-z0-9_./])@([A-Za-z_](?:[\w.-]*[A-Za-z0-9_])?)/gm;
const BIB_CALL_RE = /#bibliography\s*\(\s*(?:\(\s*)?["']([^"']+\.bib)["']/;

const PACKAGE_NS = new Set(["preview", "local"]);

function addCiteKey(keys: Set<string>, raw: string | undefined): void {
  const key = raw?.trim().replace(/\.+$/, "");
  if (!key || PACKAGE_NS.has(key.toLowerCase())) return;
  keys.add(key);
}

export function extractCiteKeysFromTypst(source: string): string[] {
  const keys = new Set<string>();

  for (const match of source.matchAll(CITE_LABEL_CALL_RE)) {
    addCiteKey(keys, match[1]);
  }

  for (const match of source.matchAll(CITE_CALL_RE)) {
    const inner = match[1] ?? "";
    for (const lab of inner.matchAll(CITE_LABEL_RE)) {
      addCiteKey(keys, lab[1]);
    }
  }

  for (const match of source.matchAll(AT_CITE_RE)) {
    addCiteKey(keys, match[2]);
  }

  return [...keys].sort();
}

/** First `#bibliography("….bib")` path as written in the source (may be relative). */
export function extractTypstBibliographyRel(source: string): string | null {
  const match = source.match(BIB_CALL_RE);
  const path = match?.[1]?.trim();
  return path || null;
}
