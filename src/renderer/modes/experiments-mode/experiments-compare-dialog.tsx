/**
 * Minimal ablation compare — side-by-side run ledger (+ best-effort metrics).
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resolveProjectRelativePath } from "@/lib/files/project-path";
import {
  parseFlatMetricsJsonText,
  pickMetricsArtifactPaths,
} from "../../../shared/experiments/metrics";
import type { ExperimentRunEntry } from "../../../shared/experiments/log";
import { experimentRunListTitle } from "./experiments-runs-query";
import { formatExperimentRelativeTime } from "./experiments-detail-chrome";
import { artifactFullPath } from "./experiments-artifact-nav";
import { useExperimentProjectRoot } from "./experiments-project-root";

const COMPARE_CAP = 6;

export { COMPARE_CAP as EXPERIMENTS_COMPARE_CAP };

function formatDuration(startedAt: string, finishedAt: string): string {
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function exitLabel(run: ExperimentRunEntry, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (run.cancelled) return t("experiments.runs.cancelledShort");
  if (run.exitCode === 0) return t("experiments.runs.successShort");
  return t("experiments.runs.failedShort");
}

type MetricsState = {
  loading: boolean;
  /** union of keys across runs */
  keys: string[];
  byRun: Record<string, Record<string, number | string> | null>;
  staleHint: boolean;
};

async function loadMetricsForRun(
  projectRoot: string,
  run: ExperimentRunEntry,
  workspacePath?: string,
): Promise<Record<string, number | string> | null> {
  const candidates = pickMetricsArtifactPaths(run.artifacts);
  for (const art of candidates) {
    const rel = artifactFullPath(art, workspacePath);
    const abs = resolveProjectRelativePath(projectRoot, rel);
    if (!abs) continue;
    try {
      const exists = await window.electronAPI.fsExists(abs);
      if (!exists) continue;
      const { content } = await window.electronAPI.fsRead(abs);
      const values = parseFlatMetricsJsonText(content ?? "");
      if (values) return values;
    } catch {
      // try next
    }
  }
  return null;
}

export function ExperimentsCompareDialog({
  open,
  onOpenChange,
  runs,
  workspacePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runs: ExperimentRunEntry[];
  workspacePath?: string;
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const columns = useMemo(() => runs.slice(0, COMPARE_CAP), [runs]);
  const truncated = runs.length > COMPARE_CAP;

  const [metrics, setMetrics] = useState<MetricsState>({
    loading: false,
    keys: [],
    byRun: {},
    staleHint: false,
  });

  useEffect(() => {
    if (!open || !projectRoot || columns.length === 0) {
      setMetrics({ loading: false, keys: [], byRun: {}, staleHint: false });
      return;
    }
    let cancelled = false;
    setMetrics((s) => ({ ...s, loading: true }));
    void (async () => {
      const byRun: Record<string, Record<string, number | string> | null> = {};
      const keySet = new Set<string>();
      let anyMetricsPath = false;
      for (const run of columns) {
        if (pickMetricsArtifactPaths(run.artifacts).length > 0) anyMetricsPath = true;
        const values = await loadMetricsForRun(projectRoot, run, workspacePath);
        byRun[run.runId] = values;
        if (values) {
          for (const k of Object.keys(values)) keySet.add(k);
        }
      }
      if (cancelled) return;
      setMetrics({
        loading: false,
        keys: [...keySet].sort(),
        byRun,
        staleHint: anyMetricsPath,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectRoot, columns, workspacePath]);

  const n = Math.max(columns.length, 1);
  const rowClass = "border-b border-border/40";
  const labelClass = cn(
    "sticky left-0 z-[1] w-[7.5rem] min-w-[7.5rem] max-w-[7.5rem] bg-background",
    "px-3 py-2.5 text-left text-[length:var(--font-size-11)] font-medium text-muted-foreground align-top",
  );
  const cellClass = cn(
    "px-3 py-2.5 text-[length:var(--font-size-13)] text-foreground/90 align-top break-words",
    n <= 2 ? "min-w-[16rem]" : n <= 4 ? "min-w-[12rem]" : "min-w-[10rem]",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-3 overflow-hidden p-5",
          /* Override default sm:max-w-lg — compare needs a wide surface */
          "h-[min(88vh,52rem)] w-[min(96vw,72rem)] max-w-[calc(100%-2rem)] sm:max-w-[min(96vw,72rem)]",
        )}
      >
        <DialogHeader className="shrink-0 space-y-1.5 pr-8">
          <DialogTitle>{t("experiments.compare.title")}</DialogTitle>
          <p className="text-[length:var(--font-size-12)] font-normal text-muted-foreground">
            {t("experiments.compare.desc", { count: columns.length })}
            {truncated ? ` ${t("experiments.compare.truncated", { max: COMPARE_CAP })}` : ""}
          </p>
          {metrics.staleHint ? (
            <p className="text-[length:var(--font-size-11)] font-normal text-muted-foreground/80">
              {t("experiments.compare.metricsHint")}
            </p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          <table className="w-full min-w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[7.5rem]" />
              {columns.map((run) => (
                <col key={run.runId} />
              ))}
            </colgroup>
            <thead>
              <tr className={cn(rowClass, "bg-muted")}>
                <th className={cn(labelClass, "bg-muted")}>{t("experiments.compare.field")}</th>
                {columns.map((run) => (
                  <th key={run.runId} className={cn(cellClass, "font-medium")}>
                    <div className="line-clamp-2 text-left">{experimentRunListTitle(run)}</div>
                    <div className="mt-1 font-mono text-[length:var(--font-size-11)] font-normal text-muted-foreground">
                      {run.runId}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className={rowClass}>
                <th className={labelClass}>{t("experiments.command")}</th>
                {columns.map((run) => (
                  <td
                    key={run.runId}
                    className={cn(cellClass, "font-mono text-[length:var(--font-code)] leading-relaxed")}
                  >
                    {run.command || "—"}
                  </td>
                ))}
              </tr>
              <tr className={rowClass}>
                <th className={labelClass}>{t("experiments.type")}</th>
                {columns.map((run) => (
                  <td key={run.runId} className={cellClass}>
                    {run.kind?.trim() || t("experiments.untyped")}
                  </td>
                ))}
              </tr>
              <tr className={rowClass}>
                <th className={labelClass}>{t("experiments.exit")}</th>
                {columns.map((run) => (
                  <td key={run.runId} className={cellClass}>
                    {exitLabel(run, t)}
                    {run.exitCode != null ? (
                      <span className="ml-1 tabular-nums text-muted-foreground">({run.exitCode})</span>
                    ) : null}
                  </td>
                ))}
              </tr>
              <tr className={rowClass}>
                <th className={labelClass}>{t("experiments.runs.listDuration")}</th>
                {columns.map((run) => (
                  <td key={run.runId} className={cn(cellClass, "tabular-nums")}>
                    {formatDuration(run.startedAt, run.finishedAt)}
                  </td>
                ))}
              </tr>
              <tr className={rowClass}>
                <th className={labelClass}>{t("experiments.time")}</th>
                {columns.map((run) => (
                  <td key={run.runId} className={cellClass}>
                    {run.finishedAt
                      ? formatExperimentRelativeTime(run.finishedAt)
                      : "—"}
                  </td>
                ))}
              </tr>
              <tr className={rowClass}>
                <th className={labelClass}>{t("experiments.compare.git")}</th>
                {columns.map((run) => (
                  <td key={run.runId} className={cn(cellClass, "font-mono")}>
                    {run.env?.gitCommit?.slice(0, 7) || "—"}
                  </td>
                ))}
              </tr>
              <tr className={rowClass}>
                <th className={labelClass}>{t("experiments.note")}</th>
                {columns.map((run) => (
                  <td key={run.runId} className={cn(cellClass, "leading-relaxed whitespace-pre-wrap")}>
                    {run.notes?.trim()
                      ? run.notes.trim().length > 400
                        ? `${run.notes.trim().slice(0, 400)}…`
                        : run.notes.trim()
                      : "—"}
                  </td>
                ))}
              </tr>
              {metrics.loading ? (
                <tr className={rowClass}>
                  <th className={labelClass}>{t("experiments.compare.metrics")}</th>
                  {columns.map((run) => (
                    <td key={run.runId} className={cellClass}>
                      {t("common.loading")}
                    </td>
                  ))}
                </tr>
              ) : metrics.keys.length > 0 ? (
                metrics.keys.map((key) => (
                  <tr key={key} className={rowClass}>
                    <th className={labelClass}>
                      {t("experiments.compare.metricKey", { key })}
                    </th>
                    {columns.map((run) => {
                      const v = metrics.byRun[run.runId]?.[key];
                      return (
                        <td key={run.runId} className={cn(cellClass, "tabular-nums")}>
                          {v == null ? "—" : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr className={rowClass}>
                  <th className={labelClass}>{t("experiments.compare.metrics")}</th>
                  {columns.map((run) => (
                    <td key={run.runId} className={cellClass}>
                      —
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function pickRunsForCompare(
  all: ExperimentRunEntry[] | undefined,
  checkedIds: string[],
): ExperimentRunEntry[] {
  if (!all || checkedIds.length === 0) return [];
  const order = new Map(checkedIds.map((id, i) => [id, i]));
  return all
    .filter((r) => order.has(r.runId))
    .sort((a, b) => (order.get(a.runId) ?? 0) - (order.get(b.runId) ?? 0));
}
