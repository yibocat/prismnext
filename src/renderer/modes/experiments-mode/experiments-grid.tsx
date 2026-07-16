/**
 * experiments-grid — Card browse view for the Experiments mode (Sprint 0.7).
 *
 * Virtualized with VirtuosoGrid so large registries stay scroll-smooth.
 * Arrow keys move focus across cards; Enter opens the focused island.
 */

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { VirtuosoGrid } from "react-virtuoso";
import { useExperimentProjectRoot } from "./experiments-project-root";
import { useExperimentStore } from "@/stores/experiment-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { cn } from "@/lib/utils";
import type { ExperimentSummary } from "../../../shared/experiment-log";
import { stepFocusIndex } from "./experiments-runs-query";
import {
  experimentLabBasename,
  experimentsPathCompactClass,
  experimentsCardMetaClass,
  experimentsCardShellClass,
  experimentsCardTitleClass,
  experimentsGridClass,
  experimentsSectionLabelClass,
  formatExperimentRelativeTime,
} from "./experiments-detail-chrome";

function ExperimentCard({
  experiment,
  onSelect,
  focused,
  onFocus,
}: {
  experiment: ExperimentSummary;
  onSelect: () => void;
  focused: boolean;
  onFocus: () => void;
}) {
  const { t } = useTranslation();
  const labName = experimentLabBasename(experiment.workspacePath);
  const runLabel =
    experiment.runCount === 1
      ? t("experiments.grid.oneRun")
      : t("experiments.grid.nRuns", { count: experiment.runCount });
  const archived = experiment.status === "archived";

  return (
    <button
      type="button"
      className={cn(
        experimentsCardShellClass,
        focused && "bg-muted/50",
        archived && "opacity-60",
      )}
      onClick={onSelect}
      onFocus={onFocus}
      title={experiment.title}
      data-experiment-card={experiment.id}
      data-status={experiment.status}
      tabIndex={focused ? 0 : -1}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <FlaskConicalIcon
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/55"
            aria-hidden
          />
          <span className={cn(experimentsCardTitleClass, "min-w-0 flex-1")}>
            {experiment.title}
          </span>
          {archived ? (
            <span className="shrink-0 rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 font-sans text-[length:var(--font-size-10)] text-muted-foreground/80">
              {t("experiments.archived")}
            </span>
          ) : null}
        </div>
        <div className="mt-auto space-y-1">
          <p className={experimentsCardMetaClass}>
            <span>{formatExperimentRelativeTime(experiment.lastRunAt)}</span>
            <span className="text-muted-foreground/35"> · </span>
            <span className="tabular-nums">{runLabel}</span>
          </p>
          <p
            className={cn(experimentsPathCompactClass, "text-muted-foreground/65")}
            title={experiment.workspacePath}
          >
            {labName}
          </p>
        </div>
      </div>
    </button>
  );
}

export function ExperimentsGrid() {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const experiments = useExperimentStore((s) => s.experiments);
  const loading = useExperimentStore((s) => s.loading);
  const showArchived = useExperimentStore((s) => s.showArchived);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);
  const openExperimentTab = useRightPanelStore((s) => s.openExperimentTab);
  const [focusIndex, setFocusIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    return [...experiments].sort((a, b) => {
      const aT = a.lastRunAt ? Date.parse(a.lastRunAt) : 0;
      const bT = b.lastRunAt ? Date.parse(b.lastRunAt) : 0;
      if (aT !== bT) return bT - aT;
      return a.id.localeCompare(b.id);
    });
  }, [experiments]);

  const openAt = useCallback(
    (index: number) => {
      const exp = sorted[index];
      if (!projectRoot || !exp) return;
      openExperimentTab(exp.id, exp.title);
      void selectExperiment(projectRoot, exp.id);
    },
    [openExperimentTab, projectRoot, selectExperiment, sorted],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (sorted.length === 0) return;
      const width = listRef.current?.clientWidth ?? 0;
      // Match fluid auto-fill tracks (~15rem min).
      const cols = Math.max(1, Math.floor(width / 240));

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusIndex((i) => stepFocusIndex(i, cols, sorted.length));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusIndex((i) => stepFocusIndex(i, -cols, sorted.length));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusIndex((i) => stepFocusIndex(i, 1, sorted.length));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusIndex((i) => stepFocusIndex(i, -1, sorted.length));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openAt(focusIndex < 0 ? 0 : focusIndex);
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setFocusIndex(sorted.length - 1);
      }
    },
    [focusIndex, openAt, sorted.length],
  );

  const safeFocus = sorted.length === 0 ? -1 : Math.min(focusIndex, sorted.length - 1);

  return (
    <div className="flex h-full min-h-0 flex-col px-6 py-5 font-sans @md:px-8 @md:py-6">
      <div className="mb-4 flex h-6 shrink-0 items-center justify-between gap-2">
        <h2 className={experimentsSectionLabelClass}>
          {showArchived ? t("experiments.archived") : t("experiments.title")}
        </h2>
        <span className="tabular-nums text-[length:var(--font-size-11)] text-muted-foreground/50">
          {loading ? (
            <Loader2Icon
              className="size-3 animate-spin"
              aria-label={t("experiments.content.loadingExperiments")}
            />
          ) : (
            sorted.length
          )}
        </span>
      </div>
      <div
        ref={listRef}
        className="min-h-0 w-full flex-1 outline-none"
        tabIndex={0}
        role="listbox"
        aria-label={
          showArchived ? t("experiments.grid.archivedExperiments") : t("experiments.title")
        }
        onKeyDown={handleKeyDown}
      >
        <VirtuosoGrid
          style={{ height: "100%", width: "100%" }}
          totalCount={sorted.length}
          listClassName={experimentsGridClass}
          itemClassName="min-w-0 w-full [&>button]:h-full"
          computeItemKey={(index) => sorted[index]?.id ?? String(index)}
          itemContent={(index) => {
            const exp = sorted[index]!;
            return (
              <ExperimentCard
                experiment={exp}
                focused={index === safeFocus}
                onFocus={() => setFocusIndex(index)}
                onSelect={() => openAt(index)}
              />
            );
          }}
        />
      </div>
    </div>
  );
}
