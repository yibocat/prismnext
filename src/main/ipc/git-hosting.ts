import { ipcMain } from "electron";
import type { GhPrCreateInput } from "../../shared/git-hosting";
import { ghAuthStatus, ghPrCreate, ghPrViewWeb } from "../git-hosting/gh";

export function registerGitHostingHandlers(): void {
  ipcMain.handle(
    "git-hosting:ghAuthStatus",
    async (_e, args: { projectRoot: string }) => ghAuthStatus(args.projectRoot),
  );

  ipcMain.handle("git-hosting:ghPrCreate", async (_e, args: GhPrCreateInput) =>
    ghPrCreate(args),
  );

  ipcMain.handle(
    "git-hosting:ghPrViewWeb",
    async (_e, args: { projectRoot: string; url?: string }) =>
      ghPrViewWeb(args.projectRoot, { url: args.url }),
  );
}
