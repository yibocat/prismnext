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
import { registerRulesHandlers } from "./rules";
import { registerProfilesHandlers } from "./profiles";
import { registerShellHandlers } from "./shell";
import { registerLiteratureHandlers } from "./literature";
import { registerLiteratureExtractHandlers } from "./literature-extract";
import { registerBibliographyHandlers } from "./bibliography";
import { registerZoteroHandlers } from "./zotero";

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
  registerRulesHandlers();
  registerProfilesHandlers();
  registerShellHandlers();
  registerLiteratureHandlers();
  registerLiteratureExtractHandlers();
  registerBibliographyHandlers();
  registerZoteroHandlers();
}

export { disposeChat };
