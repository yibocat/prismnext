/**
 * precedence.ts — the single precedence table (design 2026-08-10 §7.5, D-9).
 *
 * One table drives: resolveInvocation winner, runtimeName collision arbitration,
 * skills.paths ordering, MCP name conflicts, and origin-badge resolution.
 * There must be no second ordering anywhere.
 *
 * Lower rank = more specific = wins.
 */

import type { TeamScope, TeamSource } from "../../shared/teams/types";

/**
 * Precedence rank for a team. Lower = more specific = wins.
 *
 *   project (0) > user (1) > registry (2) > pro (3) > bundled (4) > core (5)
 *
 * NOTE (D-9): this intentionally changes the v1 behavior, where the core team
 * was placed LAST in skills.paths and thus shadowed other teams' same-named
 * skills (OpenCode resolves "later wins"). Core is now the weakest.
 */
export function precedenceRank(t: { scope: TeamScope; source: TeamSource }): number {
  if (t.scope === "project") return 0;
  switch (t.source) {
    case "user":
      return 1;
    case "registry":
      return 2;
    case "pro":
      return 3;
    case "bundled":
      return 4;
    case "core":
      return 5;
  }
}

/**
 * Compare two teams by precedence, then by teamId for a stable, total order.
 * Returns negative when `a` wins (is more specific).
 */
export function compareByPrecedence(
  a: { scope: TeamScope; source: TeamSource; teamId: string },
  b: { scope: TeamScope; source: TeamSource; teamId: string },
): number {
  const d = precedenceRank(a) - precedenceRank(b);
  if (d !== 0) return d;
  return a.teamId.localeCompare(b.teamId);
}
