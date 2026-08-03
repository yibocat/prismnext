/**
 * experiments-sidebar — Experiment list (Files-like). Click opens/focuses a
 * detail tab (multi-tab). New / status filters live in the toolbar.
 */

import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import { useExperimentStore } from "@/stores/experiment-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  experimentsCardMetaClass,
  experimentsPathCompactClass,
  formatExperimentRelativeTime,
} from "./experiments-detail-chrome";
import { useExperimentProjectRoot } from "./experiments-project-root";
import type { ExperimentSummary } from "../../../shared/experiment-log";
import { experimentMentionDragPayload } from "./experiment-run-drag";
import { setComposerDragData } from "@/lib/chat/composer-drag";

const ROW =
  "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors";
const ROW_IDLE = "hover:bg-accent text-muted-foreground hover:text-foreground";
const ROW_ACTIVE = "bg-sidebar-accent text-sidebar-accent-foreground";

function ExperimentListRow({
  experiment,
  active,
  onSelect,
}: {
  experiment: ExperimentSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const runLabel =
    experiment.runCount === 1
      ? t("experiments.grid.oneRun")
      : t("experiments.grid.nRuns", { count: experiment.runCount });

  return (
    <button
      type="button"
      className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        setComposerDragData(e.dataTransfer, [experimentMentionDragPayload(experiment)]);
      }}
      onClick={onSelect}
      title={experiment.title}
      data-experiment-id={experiment.id}
      aria-current={active ? "true" : undefined}
    >
      <span className="min-w-0 truncate font-sans text-[length:var(--font-size-12)] font-medium">
        {experiment.title}
      </span>
      <span
        className={cn(
          experimentsCardMetaClass,
          active && "text-sidebar-accent-foreground/75",
        )}
      >
        {formatExperimentRelativeTime(experiment.lastRunAt)} · {runLabel}
      </span>
      {experiment.workspacePath ? (
        <span
          className={cn(
            experimentsPathCompactClass,
            "opacity-70",
            active && "text-sidebar-accent-foreground/65",
          )}
        >
          {experiment.workspacePath}
        </span>
      ) : null}
    </button>
  );
}

export function ExperimentsSidebar() {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const tabs = useRightPanelStore((s) => s.tabs);
  const openExperimentTab = useRightPanelStore((s) => s.openExperimentTab);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeExperimentId =
    activeTab?.kind === "experiments" ? activeTab.experimentId : undefined;

  const loading = useExperimentStore((s) => s.loading);
  const experiments = useExperimentStore((s) => s.experiments);
  const showArchived = useExperimentStore((s) => s.showArchived);
  const refreshList = useExperimentStore((s) => s.refreshList);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);

  useEffect(() => {
    if (!projectRoot) return;
    void refreshList(projectRoot);
  }, [projectRoot, refreshList, showArchived]);

  const handleSelect = useCallback(
    (exp: ExperimentSummary) => {
      if (!projectRoot) return;
      openExperimentTab(exp.id, exp.title);
      void selectExperiment(projectRoot, exp.id);
    },
    [openExperimentTab, projectRoot, selectExperiment],
  );

  return (
    <>
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between gap-2 px-3">
        <span className="truncate font-sans text-[length:var(--font-size-12)] font-medium text-muted-foreground">
          {showArchived
            ? t("experiments.sidebar.archivedList")
            : t("experiments.sidebar.list")}
        </span>
        {loading ? (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground/60" />
        ) : (
          <span className="shrink-0 tabular-nums font-sans text-[length:var(--font-size-11)] text-muted-foreground/70">
            {experiments.length}
          </span>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-auto px-2 py-2">
        {!projectRoot ? (
          <p className="px-2 py-1 font-sans text-[length:var(--font-size-12)] text-muted-foreground">
            {t("experiments.empty.openProject")}
          </p>
        ) : experiments.length === 0 && !loading ? (
          <p className="px-2 py-1 font-sans text-[length:var(--font-size-12)] leading-relaxed text-muted-foreground">
            {showArchived
              ? t("experiments.empty.noArchived")
              : t("experiments.sidebar.emptyList")}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {experiments.map((exp) => (
              <ExperimentListRow
                key={exp.id}
                experiment={exp}
                active={activeExperimentId === exp.id}
                onSelect={() => handleSelect(exp)}
              />
            ))}
          </div>
        )}
      </SidebarContent>
    </>
  );
}
