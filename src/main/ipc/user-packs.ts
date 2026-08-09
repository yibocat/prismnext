// User team IPC (app-level): create / list / delete user-created teams.
// Teams are app-level packs (userData/user-packs/<teamId>/), registered as an
// external pack root — the catalog / resolver treat them like installed packs.
import { ipcMain } from "electron";
import {
  createUserTeam,
  deleteUserTeam,
  ensureUserPacksRegistered,
  listUserTeams,
} from "../services/user-packs";

export function registerUserPacksHandlers(): void {
  ensureUserPacksRegistered();

  ipcMain.handle("userPacks:list", async () => {
    return listUserTeams();
  });

  ipcMain.handle(
    "userPacks:create",
    async (_event, args: { name: string; description?: string }) => {
      return createUserTeam(args.name ?? "", args.description ?? "");
    },
  );

  ipcMain.handle("userPacks:delete", async (_event, args: { packId: string }) => {
    deleteUserTeam(args.packId);
  });
}
