import { registerFsHandlers } from "./fs";
import { registerCompileHandlers } from "./compile";
import { registerCliHandlers } from "./cli";
import { registerSettingsHandlers } from "./settings";
import { registerBrowserHandlers } from "./browser";

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerCompileHandlers();
  registerCliHandlers();
  registerSettingsHandlers();
  registerBrowserHandlers();
}
