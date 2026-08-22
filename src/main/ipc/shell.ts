import { ipcMain, shell } from "electron";
import { notifyDesktop } from "../services/desktop-notifications";
import { setTrayMenuSnapshot, setTrayStatus } from "../services/tray";
import type {
  DesktopNotifyKind,
  TrayMenuSnapshot,
  TrayStatus,
} from "../../shared/platform/desktop-shell";

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

  ipcMain.handle(
    "shell:desktopNotify",
    (
      _event,
      args: { kind: DesktopNotifyKind; title: string; body: string; tabId?: string },
    ) => {
      return notifyDesktop(args);
    },
  );

  ipcMain.handle(
    "shell:setTrayStatus",
    (_event, args: { status: TrayStatus; tooltip?: string | null; runningCount?: number }) => {
      const status = args?.status;
      if (status === "idle" || status === "busy" || status === "attention") {
        setTrayStatus(status, args?.tooltip, args?.runningCount);
      }
    },
  );

  ipcMain.handle("shell:setTrayMenu", (_event, snapshot: TrayMenuSnapshot) => {
    if (!snapshot || typeof snapshot !== "object") return;
    setTrayMenuSnapshot(snapshot);
  });
}
