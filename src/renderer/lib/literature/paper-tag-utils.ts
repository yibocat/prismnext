import { paperTagKey } from "../../../shared/literature/paper-tags";

export type ProjectTagEntry = { tag: string; count: number };

/** Distinct user tags across the library with usage counts. */
export function collectProjectTags(papers: Array<{ tags?: string[] }>): ProjectTagEntry[] {
  const byKey = new Map<string, ProjectTagEntry>();
  for (const paper of papers) {
    for (const tag of paper.tags ?? []) {
      const key = paperTagKey(tag);
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byKey.set(key, { tag, count: 1 });
      }
    }
  }
  return sortTagEntriesByUsage([...byKey.values()]);
}

export function collectTagSuggestions(
  papers: Array<{ tags?: string[] }>,
  exclude: readonly string[],
): ProjectTagEntry[] {
  const excludeKeys = new Set(exclude.map(paperTagKey));
  return collectProjectTags(papers).filter((e) => !excludeKeys.has(paperTagKey(e.tag)));
}

export function sortTagEntriesByUsage(entries: readonly ProjectTagEntry[]): ProjectTagEntry[] {
  return [...entries].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function filterTagsByQuery(
  suggestions: readonly ProjectTagEntry[],
  query: string,
): ProjectTagEntry[] {
  const sorted = sortTagEntriesByUsage(suggestions);
  const q = query.trim().toLowerCase();
  if (!q) return sorted;
  return sorted.filter((entry) => entry.tag.toLowerCase().includes(q));
}

export function paperMatchesTagFilter(
  paper: { tags?: string[] },
  filterTag: string | null | undefined,
): boolean {
  if (!filterTag) return true;
  const key = paperTagKey(filterTag);
  return (paper.tags ?? []).some((t) => paperTagKey(t) === key);
}
