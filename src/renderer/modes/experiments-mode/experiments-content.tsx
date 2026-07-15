/**
 * experiments-content — Content area for the Experiments RightArea mode
 * (Sprint 0.7).
 *
 * Routes the primary states for the mode:
 *   1. No project              — centered muted copy (mirrors literature).
 *   2. No Experiment folder    — `ExperimentsNoFolderEmpty` (settings link).
 *   3. Empty registry list     — `ExperimentsEmptyListEmpty`.
 *   4. Browse                  — `ExperimentsGrid` (card gallery).
 *   5. Detail                  — `ExperimentsDetail`.
 *
 * Mode sidebar open/close uses the shared RightArea path (`rightSidebarOpen`,
 * TabToolbar toggle, drag handle) — same as Files / Git / Literature.
 *
 * Bootstrap (refresh list on project change) is keyed on `projectRoot` per
 * the literature-mode split: heavy IPC work lives here, NOT in onActivate.
 */

import { useEffect } from "react";
import { Loader2Icon } from "lucide-react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { cn } from "@/lib/utils";
import { ExperimentsDetail } from "./experiments-detail";
import { ExperimentsGrid } from "./experiments-grid";
import {
  ExperimentsEmptyListEmpty,
  ExperimentsNoFolderEmpty,
} from "./experiments-empty";

function useExperimentsTabSync(
  tab: RightTab,
  selectedId: string | null,
  experiments: { id: string; title: string }[],
) {
  const updateTab = useRightPanelStore((s) => s.updateTab);

  useEffect(() => {
    if (tab.kind !== "experiments") return;
    if (selectedId) {
      const exp = experiments.find((e) => e.id === selectedId);
      updateTab(tab.id, {
        experimentId: selectedId,
        experimentsView: "detail",
        title: exp?.title.slice(0, 48) ?? tab.title,
      });
      return;
    }
    updateTab(tab.id, {
      experimentId: undefined,
      experimentsView: "list",
      title: "Experiments",
    });
  }, [tab.id, tab.kind, tab.title, selectedId, experiments, updateTab]);
}

export function ExperimentsContent({
  tab,
  isActive,
}: {
  tab: RightTab;
  isActive: boolean;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const refreshList = useExperimentStore((s) => s.refreshList);
  const error = useExperimentStore((s) => s.error);
  const experiments = useExperimentStore((s) => s.experiments);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const detail = useExperimentStore((s) => s.detail);
  const env = useExperimentStore((s) => s.env);
  const loading = useExperimentStore((s) => s.loading);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);

  useExperimentsTabSync(tab, selectedId, experiments);

  useEffect(() => {
    if (!projectRoot) return;
    void refreshList(projectRoot);
  }, [projectRoot, refreshList]);

  // Deep link: tab carries experimentId (e.g. future /experiment open <id>).
  useEffect(() => {
    if (!projectRoot || !tab.experimentId || !isActive) return;
    if (useExperimentStore.getState().selectedId === tab.experimentId) return;
    void selectExperiment(projectRoot, tab.experimentId);
  }, [projectRoot, tab.experimentId, isActive, selectExperiment]);

  if (!projectRoot) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Open a project first.
      </div>
    );
  }

  if (error === "no_experiment_folder") {
    return <ExperimentsNoFolderEmpty />;
  }

  if (!loading && experiments.length === 0 && !detail) {
    return <ExperimentsEmptyListEmpty />;
  }

  const shellClass = cn("h-full min-h-0", !isActive && "hidden");

  if (selectedId) {
    if (detail && detail.meta.id === selectedId) {
      return (
        <div className={shellClass}>
          <ExperimentsDetail meta={detail.meta} env={env} />
        </div>
      );
    }
    return (
      <div className={cn(shellClass, "flex h-full items-center justify-center")}>
        <Loader2Icon className="size-5 animate-spin text-muted-foreground/60" aria-label="Loading experiment" />
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <ExperimentsGrid />
    </div>
  );
}
