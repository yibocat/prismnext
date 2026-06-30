import { ipcMain, shell } from "electron";

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "zotero:";
  } catch {
    return false;
  }
}

export function registerShellHandlers(): void {
  ipcMain.handle("shell:showItemInFolder", (_event, args: { absPath: string }) => {
    shell.showItemInFolder(args.absPath);
  });

  ipcMain.handle("shell:openExternal", async (_event, args: { url: string }) => {
    if (!isAllowedExternalUrl(args.url)) {
      throw new Error("URL is not allowed for external open");
    }
    await shell.openExternal(args.url);
  });
}
