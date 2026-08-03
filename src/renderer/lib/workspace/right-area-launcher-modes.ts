import { modeRegistry } from "@/lib/workspace/mode-registry";
import type { ModeDefinition } from "@/lib/workspace/mode-registry";

/** Workspace modes shown on the empty RightArea launcher (same source as the「+」menu). */
export function getRightAreaLauncherModes(): ModeDefinition[] {
  return modeRegistry.getAddMenuModes("workspace");
}
