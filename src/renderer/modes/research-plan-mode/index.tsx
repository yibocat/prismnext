import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { ListTodoIcon } from "lucide-react";
import { FilesContent } from "@/modes/files-mode/files-content";
import { ResearchPlanToolbar } from "./research-plan-toolbar";

/**
 * Dedicated Plan-of-record surface: reuses Files editor content, own toolbar.
 * Hidden from the mode button strip (`showInModeToolbar: false`).
 */
export const researchPlanMode: ModeDefinition = {
  id: "research-plan",
  label: "Plan",
  labelKey: "modes.researchPlan.label",
  icon: <ListTodoIcon className="size-3.5" />,
  tabKinds: ["research-plan"],
  surface: "any",
  showInModeToolbar: false,
  persistence: "transient",
  initialTitle: "Plan",
  initialTitleKey: "modes.researchPlan.initialTitle",
  hideRightSidebar: true,
  Toolbar: ({ tab }: { tab: RightTab }) => <ResearchPlanToolbar tab={tab} />,
  Content: FilesContent,
};
