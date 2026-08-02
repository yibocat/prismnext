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
  surface: "workspace",
  /** Opened from Chat cards — not listed in the「+」add menu. */
  showInAddMenu: false,
  hideRightSidebar: true,
  initialTitle: "Interaction",
  initialTitleKey: "modes.interaction.initialTitle",
  Toolbar: InteractionToolbarWrapper,
  Content: InteractionContent,
};
