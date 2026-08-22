/**
 * Teams desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by teams-store, command-store (roster), and mcp-servers-store (asset enable).
 */

import { forwardDesktop } from "./forward";

export const teamsDesktop = {
  teamsList: forwardDesktop("teamsList"),
  teamsGetActiveTeam: forwardDesktop("teamsGetActiveTeam"),
  teamsListProjectMcps: forwardDesktop("teamsListProjectMcps"),
  teamsSetEnabled: forwardDesktop("teamsSetEnabled"),
  teamsSetActiveTeam: forwardDesktop("teamsSetActiveTeam"),
  teamsGetCommandsRoster: forwardDesktop("teamsGetCommandsRoster"),
  teamsSetAssetEnabled: forwardDesktop("teamsSetAssetEnabled"),
  teamsCreate: forwardDesktop("teamsCreate"),
  teamsListAssets: forwardDesktop("teamsListAssets"),
  teamsListMcp: forwardDesktop("teamsListMcp"),
};
