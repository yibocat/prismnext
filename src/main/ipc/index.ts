import { registerFsHandlers } from "./fs";
import { registerCompileHandlers } from "./compile";
import { registerAgentHandlers } from "./agent";
import { registerSettingsHandlers } from "./settings";

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerCompileHandlers();
  registerAgentHandlers();
  registerSettingsHandlers();
}
