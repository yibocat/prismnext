/**
 * experiments-sidebar — Detail properties (Overview + Environment) when an
 * experiment tab is active; browse hint on the home tab.
 */

import { useCallback, useState } from "react";
import { FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { useExperimentStore } from "@/stores/experiment-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { experimentStatusOf } from "../../../shared/experiment-log";
import { literatureDetailBadgeClass } from "@/modes/literature-mode/literature-list-chrome";
import {
  ExperimentsEnvironmentPanel,
  ExperimentsOverviewPanel,
} from "./experiments-overview";
import { experimentsSectionLabelClass } from "./experiments-detail-chrome";
import { useExperimentProjectRoot } from "./experiments-project-root";

export function ExperimentsSidebar() {
  const projectRoot = useExperimentProjectRoot();
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const experimentId =
    activeTab?.kind === "experiments" ? activeTab.experimentId : undefined;

  const loading = useExperimentStore((s) => s.loading);
  const detail = useExperimentStore((s) => s.detail);
  const env = useExperimentStore((s) => s.env);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);
  const runs = detail?.runs ?? [];
  const [envReloading, setEnvReloading] = useState(false);

  const showingDetail =
    Boolean(experimentId) && detail?.meta.id === experimentId && selectedId === experimentId;

  const runCount = detail?.runCount ?? runs.length;
  const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const archived =
    showingDetail && detail ? experimentStatusOf(detail.meta) === "archived" : false;

  const handleRefreshEnv = useCallback(async () => {
    if (!projectRoot || !selectedId) return;
    setEnvReloading(true);
    try {
      await selectExperiment(projectRoot, selectedId);
    } finally {
      setEnvReloading(false);
    }
  }, [projectRoot, selectExperiment, selectedId]);

  return (
    <>
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between gap-2 px-3">
        <span className="truncate font-sans text-[length:var(--font-size-12)] font-medium text-muted-foreground">
          {showingDetail ? "Details" : "Experiments"}
        </span>
        {loading ? (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground/60" />
        ) : showingDetail && archived ? (
          <span className={literatureDetailBadgeClass}>Archived</span>
        ) : null}
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-auto px-2 py-2">
        {showingDetail && detail ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 px-1">
              <FlaskConicalIcon
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/55"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-sans text-[length:var(--font-size-13)] font-medium leading-snug text-foreground">
                  {detail.meta.title}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <h3 className={experimentsSectionLabelClass}>Overview</h3>
              <ExperimentsOverviewPanel
                meta={detail.meta}
                runCount={runCount}
                lastRunAt={detail.lastRunAt ?? lastRun?.finishedAt ?? null}
                lastExitCode={lastRun?.exitCode ?? null}
                compact
              />
            </div>
            <div className="border-t border-border/40 pt-3">
              <ExperimentsEnvironmentPanel
                env={env}
                reloading={envReloading}
                onRefresh={() => void handleRefreshEnv()}
                compact
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2 px-1 py-1">
            <p className={experimentsSectionLabelClass}>Browse</p>
            <p className="font-sans text-[length:var(--font-size-12)] leading-relaxed text-muted-foreground/75">
              Open an experiment from the grid — each one opens as its own tab. Overview and
              Environment for the active tab appear here.
            </p>
          </div>
        )}
      </SidebarContent>
    </>
  );
}
