// prism-next/src/main/ipc/update.ts
// IPC surface for the lightweight update checker. The renderer drives checks
// (manual button); open-download reuses shell:openExternal (https-only) so no
// dedicated download handler is needed here.
// About also reads app + bundled OpenCode versions here (same settings panel).

import { ipcMain } from "electron";
import {
  checkForUpdates,
  getCachedStatus,
  ignoreVersion,
  unignoreVersion,
} from "../services/update-checker";
import { getAboutVersions } from "../services/opencode-binary";

export function registerUpdateHandlers(): void {
  ipcMain.handle("update:check", async () => {
    return checkForUpdates();
  });

  ipcMain.handle("update:status", async () => {
    return getCachedStatus();
  });

  ipcMain.handle("update:ignore", async (_event, args: { version: string }) => {
    ignoreVersion(args.version);
    return getCachedStatus();
  });

  ipcMain.handle("update:unignore", async () => {
    unignoreVersion();
    return getCachedStatus();
  });

  ipcMain.handle("about:getVersions", async () => {
    return getAboutVersions();
  });
}
