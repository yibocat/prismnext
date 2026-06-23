import { modeRegistry } from "@/lib/workspace/mode-registry";
import { filesMode } from "./files-mode";
import { gitMode } from "./git-mode";
import { browserMode } from "./browser-mode";
import { terminalMode } from "./terminal-mode";
import { texworkspaceMode } from "./texworkspace-mode";

export function registerAllModes(): void {
  modeRegistry.register(filesMode);
  modeRegistry.register(gitMode);
  modeRegistry.register(browserMode);
  modeRegistry.register(terminalMode);
  modeRegistry.register(texworkspaceMode);
}
