/**
 * experiments-grid — Card browse view for the Experiments mode (Sprint 0.7).
 *
 * Shown when no experiment is selected. Sidebar stays collapsed so cards
 * use the full Content width; detail view opens the sidebar for quick switch.
 */

import { useMemo } from "react";
import { FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { cn } from "@/lib/utils";
import type { ExperimentSummary } from "../../../shared/experiment-log";
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
}: {
  experiment: ExperimentSummary;
  onSelect: () => void;
}) {
  const labName = experimentLabBasename(experiment.workspacePath);
  const runLabel =
    experiment.runCount === 1 ? "1 run" : `${experiment.runCount} runs`;

  return (
    <button
      type="button"
      className={experimentsCardShellClass}
      onClick={onSelect}
      title={experiment.title}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <FlaskConicalIcon
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/55"
            aria-hidden
          />
          <span className={experimentsCardTitleClass}>{experiment.title}</span>
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
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const experiments = useExperimentStore((s) => s.experiments);
  const loading = useExperimentStore((s) => s.loading);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);

  const sorted = useMemo(() => {
    return [...experiments].sort((a, b) => {
      const aT = a.lastRunAt ? Date.parse(a.lastRunAt) : 0;
      const bT = b.lastRunAt ? Date.parse(b.lastRunAt) : 0;
      if (aT !== bT) return bT - aT;
      return a.id.localeCompare(b.id);
    });
  }, [experiments]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto px-6 py-5 @md:px-8 @md:py-6">
      <div className="mb-4 flex h-6 items-center justify-between gap-2">
        <h2 className={experimentsSectionLabelClass}>Experiments</h2>
        <span className="tabular-nums text-[length:var(--font-size-11)] text-muted-foreground/50">
          {loading ? (
            <Loader2Icon className="size-3 animate-spin" aria-label="Loading" />
          ) : (
            sorted.length
          )}
        </span>
      </div>
      <div className={experimentsGridClass}>
        {sorted.map((exp) => (
          <ExperimentCard
            key={exp.id}
            experiment={exp}
            onSelect={() => {
              if (!projectRoot) return;
              void selectExperiment(projectRoot, exp.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}
