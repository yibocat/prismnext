/**
 * experiments-detail — Detail view for the Experiments mode.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, CopyIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { literatureDetailBadgeClass } from "@/modes/literature-mode/literature-list-chrome";
import {
  experimentEnvDisplayRows,
  type ExperimentEnv,
  type ExperimentMeta,
  type ExperimentRunEntry,
} from "../../../shared/experiment-log";
import { ExperimentsBriefStrip } from "./experiments-brief-strip";
import {
  experimentsDetailTitleClass,
  experimentsMetadataLabelClass,
  experimentsMetadataRowClass,
  experimentsPathCompactClass,
  experimentsSectionHeaderRowClass,
  experimentsSectionLabelClass,
  experimentsSubsectionLabelClass,
  experimentsUiValueClass,
  formatExperimentRelativeTime,
} from "./experiments-detail-chrome";
import { ExperimentsRunPanel } from "./experiments-run-panel";
import { ExperimentsRunsTable } from "./experiments-runs-table";

const COPY_FEEDBACK_MS = 1500;

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString();
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  return formatExperimentRelativeTime(iso);
}

function ExperimentsMetadataRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={experimentsMetadataRowClass}>
      <span className={experimentsMetadataLabelClass}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CopyableText({
  text,
  copyText,
  className,
}: {
  text: string;
  copyText?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const payload = copyText ?? text;

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = () => {
    void navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    });
  };

  const valueClass = experimentsUiValueClass;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "group inline-flex max-w-full items-baseline gap-1.5 text-left transition-colors",
        valueClass,
        "rounded-[3px] hover:text-foreground",
        className,
      )}
      title={copied ? "Copied" : `Click to copy: ${payload}`}
    >
      <span className="min-w-0 break-all">{text}</span>
      {copied ? (
        <CheckIcon className="size-3 shrink-0 self-center text-success" aria-label="Copied" />
      ) : (
        <CopyIcon
          className="size-3 shrink-0 self-center text-muted-foreground/45 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      )}
    </button>
  );
}

function StaticValue({
  value,
  placeholder = "—",
}: {
  value: string | null | undefined;
  placeholder?: string;
}) {
  const shown = value?.trim();
  return (
    <span
      className={cn(
        shown
          ? "text-[length:var(--font-size-13)] text-foreground/90"
          : "text-[length:var(--font-size-13)] text-muted-foreground/60",
      )}
    >
      {shown || placeholder}
    </span>
  );
}

function OverviewSection({
  meta,
  runCount,
  lastRunAt,
  lastExitCode,
}: {
  meta: ExperimentMeta;
  runCount: number;
  lastRunAt: string | null;
  lastExitCode: number | null;
}) {
  return (
    <section className="min-w-0 space-y-2">
      <div className={experimentsSectionHeaderRowClass}>
        <h3 className={experimentsSectionLabelClass}>Overview</h3>
      </div>
      <div className="space-y-0">
        <ExperimentsMetadataRow label="ID">
          <CopyableText text={meta.id} />
        </ExperimentsMetadataRow>
        <ExperimentsMetadataRow label="Created">
          <StaticValue
            value={`${formatDateTime(meta.createdAt)} (${formatRelative(meta.createdAt)})`}
          />
        </ExperimentsMetadataRow>
        <ExperimentsMetadataRow label="Runs">
          <span className="text-[length:var(--font-size-13)] text-foreground/90 tabular-nums">
            {runCount}
            {lastRunAt ? (
              <span className="ml-1.5 text-[length:var(--font-size-12)] text-muted-foreground/80">
                · last {formatRelative(lastRunAt)}
                {lastExitCode === 0 || lastExitCode == null ? "" : ` · exit ${lastExitCode}`}
              </span>
            ) : null}
          </span>
        </ExperimentsMetadataRow>
        <ExperimentsMetadataRow label="Lab path">
          <CopyableText text={meta.workspacePath} />
        </ExperimentsMetadataRow>
        {meta.tags && meta.tags.length > 0 ? (
          <ExperimentsMetadataRow label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {meta.tags.map((tag) => (
                <span key={tag} className={literatureDetailBadgeClass}>
                  {tag}
                </span>
              ))}
            </div>
          </ExperimentsMetadataRow>
        ) : null}
      </div>
    </section>
  );
}

function EnvironmentSection({
  env,
  reloading,
  onRefresh,
}: {
  env: ExperimentEnv | null;
  reloading: boolean;
  onRefresh: () => void;
}) {
  const rows = experimentEnvDisplayRows(env);

  return (
    <section className="min-w-0 space-y-2">
      <div className={experimentsSectionHeaderRowClass}>
        <h3 className={experimentsSectionLabelClass}>Environment</h3>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="h-6 gap-1 px-2 text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={reloading}
          title="Re-detect runtime environment"
        >
          {reloading ? (
            <Loader2Icon className="size-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCwIcon className="size-3" aria-hidden />
          )}
          Refresh
        </Button>
      </div>

      {!env ? (
        <p className={SETTINGS_ROW_DESC}>
          Not detected yet. Refresh probes Python, optional R, git, and venv in the lab
          folder (language-agnostic experiments may show only Platform).
        </p>
      ) : null}

      <div className="space-y-0">
        {rows.map((row) => (
          <ExperimentsMetadataRow key={row.label} label={row.label}>
            {row.copyText ? (
              <CopyableText
                text={row.display?.trim() || row.placeholder}
                copyText={row.copyText}
              />
            ) : (
              <StaticValue value={row.display} placeholder={row.placeholder} />
            )}
          </ExperimentsMetadataRow>
        ))}
      </div>
    </section>
  );
}

function HistorySection({
  runCount,
  runs,
  workspacePath,
}: {
  runCount: number;
  runs: ExperimentRunEntry[];
  workspacePath: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-left"
        aria-expanded={open}
      >
        <ChevronDownIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground/60 transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
          aria-hidden
        />
        <span className={experimentsSubsectionLabelClass}>
          History
          <span className="ml-1.5 tabular-nums text-muted-foreground/65">({runCount})</span>
        </span>
      </button>
      {open ? (
        <ExperimentsRunsTable runs={runs} workspacePath={workspacePath} />
      ) : null}
    </div>
  );
}

export function ExperimentsDetail({
  meta,
  env,
  envReloading,
}: {
  meta: ExperimentMeta;
  env: ExperimentEnv | null;
  envReloading?: boolean;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const selectedId = useExperimentStore((s) => s.selectedId);
  const runs = useExperimentStore((s) => s.detail?.runs ?? []);
  const selectExperiment = useExperimentStore((s) => s.selectExperiment);

  const handleRefreshEnv = useCallback(() => {
    if (!projectRoot || !selectedId) return;
    void selectExperiment(projectRoot, selectedId);
  }, [projectRoot, selectedId, selectExperiment]);

  const runCount = runs.length;
  const lastRun = runCount > 0 ? runs[runCount - 1] : null;

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-auto px-6 py-5 @md:px-8 @md:py-6">
      <div className="space-y-6">
        <header className="space-y-3">
          <h2 className={experimentsDetailTitleClass}>{meta.title}</h2>
          <ExperimentsBriefStrip briefLinks={meta.briefLinks} />
        </header>

        <div className="grid grid-cols-1 items-start gap-6 border-t border-border/40 pt-4 @md:grid-cols-2 @md:gap-8">
          <OverviewSection
            meta={meta}
            runCount={runCount}
            lastRunAt={lastRun?.finishedAt ?? null}
            lastExitCode={lastRun?.exitCode ?? null}
          />
          <EnvironmentSection
            env={env}
            reloading={Boolean(envReloading)}
            onRefresh={handleRefreshEnv}
          />
        </div>

        <section className="space-y-4 border-t border-border/40 pt-4">
          <div className={cn(experimentsSectionHeaderRowClass, "items-baseline")}>
            <h3 className={experimentsSectionLabelClass}>Execution</h3>
            {meta.workspacePath ? (
              <div className="flex min-w-0 max-w-[55%] items-baseline justify-end gap-1.5">
                <span className="shrink-0 text-[length:var(--font-path)] text-muted-foreground/60">
                  cwd
                </span>
                <CopyableText
                  text={meta.workspacePath}
                  className={cn(
                    experimentsPathCompactClass,
                    "min-w-0 text-muted-foreground/75",
                  )}
                />
              </div>
            ) : null}
          </div>

          <ExperimentsRunPanel />

          <div className="space-y-2">
            <HistorySection runCount={runCount} workspacePath={meta.workspacePath} runs={runs} />
          </div>
        </section>
      </div>
    </div>
  );
}
