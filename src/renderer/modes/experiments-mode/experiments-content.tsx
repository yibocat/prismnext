/**
 * experiments-content — Content area for the Experiments RightArea mode
 * (Sprint 0.7).
 *
 * Routes the four primary states for the mode:
 *   1. No project              — centered muted copy (mirrors literature).
 *   2. No Experiment folder    — `ExperimentsNoFolderEmpty` (settings link).
 *   3. Empty registry list     — `ExperimentsEmptyListEmpty` (focus chat).
 *   4. List with selection     — `ExperimentsDetail` stub (Task 5+ will
 *                                replace with brief strip + env + run panel
 *                                + runs table).
 *
 * Bootstrap (refresh list on project change) is keyed on `projectRoot` per
 * the literature-mode split: heavy IPC work lives here, NOT in onActivate.
 *
 * Per plan §D1: the detail lives in this Content component, not in a
 * `LiteratureReaderShell`-style keep-alive shell. We deliberately do NOT
 * touch `right-main-area.tsx`.
 */

import { useEffect } from "react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { cn } from "@/lib/utils";
import { ExperimentsDetail } from "./experiments-detail";
import {
  ExperimentsEmptyListEmpty,
  ExperimentsNoFolderEmpty,
} from "./experiments-empty";

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

  // Bootstrap: refresh the list whenever the project changes. Mirrors the
  // literature-mode Content pattern (`useEffect(…, [projectRoot, …])`).
  useEffect(() => {
    if (!projectRoot) return;
    void refreshList(projectRoot);
  }, [projectRoot, refreshList]);

  // 1. No project — centered muted copy.
  if (!projectRoot) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Open a project first.
      </div>
    );
  }

  // 2. No experiment folder configured (specific error code from service).
  if (error === "no_experiment_folder") {
    return <ExperimentsNoFolderEmpty />;
  }

  // 3. Folder configured but empty list (and not still loading).
  if (!loading && experiments.length === 0 && !detail) {
    return <ExperimentsEmptyListEmpty />;
  }

  // 4. List non-empty + selection: show detail. The detail panel renders
  //    inside the Content component (no reader shell — see plan §D1).
  if (selectedId && detail && detail.meta.id === selectedId) {
    return (
      <div className={cn("h-full min-h-0", !isActive && "hidden")}>
        <ExperimentsDetail meta={detail.meta} env={env} />
      </div>
    );
  }

  // 4b. List non-empty but nothing selected — prompt the user to pick one.
  return (
    <div
      className={cn(
        "flex h-full items-center justify-center px-6 text-muted-foreground text-sm",
        !isActive && "hidden",
      )}
    >
      Select an experiment from the list.
    </div>
  );
}
