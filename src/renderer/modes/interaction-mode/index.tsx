import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { SparklesIcon } from "lucide-react";
import { InteractionContent } from "./interaction-content";
import { InteractionToolbar } from "./interaction-toolbar";

function InteractionToolbarWrapper({ tab }: { tab: RightTab }) {
  return <InteractionToolbar tab={tab} />;
}

export const interactionMode: ModeDefinition = {
  id: "interaction",
  label: "Interaction",
  labelKey: "modes.interaction.label",
  icon: <SparklesIcon className="size-3.5" />,
  tabKinds: ["interaction"],
  surface: "any",
  /** Opened from Chat cards — not listed in the RightArea mode toolbar (P0). */
  showInModeToolbar: false,
  hideRightSidebar: true,
  persistence: "transient",
  initialTitle: "Interaction",
  initialTitleKey: "modes.interaction.initialTitle",
  Toolbar: InteractionToolbarWrapper,
  Content: InteractionContent,
};
