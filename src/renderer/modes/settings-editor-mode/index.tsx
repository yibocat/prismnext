import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { SlidersHorizontalIcon } from "lucide-react";
import { SettingsEditorContent } from "@/components/modules/settings/settings-editor-content";

function SettingsEditorSidebar() {
  return null;
}

export const settingsEditorMode: ModeDefinition = {
  id: "settings-editor",
  label: "Settings",
  labelKey: "modes.settingsEditor.label",
  icon: <SlidersHorizontalIcon className="size-3.5" />,
  tabKinds: ["settings-editor"],
  surface: "settings",
  showInAddMenu: false,
  initialTitle: "Settings",
  initialTitleKey: "modes.settingsEditor.initialTitle",
  Sidebar: SettingsEditorSidebar,
  Content: SettingsEditorContent,
};

export type SettingsEditorTab = RightTab & {
  kind: "settings-editor";
  settingsSlot: NonNullable<RightTab["settingsSlot"]>;
};
