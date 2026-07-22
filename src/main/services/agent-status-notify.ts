import { BrowserWindow } from "electron";
import type { AgentStatusSnapshot } from "../../shared/agent-status";

/** Push ACP lifecycle changes so the status dot updates without waiting for poll. */
export function emitAgentStatusChanged(status: AgentStatusSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("chat:agentStatus", status);
    }
  }
}
