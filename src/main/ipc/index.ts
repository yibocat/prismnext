import { registerFsHandlers } from "./ipc-fs";
import { registerCompileHandlers } from "./ipc-compile";
import { registerClaudeHandlers } from "./ipc-claude";
import { registerAgentHandlers } from "./ipc-agent";
import { registerSettingsHandlers } from "./ipc-settings";

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerCompileHandlers();
  registerClaudeHandlers(); // old Claude direct integration (to be removed)
  registerAgentHandlers();  // new ACP-based agent integration
  registerSettingsHandlers();
}
