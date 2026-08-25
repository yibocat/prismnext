import { isValidElement } from "react";
import type { LucideIcon } from "lucide-react";
import type { ModeDefinition } from "@/lib/workspace/mode-registry";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { useLayoutStore } from "@/stores/layout-store";
import {
  dismissModeFromRightArea,
  focusModeInRightArea,
  isWorkspaceModeOpen,
} from "./panel-utils";
import { getModeShortcutId } from "@/lib/workspace/mode-shortcuts";
import type { LeftNavDefinition } from "./types";

/** Mode.icon is a JSX element (`<GitBranchIcon />`). Left nav renders `<Icon />`. */
export function lucideIconFromMode(mode: Pick<ModeDefinition, "id" | "icon">): LucideIcon {
  const icon = mode.icon;
  if (isValidElement(icon) && typeof icon.type !== "string") {
    return icon.type as LucideIcon;
  }
  throw new Error(`Mode "${mode.id}" icon must be a Lucide element`);
}

/** Keep existing sidebar copy for modes that already had a nav key. */
const LEFT_NAV_LABEL_KEY: Record<string, string> = {
  literature: "nav.library",
  texworkspace: "nav.texWorkspace",
  experiments: "nav.experiments",
};

/**
 * One left-nav slot per workspace RightArea mode.
 * Do not set `deactivate` — sibling modes stay open (tabs are the truth).
 */
export function leftNavFromWorkspaceMode(
  mode: ModeDefinition,
  order: number,
): LeftNavDefinition {
  return {
    id: mode.id,
    section: "primary",
    label: mode.label,
    labelKey: LEFT_NAV_LABEL_KEY[mode.id] ?? mode.labelKey,
    icon: lucideIconFromMode(mode),
    order,
    toggleable: true,
    isActive: () => {
      if (useLayoutStore.getState().leftSidebarView !== "sessions") return false;
      return isWorkspaceModeOpen(mode.id);
    },
    activate: () => {
      focusModeInRightArea(mode.id, { maximize: true });
    },
    onToggleOff: () => {
      dismissModeFromRightArea(mode.id, () => {
        useLayoutStore.getState().setLeftSidebarView("sessions");
      });
    },
    shortcutId: getModeShortcutId(mode.id),
  };
}

/** Live projection of `modeRegistry.getLeftNavModes()` — new modules appear here. */
export function workspaceModeNavItems(): LeftNavDefinition[] {
  return modeRegistry
    .getLeftNavModes()
    .map((mode, index) => leftNavFromWorkspaceMode(mode, 10 + index * 10));
}
