import { modeRegistry } from "@/lib/workspace/mode-registry";
import { filesMode } from "./files-mode";
import { researchPlanMode } from "./research-plan-mode";
import { gitMode } from "./git-mode";
import { browserMode } from "./browser-mode";
import { terminalMode } from "./terminal-mode";
import { texworkspaceMode } from "./texworkspace-mode";
import { settingsEditorMode } from "./settings-editor-mode";
import { literatureMode } from "./literature-mode";
import { experimentsMode } from "./experiments-mode";
import { interactionMode } from "./interaction-mode";
import "@/lib/interaction/open-interaction-panel";

export function registerAllModes(): void {
  modeRegistry.register(filesMode);
  modeRegistry.register(researchPlanMode);
  modeRegistry.register(gitMode);
  modeRegistry.register(browserMode);
  modeRegistry.register(terminalMode);
  modeRegistry.register(texworkspaceMode);
  modeRegistry.register(settingsEditorMode);
  modeRegistry.register(literatureMode);
  modeRegistry.register(experimentsMode);
  modeRegistry.register(interactionMode);
}
