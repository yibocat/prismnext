/**
 * Turn-boundary helpers shared by main (OpenCode SQLite) and renderer.
 * A turn starts at each visible user message — not tool-result-only forwards.
 */

export function isUserTurnStart(role: string, parts: unknown[]): boolean {
  if (role !== "user") return false;
  if (!parts.length) return true;
  return !(parts as Array<{ type?: string }>).every(
    (p) => p.type === "tool_result" || p.type === "tool-result",
  );
}

/** SQLite message row ids to delete when rolling back to turnIndex (0-based, inclusive). */
export function messageIdsAfterTurn<T extends { id: string; role: string; parts: unknown[] }>(
  rows: T[],
  turnIndex: number,
): string[] {
  let currentTurn = -1;
  const removeIds: string[] = [];
  for (const row of rows) {
    if (isUserTurnStart(row.role, row.parts)) currentTurn++;
    if (currentTurn > turnIndex) removeIds.push(row.id);
  }
  return removeIds;
}
