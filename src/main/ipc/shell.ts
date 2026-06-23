import { ipcMain, shell } from "electron";

export function registerShellHandlers(): void {
  ipcMain.handle("shell:showItemInFolder", (_event, args: { absPath: string }) => {
    shell.showItemInFolder(args.absPath);
  });
}
