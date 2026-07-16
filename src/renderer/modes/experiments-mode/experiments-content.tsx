/**
 * experiments-content — Content area for the Experiments RightArea mode.
 *
 * Routes:
 *   - Home tab (no experimentId) → browse grid
 *   - Detail tab (experimentId) → ExperimentsDetail for that island
 *
 * Each experiment opens as its own RightArea tab (like Literature papers).
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { useExperimentStore } from "@/stores/experiment-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { cn } from "@/lib/utils";
import { ExperimentsDetail } from "./experiments-detail";
import { ExperimentsGrid } from "./experiments-grid";
import {
  ExperimentsCorruptMetaBanner,
  ExperimentsEmptyListEmpty,
  ExperimentsLoadError,
  ExperimentsNoFolderEmpty,
} from "./experiments-empty";
import { useExperimentProjectRoot } from "./experiments-project-root";

function useExperimentsTabTitleSync(tab: RightTab) {
  const { t, i18n } = useTranslation();
  const updateTab = useRightPanelStore((s) => s.updateTab);
  const experiments = useExperimentStore((s) => s.experiments);
  const detailTitle = useExperimentStore((s) => {
    // Home tabs have no experimentId (`undefined`). Do not treat
    // `detail?.meta.id === undefined` as a match when detail is null.
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

  // Detail tabs drive store selection when focused.
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

  // Detail tab
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
            <ExperimentsDetail meta={detail.meta} />
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

  // Home / browse tab
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
      <div className="min-h-0 flex-1">
        <ExperimentsGrid />
      </div>
    </div>
  );
}
