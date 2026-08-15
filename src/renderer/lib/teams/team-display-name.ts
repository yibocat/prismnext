import type { TFunction } from "i18next";
import {
  APP_COMMANDS_OWNER_ID,
  CORE_TEAM_ID,
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
} from "@shared/teams/types";

/** Localized label for reserved teams / app owner; others use on-disk / catalog name. */
export function teamDisplayName(
  teamId: string,
  fallbackName: string | undefined,
  t: TFunction,
): string {
  if (teamId === APP_COMMANDS_OWNER_ID) return t("settings.commandsPage.appLabel");
  if (teamId === CORE_TEAM_ID) return t("settings.teams.coreTeam");
  if (teamId === MY_CONTENT_TEAM_ID) return t("settings.teams.myContentTeam");
  if (teamId === PROJECT_DEFAULT_TEAM_ID) return t("settings.teams.projectLocalTeam");
  return fallbackName?.trim() || teamId;
}
