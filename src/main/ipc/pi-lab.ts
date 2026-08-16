/**
 * Isolated IPC for the Pi Agent Lab. Do not route production chat through here.
 */

import { BrowserWindow, ipcMain } from "electron";
import type { PiLabSendInput } from "../../shared/pi-lab";
import { getPiLabService } from "../agent/pi-lab-service";

export function registerPiLabHandlers(): void {
  ipcMain.handle("pi-lab:status", async (_event, args?: { projectRoot?: string }) => {
    const lab = await getPiLabService();
    return lab.status(args?.projectRoot);
  });

  ipcMain.handle("pi-lab:send", async (event, args: PiLabSendInput) => {
    const lab = await getPiLabService();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) lab.attachWindow(win);
    return lab.send(args);
  });

  ipcMain.handle("pi-lab:cancel", async () => {
    const lab = await getPiLabService();
    await lab.cancel();
    return { ok: true };
  });

  ipcMain.handle("pi-lab:reset", async () => {
    const lab = await getPiLabService();
    await lab.reset();
    return { ok: true };
  });

  ipcMain.handle(
    "pi-lab:resolvePermission",
    async (_event, args: { requestId: string; decision: "allow" | "deny" }) => {
      const lab = await getPiLabService();
      return { ok: lab.resolvePermission(args.requestId, args.decision) };
    },
  );
}
