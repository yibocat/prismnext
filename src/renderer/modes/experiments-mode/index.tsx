/**
 * experiments-mode — ModeDefinition registration for the Experiments
 * RightArea mode (Sprint 0.7).
 *
 * P0 surface: Sidebar (list) + Toolbar (Refresh + Open lab) + Content
 * (empty states + detail placeholder). Detail / run / terminal wiring land
 * in Tasks 5–7.
 *
 * onActivate is SYNC per the literature-mode split: heavy work belongs in
 * Content's `useEffect`, not here. We do fire an initial `refreshList` so
 * the sidebar is populated as soon as the mode is activated, but everything
 * else defers to Content.
 *
 * Per plan §D1: no reader keep-alive shell. List + detail live inside
 * Content, not in `right-main-area.tsx`.
 */

import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { FlaskConicalIcon } from "lucide-react";
import { useExperimentStore } from "@/stores/experiment-store";
import { ExperimentsSidebar } from "./experiments-sidebar";
import { ExperimentsToolbar } from "./experiments-toolbar";
import { ExperimentsContent } from "./experiments-content";
import { getExperimentProjectRoot } from "./experiments-project-root";

function ExperimentsToolbarWrapper({ tab }: { tab: RightTab }) {
  return <ExperimentsToolbar tab={tab} />;
}

export const experimentsMode: ModeDefinition = {
  id: "experiments",
  label: "Experiments",
  labelKey: "modes.experiments.label",
  icon: <FlaskConicalIcon className="size-3.5" />,
  tabKinds: ["experiments"],
  surface: "workspace",
  initialTitle: "Experiments",
  initialTitleKey: "modes.experiments.initialTitle",
  Sidebar: ExperimentsSidebar,
  Toolbar: ExperimentsToolbarWrapper,
  Content: ExperimentsContent,
  onActivate: () => {
    const projectRoot = getExperimentProjectRoot();
    if (!projectRoot) return;
    void useExperimentStore.getState().refreshList(projectRoot);
  },
};
