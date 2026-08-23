import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORE_TEAM_ID,
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
} from "../../src/shared/teams/types";
import {
  isSettingsHangarTeamId,
  isSettingsTeamsListId,
} from "../../src/renderer/lib/teams/team-display-name";

describe("settings teams list", () => {
  it("does not list the leftover project.local hangar as a team card", () => {
    expect(isSettingsTeamsListId(PROJECT_DEFAULT_TEAM_ID)).toBe(false);
    expect(isSettingsTeamsListId(MY_CONTENT_TEAM_ID)).toBe(true);
    expect(isSettingsTeamsListId(CORE_TEAM_ID)).toBe(true);
    expect(isSettingsHangarTeamId(MY_CONTENT_TEAM_ID)).toBe(true);
    expect(isSettingsHangarTeamId(PROJECT_DEFAULT_TEAM_ID)).toBe(false);
  });

  it("does not inject project.local into Settings → Teams", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../../src/renderer/components/modules/settings/teams-settings.tsx"),
      "utf-8",
    );
    expect(src).toContain("isSettingsTeamsListId");
    expect(src).toContain("isSettingsHangarTeamId");
    expect(src).not.toContain("pids.add(PROJECT_DEFAULT_TEAM_ID)");
  });
});
