// User team IPC (app-level): create / list / delete user-created teams.
// Teams are app-level packs (userData/user-packs/<teamId>/), registered as an
// external pack root — the catalog / resolver treat them like installed packs.
import { ipcMain } from "electron";
import {
  ensureUserTeamsRegistered,
  listUserTeams,
} from "../teams/user-teams";

export function registerUserPacksHandlers(): void {
  ensureUserTeamsRegistered();

  ipcMain.handle("teams:listUserTeams", async () => {
    return listUserTeams();
  });

  ipcMain.handle(
    "teams:createUserTeam",
    async () => {
      throw new Error("Legacy user-packs creation is retired; use teams:create.");
    },
  );

  ipcMain.handle("teams:deleteUserTeam", async () => {
    throw new Error("Legacy user-packs deletion is retired; use teams:delete.");
  });
}
