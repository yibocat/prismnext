import { modeRegistry } from "@/lib/workspace/mode-registry";
import { filesMode } from "./files-mode";
import { gitMode } from "./git-mode";
import { browserMode } from "./browser-mode";
import { terminalMode } from "./terminal-mode";
import { texworkspaceMode } from "./texworkspace-mode";
import { settingsEditorMode } from "./settings-editor-mode";
import { literatureMode } from "./literature-mode";
import { experimentsMode } from "./experiments-mode";

export function registerAllModes(): void {
  modeRegistry.register(filesMode);
  modeRegistry.register(gitMode);
  modeRegistry.register(browserMode);
  modeRegistry.register(terminalMode);
  modeRegistry.register(texworkspaceMode);
  modeRegistry.register(settingsEditorMode);
  modeRegistry.register(literatureMode);
  modeRegistry.register(experimentsMode);
}
