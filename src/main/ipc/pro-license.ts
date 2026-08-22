import { ipcMain } from "electron";
import {
  activateProLicense,
  clearProLicense,
  readProLicense,
} from "../teams/pro-license";
import { handleProLicenseChanged } from "../teams/pro-teams-discovery";

export function registerProLicenseHandlers(): void {
  ipcMain.handle("pro:getLicense", async () => {
    return readProLicense();
  });

  ipcMain.handle("pro:activate", async (_event, rawKey: string) => {
    const result = activateProLicense(typeof rawKey === "string" ? rawKey : "");
    // 激活成功 → 授权门翻转：catalog locked 标记 + 全项目内容再同步（§8.3）
    if (result.ok) handleProLicenseChanged();
    return result;
  });

  ipcMain.handle("pro:clearLicense", async () => {
    clearProLicense();
    // license 清除 → pro pack 内容即时失活（即使历史上装过；§8.3 第 4 行）
    handleProLicenseChanged();
    return { ok: true as const };
  });
}
