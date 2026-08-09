// User team IPC (app-level): create / list / delete user-created teams.
// Teams are app-level packs (userData/user-packs/<teamId>/), registered as an
// external pack root — the catalog / resolver treat them like installed packs.
import { ipcMain } from "electron";
import {
  createUserTeam,
  deleteUserTeam,
  ensureUserTeamsRegistered,
  listUserTeams,
} from "../services/user-teams";

export function registerUserPacksHandlers(): void {
  ensureUserTeamsRegistered();

  ipcMain.handle("teams:listUserTeams", async () => {
    return listUserTeams();
  });

  ipcMain.handle(
    "teams:createUserTeam",
    async (_event, args: { name: string; description?: string }) => {
      return createUserTeam(args.name ?? "", args.description ?? "");
    },
  );

  ipcMain.handle("teams:deleteUserTeam", async (_event, args: { teamId: string }) => {
    deleteUserTeam(args.teamId);
  });
}
