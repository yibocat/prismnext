/**
 * experiments-content — Content area for the Experiments RightArea mode.
 *
 * Routes:
 *   - Home tab (no experimentId) → Files-style recent opens (or empty)
 *   - Detail tab (experimentId) → ExperimentsDetail (multi-tab)
 *
 * Experiment list lives in the mode sidebar (Files-like).
 */

import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { useExperimentStore } from "@/stores/experiment-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";
import { ExperimentsDetail } from "./experiments-detail";
import {
  ExperimentsCorruptMetaBanner,
  ExperimentsEmptyListEmpty,
  ExperimentsLoadError,
  ExperimentsNoFolderEmpty,
} from "./experiments-empty";
import {
  filterRecentExperimentsForDisplay,
  getRecentOpenedExperimentsForProject,
} from "@/lib/experiments/recent";
import { useExperimentProjectRoot } from "./experiments-project-root";

function useExperimentsTabTitleSync(tab: RightTab) {
  const { t, i18n } = useTranslation();
  const updateTab = useRightPanelStore((s) => s.updateTab);
  const experiments = useExperimentStore((s) => s.experiments);
  const detailTitle = useExperimentStore((s) => {
    if (!tab.experimentId || !s.detail || s.detail.meta.id !== tab.experimentId) {
      return null;
    }
    return s.detail.meta.title;
  });

  useEffect(() => {
    if (tab.kind !== "experiments") return;
    if (!tab.experimentId) {
      const homeTitle = t("experiments.title");
      if (tab.title !== homeTitle || tab.experimentsView !== "list") {
        updateTab(tab.id, {
          experimentId: undefined,
          experimentsView: "list",
          title: homeTitle,
        });
      }
      return;
    }
    const fromList = experiments.find((e) => e.id === tab.experimentId)?.title;
    const title = (detailTitle ?? fromList ?? tab.title).slice(0, 48);
    if (tab.title !== title || tab.experimentsView !== "detail") {
      updateTab(tab.id, {
        experimentId: tab.experimentId,
        experimentsView: "detail",
        title,
      });
    }
  }, [
    tab.id,
    tab.kind,
    tab.title,
    tab.experimentId,
    tab.experimentsView,
    experiments,
    detailTitle,
    updateTab,
    t,
    i18n.language,
  ]);
}

function ExperimentsHome({ projectRoot }: { projectRoot: string }) {
  const { t } = useTranslation();
  const experiments = useExperimentStore((s) => s.experiments);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);
  const openExperimentTab = useRightPanelStore((s) => s.openExperimentTab);
  const recentByProject = useSettingsStore((s) => s.settings.recentOpenedExperimentsByProject);

  const recent = useMemo(() => {
    const known = new Set(experiments.map((e) => e.id));
    const entries = getRecentOpenedExperimentsForProject(projectRoot, recentByProject);
    return filterRecentExperimentsForDisplay(entries, known).slice(0, 8);
  }, [projectRoot, recentByProject, experiments]);

  const handleOpen = (id: string, name: string) => {
    openExperimentTab(id, name);
    void selectExperiment(projectRoot, id);
  };

  if (recent.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 font-sans">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <p className="text-[length:var(--font-size-13)] text-foreground">
            {t("experiments.content.pickFromSidebar")}
          </p>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            {t("experiments.content.pickFromSidebarDesc")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 font-sans">
      <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
        {t("experiments.content.pickFromSidebar")}
      </p>
      <div className="w-full max-w-xs space-y-1">
        <p className="text-center text-[length:var(--font-hint)] text-muted-foreground">
          {t("experiments.content.recent")}
        </p>
        {recent.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="w-full truncate rounded px-2 py-1 text-left text-[length:var(--font-size-12)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={entry.id}
            onClick={() => handleOpen(entry.id, entry.name)}
          >
            {entry.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExperimentsContent({
  tab,
  isActive,
}: {
  tab: RightTab;
  isActive: boolean;
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const refreshList = useExperimentStore((s) => s.refreshList);
  const error = useExperimentStore((s) => s.error);
  const experiments = useExperimentStore((s) => s.experiments);
  const corruptIds = useExperimentStore((s) => s.corruptIds);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const detail = useExperimentStore((s) => s.detail);
  const loading = useExperimentStore((s) => s.loading);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);
  const showArchived = useExperimentStore((s) => s.showArchived);

  useExperimentsTabTitleSync(tab);

  useEffect(() => {
    if (!projectRoot) return;
    void refreshList(projectRoot);
  }, [projectRoot, refreshList, showArchived]);

  useEffect(() => {
    if (!projectRoot || !isActive) return;
    if (!tab.experimentId) return;
    if (selectedId === tab.experimentId && detail?.meta.id === tab.experimentId) return;
    void selectExperiment(projectRoot, tab.experimentId);
  }, [projectRoot, tab.experimentId, isActive, selectExperiment, selectedId, detail?.meta.id]);

  if (!projectRoot) {
    return (
      <div className="flex h-full items-center justify-center font-sans text-sm text-muted-foreground">
        {t("experiments.empty.openProject")}
      </div>
    );
  }

  if (error === "no_experiment_folder") {
    return <ExperimentsNoFolderEmpty />;
  }

  const shellClass = cn("flex h-full min-h-0 flex-col font-sans", !isActive && "hidden");

  if (tab.experimentId) {
    if (error && !detail) {
      return (
        <ExperimentsLoadError
          error={error}
          onRetry={() => void selectExperiment(projectRoot, tab.experimentId!)}
        />
      );
    }
    if (detail && detail.meta.id === tab.experimentId) {
      return (
        <div className={shellClass}>
          <ExperimentsCorruptMetaBanner corruptIds={corruptIds} />
          <div className="min-h-0 flex-1">
            <ExperimentsDetail meta={detail.meta} tab={tab} />
          </div>
        </div>
      );
    }
    return (
      <div className={cn(shellClass, "items-center justify-center")}>
        <Loader2Icon
          className="size-5 animate-spin text-muted-foreground/60"
          aria-label={t("experiments.content.loadingExperiment")}
        />
      </div>
    );
  }

  if (error && experiments.length === 0 && !detail) {
    return (
      <ExperimentsLoadError
        error={error}
        onRetry={() => void refreshList(projectRoot)}
      />
    );
  }

  if (loading && experiments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon
          className="size-5 animate-spin text-muted-foreground/60"
          aria-label={t("experiments.content.loadingExperiments")}
        />
      </div>
    );
  }

  if (!loading && experiments.length === 0) {
    return (
      <div className={shellClass}>
        <ExperimentsCorruptMetaBanner corruptIds={corruptIds} />
        <ExperimentsEmptyListEmpty archivedOnly={showArchived} />
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <ExperimentsCorruptMetaBanner corruptIds={corruptIds} />
      <ExperimentsHome projectRoot={projectRoot} />
    </div>
  );
}
