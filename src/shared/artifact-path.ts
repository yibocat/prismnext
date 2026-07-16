/**
 * Artifact path helpers shared by main (runs.jsonl / provenance write) and
 * renderer (Artifacts chips, chat image embeds).
 *
 * No hardcoded folder names (manuscript/, results/, …). Resolution is:
 *   1) path as declared (project-relative read)
 *   2) path under the experiment workspace (island-relative read)
 *   3) optional on-disk existence / basename search supplied by the caller
 */

/** Slash-normalize; strip leading `./`. */
export function normalizeArtifactSlash(path: string): string {
  return (path || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

/**
 * Default when nothing is on disk yet: treat as island-relative and join
 * workspace (tool contract). Does not invent other project folders.
 */
export function toProjectRelativeArtifact(path: string, workspacePath?: string): string {
  const p = normalizeArtifactSlash(path);
  const ws = normalizeArtifactSlash(workspacePath || "").replace(/\/$/, "");
  if (!p) return ws;
  if (!ws) return p;
  if (p === ws || p.startsWith(`${ws}/`)) return p;
  return `${ws}/${p}`;
}

/**
 * Structural candidates only: as declared, then under workspace.
 * Callers that can touch the filesystem should prefer an existing candidate
 * (and optionally a basename search) over inventing more paths.
 */
export function artifactPathCandidates(path: string, workspacePath?: string): string[] {
  const p = normalizeArtifactSlash(path);
  const ws = normalizeArtifactSlash(workspacePath || "").replace(/\/$/, "");
  const out: string[] = [];
  const add = (x: string) => {
    const n = normalizeArtifactSlash(x);
    if (n && !out.includes(n)) out.push(n);
  };

  if (!p) {
    if (ws) add(ws);
    return out;
  }

  add(p);
  if (ws && p !== ws && !p.startsWith(`${ws}/`)) {
    add(`${ws}/${p}`);
  }
  return out;
}

/**
 * Candidates for chat markdown `![](src)`: as-is + each known workspace join.
 */
export function chatImagePathCandidates(
  src: string,
  workspaceHints: string[] = [],
): string[] {
  const out: string[] = [];
  const addAll = (cands: string[]) => {
    for (const c of cands) {
      if (c && !out.includes(c)) out.push(c);
    }
  };
  addAll(artifactPathCandidates(src));
  for (const ws of workspaceHints) {
    const hint = normalizeArtifactSlash(ws).replace(/\/$/, "");
    if (hint) addAll(artifactPathCandidates(src, hint));
  }
  return out;
}

export function artifactBasename(path: string): string {
  const p = normalizeArtifactSlash(path);
  if (!p) return "";
  const parts = p.split("/");
  return parts[parts.length - 1] ?? p;
}

/**
 * Normalize artifact list for persistence (runs.jsonl / provenance).
 *
 * Prefer an on-disk match among structural candidates; if still unresolved and
 * a basename finder is provided, use that. Otherwise fall back to island join.
 */
export function normalizeRunArtifactPaths(
  artifacts: string[],
  opts: {
    workspacePath: string;
    existsProjectRel?: (projectRel: string) => boolean;
    /** Bounded project search by filename; return project-relative path or null. */
    findByBasename?: (basename: string) => string | null;
  },
): string[] {
  const ws = normalizeArtifactSlash(opts.workspacePath).replace(/\/$/, "");
  const exists = opts.existsProjectRel;
  const findByBasename = opts.findByBasename;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of artifacts) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    let chosen: string | null = null;

    if (exists) {
      for (const cand of artifactPathCandidates(raw, ws)) {
        if (exists(cand)) {
          chosen = cand;
          break;
        }
      }
    }

    if (!chosen && findByBasename) {
      const base = artifactBasename(raw);
      if (base) {
        const found = findByBasename(base);
        if (found) chosen = normalizeArtifactSlash(found);
      }
    }

    if (!chosen) {
      chosen = toProjectRelativeArtifact(raw, ws);
    }
    if (!chosen || seen.has(chosen)) continue;
    seen.add(chosen);
    out.push(chosen);
  }
  return out;
}
