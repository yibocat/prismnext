/**
 * experiments-sidebar — Experiment list sidebar (Sprint 0.7).
 *
 * Mirrors the literature-mode sidebar's dispatch pattern: the sidebar is
 * always present (the mode has no detail keep-alive shell, see plan §D1),
 * and clicking a row selects the experiment in the experiment store. The
 * detail panel then renders inside the Content component.
 *
 * P0 scope: simple list, no search, no sort, no context menu, no new
 * experiment button (per D6). Sorting + search land in P1.
 */

import { useMemo } from "react";
import { FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import {
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const ROW_BASE =
  "flex h-6 items-center gap-2 rounded-sm px-2 text-[length:var(--font-size-12)] text-muted-foreground";
const ROW_SELECTED = "bg-sidebar-accent text-sidebar-accent-foreground";

function ExperimentRow({
  title,
  runCount,
  selected,
  onSelect,
}: {
  title: string;
  runCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(ROW_BASE, "cursor-pointer", selected && ROW_SELECTED)}
      onClick={onSelect}
      title={title}
    >
      <FlaskConicalIcon className="size-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 tabular-nums text-[length:var(--font-hint)] text-muted-foreground/60">
        {runCount}
      </span>
    </div>
  );
}

export function ExperimentsSidebar() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const experiments = useExperimentStore((s) => s.experiments);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const loading = useExperimentStore((s) => s.loading);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);

  // Sort: most recently run first, then by id (stable secondary key).
  const sorted = useMemo(() => {
    return [...experiments].sort((a, b) => {
      const aT = a.lastRunAt ? Date.parse(a.lastRunAt) : 0;
      const bT = b.lastRunAt ? Date.parse(b.lastRunAt) : 0;
      if (aT !== bT) return bT - aT;
      return a.id.localeCompare(b.id);
    });
  }, [experiments]);

  return (
    <>
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between px-3">
        <span className="truncate text-[length:var(--font-size-12)] font-medium text-muted-foreground">
          Experiments
        </span>
        {loading ? (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground/60" />
        ) : (
          <span className="shrink-0 tabular-nums text-[length:var(--font-hint)] text-muted-foreground/60">
            {experiments.length}
          </span>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-auto px-1.5 py-1">
        {sorted.length === 0 ? (
          <p className="px-2 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
            {projectRoot
              ? "No experiments in this project yet."
              : "Open a project to view experiments."}
          </p>
        ) : (
          sorted.map((exp) => (
            <ExperimentRow
              key={exp.id}
              title={exp.title}
              runCount={exp.runCount}
              selected={selectedId === exp.id}
              onSelect={() => {
                if (!projectRoot) return;
                void selectExperiment(projectRoot, exp.id);
              }}
            />
          ))
        )}
      </SidebarContent>
    </>
  );
}
