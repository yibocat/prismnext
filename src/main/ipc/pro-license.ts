import { ipcMain } from "electron";
import {
  activateProLicense,
  clearProLicense,
  readProLicense,
} from "../services/pro-license";

export function registerProLicenseHandlers(): void {
  ipcMain.handle("pro:getLicense", async () => {
    return readProLicense();
  });

  ipcMain.handle("pro:activate", async (_event, rawKey: string) => {
    return activateProLicense(typeof rawKey === "string" ? rawKey : "");
  });

  ipcMain.handle("pro:clearLicense", async () => {
    clearProLicense();
    return { ok: true as const };
  });
}
