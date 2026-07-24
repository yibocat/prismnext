/**
 * Case-insensitive subsequence fuzzy match.
 * Empty query matches everything. No external deps.
 */
export function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t.charCodeAt(ti) === q.charCodeAt(qi)) qi++;
  }
  return qi === q.length;
}
