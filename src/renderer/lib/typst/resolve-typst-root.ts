function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Parse `// !typst root = rel.typ` from the first 20 lines. */
export function parseTypstRootMagicComment(content: string): string | null {
  for (const line of content.split("\n").slice(0, 20)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("//")) continue;
    const rest = trimmed.slice(2).trim();
    const match = rest.match(/^!typst\s+root\s*=\s*(.+)$/i);
    const rootPath = match?.[1]?.trim();
    if (rootPath) return rootPath;
  }
  return null;
}

export function isTypstStandaloneRel(
  fileRel: string,
  manuscriptDir: string | null | undefined,
): boolean {
  const n = normalizeRel(fileRel);
  const d = manuscriptDir ? normalizeRel(manuscriptDir).replace(/\/$/, "") : "";
  if (!d) return n !== "main.typ" && n !== "paper.typ";
  return n !== d && !n.startsWith(`${d}/`);
}

function findTypInList(
  files: Array<{ relativePath: string }>,
  relPath: string,
  fromRel?: string,
): string | null {
  const normalized = normalizeRel(relPath);
  const paths = files.map((f) => normalizeRel(f.relativePath));
  if (paths.includes(normalized)) return normalized;
  if (fromRel) {
    const dir = normalizeRel(fromRel).includes("/")
      ? normalizeRel(fromRel).slice(0, normalizeRel(fromRel).lastIndexOf("/"))
      : "";
    const sibling = normalizeRel(dir ? `${dir}/${normalized}` : normalized);
    if (paths.includes(sibling)) return sibling;
  }
  const base = normalized.split("/").pop() ?? normalized;
  return paths.find((p) => p === normalized || p.endsWith(`/${base}`) || p === base) ?? null;
}

export function resolveTypstRootFromBuffers(input: {
  files: Array<{ relativePath: string }>;
  getContent: (rel: string) => string;
  manuscriptDir: string | null;
  mainFilePin: string | null;
  hintRel?: string | null;
}): string | null {
  const files = input.files;
  const manuscriptDir = input.manuscriptDir ? normalizeRel(input.manuscriptDir) : null;

  const follow = (start: string): string => {
    const visited = new Set<string>();
    let current = start;
    for (let depth = 0; depth < 10; depth++) {
      if (visited.has(current)) break;
      visited.add(current);
      const rootPath = parseTypstRootMagicComment(input.getContent(current));
      if (!rootPath) break;
      const next = findTypInList(files, rootPath, current);
      if (!next || next === current) break;
      current = next;
    }
    return current;
  };

  const hint = input.hintRel?.trim();
  if (hint) {
    const found = findTypInList(files, hint);
    if (found) return follow(found);
  }

  const pin = input.mainFilePin?.trim();
  if (pin && pin.toLowerCase().endsWith(".typ") && manuscriptDir) {
    const rel = normalizeRel(`${manuscriptDir}/${pin}`);
    if (findTypInList(files, rel)) return follow(rel);
  }

  if (manuscriptDir) {
    const mainTyp = `${manuscriptDir}/main.typ`;
    if (findTypInList(files, mainTyp)) return mainTyp;
    const paperTyp = `${manuscriptDir}/paper.typ`;
    if (findTypInList(files, paperTyp)) return paperTyp;
    const first = files
      .map((f) => normalizeRel(f.relativePath))
      .filter((rel) => rel.toLowerCase().endsWith(".typ") && (rel === manuscriptDir || rel.startsWith(`${manuscriptDir}/`)))
      .sort()[0];
    if (first) return first;
  }

  if (findTypInList(files, "main.typ")) return "main.typ";
  return null;
}

/** Compile root for a `.typ` hint: standalone file, or paper root via magic comment / pin. */
export function resolveTypstLiveMainRelFromState(input: {
  files: Array<{ relativePath: string }>;
  getContent: (rel: string) => string;
  manuscriptDir: string | null;
  mainFilePin: string | null;
  hintRel: string;
}): string | null {
  const rel = normalizeRel(input.hintRel);
  if (!rel.toLowerCase().endsWith(".typ")) return null;
  if (isTypstStandaloneRel(rel, input.manuscriptDir)) return rel;
  return resolveTypstRootFromBuffers({ ...input, hintRel: rel }) ?? rel;
}
