/**
 * scope.ts — scope rules and path helpers (design 2026-08-10 §5.1.2 / §6.4).
 *
 * Scope is a property of the Team, not of the individual asset. A user never
 * picks a scope directly; they pick a team, and the team carries the scope.
 */

import { app } from "electron";
import { join } from "node:path";
import {
  PROJECT_TEAMS_REL,
  type TeamScope,
} from "../../shared/teams/types";

let appTeamsDirOverride: string | null = null;

/** Test-only app Teams root override. */
export function setAppTeamsDirForTests(dir: string | null): void {
  appTeamsDirOverride = dir;
}

/** App-level user-created teams root: `<userData>/teams/`. */
export function appTeamsDir(): string {
  if (appTeamsDirOverride) return appTeamsDirOverride;
  try {
    return join(app.getPath("userData"), "teams");
  } catch {
    return join(process.env.TMPDIR ?? "/tmp", "teams");
  }
}

/** Project teams root: `<projectRoot>/.prismnext/agent/teams/`. */
export function projectTeamsDir(projectRoot: string): string {
  return join(projectRoot, PROJECT_TEAMS_REL);
}

/**
 * Cross-scope reference rule (design §6.4, D-5):
 * an app-scope asset may be referenced by anyone; a project-scope asset may
 * only be referenced by a team in the same project.
 *
 * Rationale: a global team referencing a project-scoped subagent would dangle
 * as soon as the user switches projects. The UI offers "promote team" /
 * "move asset" as the way out instead of erroring.
 */
export function canReference(
  from: { scope: TeamScope },
  to: { scope: TeamScope },
): boolean {
  if (to.scope === "app") return true;
  return from.scope === "project";
}
