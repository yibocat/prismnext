/**
 * experiments-detail — Detail view for the Experiments mode (Sprint 0.7).
 *
 * Composes the read-only detail surface:
 *   1. Brief strip  — inline hypothesis / RQ / section pills
 *                    (graceful collapse when `briefLinks` is empty)
 *   2. Meta header  — title · tags · created · workspacePath
 *   3. Env card     — `detect_env` snapshot with a [Refresh] action
 *   4. Run panel   — command input + Run / Cancel (Task 6)
 *   5. Runs table   — expandable single output tail + artifacts
 *
 * The contract with `experiments-content.tsx` is preserved: the parent
 * guarantees `detail.meta.id === selectedId` and passes a possibly-null
 * `env`. Refresh just re-selects the current id (the store reloads detail
 * + env), which is the cheapest way to honor the env card's [Refresh] button
 * without adding a new store action.
 */

import { useCallback } from "react";
import {
  CalendarIcon,
  FolderOpenIcon,
  Loader2Icon,
  RefreshCwIcon,
  TagIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import type {
  ExperimentEnv,
  ExperimentMeta,
} from "../../../shared/experiment-log";
import { ExperimentsBriefStrip } from "./experiments-brief-strip";
import { ExperimentsRunPanel } from "./experiments-run-panel";
import { ExperimentsRunsTable } from "./experiments-runs-table";

export interface ExperimentsDetailProps {
  meta: ExperimentMeta;
  env: ExperimentEnv | null;
  /** Optional env reload — defaults to a no-op when parent passes nothing. */
  envReloading?: boolean;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString();
}

function EnvRow({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[length:var(--font-hint)] uppercase tracking-wide text-muted-foreground/60">
        {label}
      </span>
      <span
        className={cn(
          "truncate font-mono text-[length:var(--font-size-12)]",
          value ? "text-foreground/90" : "text-muted-foreground/55",
        )}
        title={value ?? undefined}
      >
        {value || placeholder || "—"}
      </span>
    </div>
  );
}

function EnvCard({
  meta,
  env,
  reloading,
  onRefresh,
}: {
  meta: ExperimentMeta;
  env: ExperimentEnv | null;
  reloading: boolean;
  onRefresh: () => void;
}) {
  return (
    <section
      aria-label="Environment"
      className="rounded-md border border-border/60 bg-card/40"
    >
      <header className="flex items-center justify-between border-b border-border/40 px-3 py-1.5">
        <span className="text-[length:var(--font-hint)] font-medium uppercase tracking-wide text-muted-foreground/70">
          Environment (detect_env)
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-[length:var(--font-size-11)]"
          onClick={onRefresh}
          disabled={reloading}
          title="Re-detect environment"
        >
          {reloading ? (
            <Loader2Icon className="size-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCwIcon className="size-3" aria-hidden />
          )}
          Refresh
        </Button>
      </header>
      {env ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-3">
          <EnvRow
            label="Python"
            value={env.python}
            placeholder={env.pythonVersion ? `python ${env.pythonVersion}` : undefined}
          />
          <EnvRow
            label="Python ver."
            value={env.pythonVersion}
          />
          <EnvRow label="Rscript" value={env.rscript} placeholder="no R" />
          <EnvRow label="R ver." value={env.rVersion} />
          <EnvRow label="Platform" value={env.platform} />
          <EnvRow
            label="Git commit"
            value={env.gitCommit}
            placeholder="not a repo"
          />
          <EnvRow
            label="Venv"
            value={env.venvPath}
            placeholder="no .venv"
          />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-3 py-3 text-[length:var(--font-size-12)] text-muted-foreground/70">
          <span>Environment not detected yet.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[length:var(--font-size-11)]"
            onClick={onRefresh}
            disabled={reloading}
          >
            {reloading ? (
              <Loader2Icon className="size-3 animate-spin" aria-hidden />
            ) : (
              <RefreshCwIcon className="size-3" aria-hidden />
            )}
            Detect
          </Button>
        </div>
      )}
      {/* Suppress unused-var lint when meta is referenced by future enhancements. */}
      <span className="sr-only">{meta.id}</span>
    </section>
  );
}

export function ExperimentsDetail({
  meta,
  env,
  envReloading,
}: ExperimentsDetailProps) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const runs = useExperimentStore((s) => s.detail?.runs);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);

  // Re-selecting the same id triggers `selectExperiment` to reload both
  // detail and env. The store guards against flicker (same id) and we get
  // a fresh env snapshot without adding a dedicated `refreshEnv` action.
  const handleRefreshEnv = useCallback(() => {
    if (!projectRoot || !selectedId) return;
    void selectExperiment(projectRoot, selectedId);
  }, [projectRoot, selectedId, selectExperiment]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4">
      <ExperimentsBriefStrip briefLinks={meta.briefLinks} />

      <header className="space-y-1.5">
        <h2 className="text-[length:var(--font-size-14)] font-medium text-foreground">
          {meta.title}
        </h2>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--font-size-12)] text-muted-foreground/80">
          <span className="inline-flex items-center gap-1" title="Created at">
            <CalendarIcon className="size-3" aria-hidden />
            <span>{formatDate(meta.createdAt)}</span>
          </span>
          <span
            className="inline-flex min-w-0 items-center gap-1"
            title={meta.workspacePath}
          >
            <FolderOpenIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate font-mono">{meta.workspacePath}</span>
          </span>
        </div>

        {meta.tags && meta.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <TagIcon
              className="size-3 text-muted-foreground/60"
              aria-hidden
            />
            {meta.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-[length:var(--font-hint)] font-normal"
              >
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </header>

      <EnvCard
        meta={meta}
        env={env}
        reloading={Boolean(envReloading)}
        onRefresh={handleRefreshEnv}
      />

      <ExperimentsRunPanel />

      <section className="space-y-1.5">
        <h3 className="text-[length:var(--font-hint)] font-medium uppercase tracking-wide text-muted-foreground/70">
          Runs
        </h3>
        <ExperimentsRunsTable runs={runs ?? []} workspacePath={meta.workspacePath} />
      </section>
    </div>
  );
}
