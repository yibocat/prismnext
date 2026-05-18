import { registerFsHandlers } from "./ipc-fs";
import { registerCompileHandlers } from "./ipc-compile";
import { registerClaudeHandlers } from "./ipc-claude";
import { registerSettingsHandlers } from "./ipc-settings";

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerCompileHandlers();
  registerClaudeHandlers();
  registerSettingsHandlers();
}
