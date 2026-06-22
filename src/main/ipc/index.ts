import { registerFsHandlers } from "./fs";
import { registerCompileHandlers } from "./compile";
import { registerChatHandlers, disposeChat } from "./chat";
import { registerSettingsHandlers } from "./settings";
import { registerBrowserHandlers } from "./browser";
import { registerTerminalHandlers } from "./terminal";
import { registerGitHandlers } from "./git";
import { registerWorktreeHandlers } from "./worktree";
import { registerLogHandlers } from "./log";
import { registerThemeHandlers } from "./theme";
import { registerWorkspaceHandlers } from "./workspace";
import { registerCommandsHandlers } from "./commands";
import { registerSkillsHandlers } from "./skills";
import { registerProfilesHandlers } from "./profiles";

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerCompileHandlers();
  registerChatHandlers();
  registerSettingsHandlers();
  registerBrowserHandlers();
  registerTerminalHandlers();
  registerGitHandlers();
  registerWorktreeHandlers();
  registerLogHandlers();
  registerThemeHandlers();
  registerWorkspaceHandlers();
  registerCommandsHandlers();
  registerSkillsHandlers();
  registerProfilesHandlers();
}

export { disposeChat };
