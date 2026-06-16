import { registerFsHandlers } from "./fs";
import { registerCompileHandlers } from "./compile";
import { registerCliHandlers } from "./cli";
import { registerSettingsHandlers } from "./settings";
import { registerBrowserHandlers } from "./browser";
import { registerTerminalHandlers } from "./terminal";
import { registerGitHandlers } from "./git";
import { registerWorktreeHandlers } from "./worktree";
import { registerLogHandlers } from "./log";
import { registerThemeHandlers } from "./theme";
import { registerWorkspaceHandlers } from "./workspace";

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerCompileHandlers();
  registerCliHandlers();
  registerSettingsHandlers();
  registerBrowserHandlers();
  registerTerminalHandlers();
  registerGitHandlers();
  registerWorktreeHandlers();
  registerLogHandlers();
  registerThemeHandlers();
  registerWorkspaceHandlers();
}
