/**
 * experiments-results-panel — Station 3 Results view.
 *
 * Two pages behind a segmented switch (kept semantically separate):
 *  - Declared: run list with expandable owned artifacts (bookkeeping)
 *  - Discovered: workspace scan via experiment:snapshot (figures / tables / metrics)
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BanIcon,
  CircleCheckIcon,
  CircleXIcon,
  FileIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { ChatProjectImage } from "@/lib/markdown/extract-markdown-images";
import { cn } from "@/lib/utils";
import { useExperimentStore } from "@/stores/experiment-store";
import {
  type ExperimentRunEntry,
} from "../../../shared/experiment-log";
import {
  isImageArtifactPath,
  isPdfArtifactPath,
} from "../../../shared/artifact-path";
import {
  artifactFullPath,
  openArtifactPathInFiles,
  resolveRunImagePathsForDisplay,
} from "./experiments-artifact-nav";
import { useExperimentProjectRoot } from "./experiments-project-root";
import {
  experimentsRunDetailPanelClass,
  experimentsRunRowTextClass,
  experimentsRunsListHeaderLabelClass,
  experimentsRunsListHeaderShellClass,
  experimentsUiValueClass,
  formatExperimentRelativeTime,
} from "./experiments-detail-chrome";
import { experimentRunListTitle } from "./experiments-runs-query";

/** icon · title · status · time · count — aligned with Execution list density */
const RESULTS_RUN_GRID =
  "grid grid-cols-[0.75rem_minmax(0,1fr)_3rem_4rem_2.25rem] gap-x-2";

const DECLARED_COLLECT_CAP = 80;
const FIGURE_PREVIEW_CAP = 12;
const BUCKET_LIST_CAP = 20;
const RUN_GROUPS_CAP = 30;

const TABLE_ARTIFACT_EXT = /\.(csv|tsv|xlsx|xls)$/i;

export type DeclaredArtifactBuckets = {
  figures: string[];
  tables: string[];
  metrics: string[];
  other: string[];
  total: number;
};

export type DeclaredRunArtifactGroup = {
  runId: string;
  run: ExperimentRunEntry;
  buckets: DeclaredArtifactBuckets;
  /** Declared working paths omitted because a newer run already claimed them. */
  supersededCount: number;
};

function emptyBuckets(): DeclaredArtifactBuckets {
  return { figures: [], tables: [], metrics: [], other: [], total: 0 };
}

function normalizeArtifactPaths(rawList: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawList ?? []) {
    const p = (raw || "").trim().replace(/\\/g, "/");
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** Newest-first unique declared artifact paths from run records (flat). */
export function collectDeclaredArtifacts(runs: ExperimentRunEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!;
    for (const p of normalizeArtifactPaths(run.artifacts)) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
      if (out.length >= DECLARED_COLLECT_CAP) return out;
    }
  }
  return out;
}

/** Classify a declared path into figures / tables / metrics / other. */
export function classifyDeclaredPath(
  path: string,
): keyof Omit<DeclaredArtifactBuckets, "total"> {
  const p = path.replace(/\\/g, "/");
  if (isImageArtifactPath(p) || isPdfArtifactPath(p)) return "figures";
  if (TABLE_ARTIFACT_EXT.test(p)) return "tables";
  const base = p.split("/").pop()?.toLowerCase() ?? "";
  if (base.endsWith(".json") && base.includes("metric")) return "metrics";
  return "other";
}

export function classifyPathsIntoBuckets(paths: string[]): DeclaredArtifactBuckets {
  const buckets = emptyBuckets();
  for (const p of paths) {
    const bucket = classifyDeclaredPath(p);
    buckets[bucket].push(p);
  }
  buckets.total =
    buckets.figures.length +
    buckets.tables.length +
    buckets.metrics.length +
    buckets.other.length;
  return buckets;
}

/** Flat unique paths across runs, grouped by type (newest-first within buckets). */
export function classifyDeclaredArtifacts(
  runs: ExperimentRunEntry[],
): DeclaredArtifactBuckets {
  return classifyPathsIntoBuckets(collectDeclaredArtifacts(runs));
}

/**
 * Declared artifacts per run (newest first).
 *
 * - Images: prefer frozen `artifactSnapshots` per run; otherwise working paths
 *   with newest-wins across runs.
 * - Non-images: newest-wins on the working path (shared json/csv/… only under
 *   the latest declaring run).
 * - Runs whose paths were all superseded still appear with `supersededCount`.
 */
export function groupDeclaredArtifactsByRun(
  runs: ExperimentRunEntry[],
  workspacePath?: string,
): DeclaredRunArtifactGroup[] {
  const claimedWorking = new Set<string>();
  const out: DeclaredRunArtifactGroup[] = [];

  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!;
    const declared = normalizeArtifactPaths(run.artifacts);
    if (declared.length === 0) continue;

    const hasSnapshots = (run.artifactSnapshots?.length ?? 0) > 0;
    let supersededCount = 0;
    const keptWorkingImages: string[] = [];
    const keptNonImages: string[] = [];

    for (const p of declared) {
      if (isImageArtifactPath(p)) {
        if (hasSnapshots) {
          // This run shows frozen copies; still claim the working path so older
          // runs without snapshots do not re-list the same mutable file.
          claimedWorking.add(p);
          continue;
        }
        if (claimedWorking.has(p)) {
          supersededCount += 1;
          continue;
        }
        claimedWorking.add(p);
        keptWorkingImages.push(p);
        continue;
      }

      if (claimedWorking.has(p)) {
        supersededCount += 1;
        continue;
      }
      claimedWorking.add(p);
      keptNonImages.push(p);
    }

    const figures = hasSnapshots
      ? resolveRunImagePathsForDisplay(run, workspacePath)
      : keptWorkingImages;
    const buckets = classifyPathsIntoBuckets([...figures, ...keptNonImages]);

    if (buckets.total === 0 && supersededCount === 0) continue;

    out.push({ runId: run.runId, run, buckets, supersededCount });
    if (out.length >= RUN_GROUPS_CAP) break;
  }
  return out;
}

function ResultPathChip({
  path,
  workspacePath,
}: {
  path: string;
  workspacePath?: string;
}) {
  const fullPath = artifactFullPath(path, workspacePath);
  const name = path.split("/").pop() ?? path;
  return (
    <Hint label={fullPath}>
      <button
        type="button"
        onClick={() => void openArtifactPathInFiles(path, workspacePath)}
        className="inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 text-[length:var(--font-menu-item)] text-foreground/90 transition-colors hover:bg-accent hover:text-foreground"
      >
        <FileIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{name}</span>
      </button>
    </Hint>
  );
}

function ResultPathRow({
  path,
  workspacePath,
}: {
  path: string;
  workspacePath?: string;
}) {
  const fullPath = artifactFullPath(path, workspacePath);
  return (
    <Hint label={fullPath}>
      <button
        type="button"
        onClick={() => void openArtifactPathInFiles(path, workspacePath)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-left text-[length:var(--font-menu-item)] text-foreground/90 transition-colors hover:bg-accent hover:text-foreground"
      >
        <FileIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-[length:var(--font-size-11)]">
          {path}
        </span>
      </button>
    </Hint>
  );
}

function DeclaredBucketSection({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[length:var(--font-path)] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function PathList({
  paths,
  workspacePath,
  cap = BUCKET_LIST_CAP,
}: {
  paths: string[];
  workspacePath?: string;
  cap?: number;
}) {
  const shown = paths.slice(0, cap);
  return (
    <ul className="space-y-1">
      {shown.map((p) => (
        <li key={p}>
          <ResultPathRow path={p} workspacePath={workspacePath} />
        </li>
      ))}
    </ul>
  );
}

/** Thumbnail lightbox via ChatProjectImage; filename opens Files. */
function FigurePreviewGrid({
  paths,
  workspacePath,
}: {
  paths: string[];
  workspacePath?: string;
}) {
  const previews = paths
    .filter((p) => isImageArtifactPath(p))
    .slice(0, FIGURE_PREVIEW_CAP);
  if (previews.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 @md:grid-cols-3">
      {previews.map((p) => {
        const src = artifactFullPath(p, workspacePath);
        const name = p.split("/").pop() || "figure";
        const fullPath = artifactFullPath(p, workspacePath);
        return (
          <div
            key={p}
            className="overflow-hidden rounded-md border border-border bg-muted"
          >
            <div className="[&_button]:my-0 [&_button]:max-w-none [&_button]:rounded-none [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0">
              <ChatProjectImage src={src} alt={name} />
            </div>
            <Hint label={fullPath}>
              <button
                type="button"
                className="block w-full truncate px-2 py-1 text-left text-[length:var(--font-size-11)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => void openArtifactPathInFiles(p, workspacePath)}
                title={p}
              >
                {name}
              </button>
            </Hint>
          </div>
        );
      })}
    </div>
  );
}

function DeclaredBucketsBody({
  buckets,
  workspacePath,
}: {
  buckets: DeclaredArtifactBuckets;
  workspacePath?: string;
}) {
  const { t } = useTranslation();
  const figureListOnly = buckets.figures.filter((p) => !isImageArtifactPath(p));
  return (
    <div className="space-y-3">
      <DeclaredBucketSection
        label={t("experiments.results.figures", { count: buckets.figures.length })}
        count={buckets.figures.length}
      >
        <FigurePreviewGrid paths={buckets.figures} workspacePath={workspacePath} />
        {figureListOnly.length > 0 ? (
          <PathList paths={figureListOnly} workspacePath={workspacePath} />
        ) : null}
      </DeclaredBucketSection>
      <DeclaredBucketSection
        label={t("experiments.results.tables", { count: buckets.tables.length })}
        count={buckets.tables.length}
      >
        <PathList paths={buckets.tables} workspacePath={workspacePath} />
      </DeclaredBucketSection>
      <DeclaredBucketSection
        label={t("experiments.results.metrics", { count: buckets.metrics.length })}
        count={buckets.metrics.length}
      >
        <PathList paths={buckets.metrics} workspacePath={workspacePath} />
      </DeclaredBucketSection>
      <DeclaredBucketSection
        label={t("experiments.results.other", { count: buckets.other.length })}
        count={buckets.other.length}
      >
        <PathList paths={buckets.other} workspacePath={workspacePath} />
      </DeclaredBucketSection>
    </div>
  );
}

function runStatusShort(
  run: ExperimentRunEntry,
  t: (key: string) => string,
): string {
  if (run.cancelled) return t("experiments.runs.cancelledShort");
  if (run.exitCode === 0) return t("experiments.runs.successShort");
  return t("experiments.runs.failedShort");
}

function ResultsDeclaredRunRow({
  group,
  workspacePath,
  expanded,
  onToggle,
}: {
  group: DeclaredRunArtifactGroup;
  workspacePath: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const run = group.run;
  const cancelled = Boolean(run.cancelled);
  const ExitIcon = cancelled
    ? BanIcon
    : run.exitCode === 0
      ? CircleCheckIcon
      : CircleXIcon;
  const exitClass = cancelled
    ? "text-muted-foreground"
    : run.exitCode === 0
      ? "text-success"
      : "text-destructive";
  const title = experimentRunListTitle(run);
  const statusLabel = runStatusShort(run, t);
  const when = formatExperimentRelativeTime(run.finishedAt || run.startedAt);
  const countLabel =
    group.buckets.total > 0
      ? String(group.buckets.total)
      : group.supersededCount > 0
        ? "—"
        : "0";

  return (
    <div id={`results-run-${group.runId}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          RESULTS_RUN_GRID,
          "w-full items-center px-3",
          "h-[var(--height-right-area-subtoolbar)] shrink-0 min-w-0 border-b border-border/60 text-left box-border",
          experimentsRunRowTextClass,
          "cursor-pointer hover:bg-muted",
          expanded && "bg-muted",
        )}
      >
        <ExitIcon className={cn("size-3 shrink-0", exitClass)} aria-hidden />
        <span className="min-w-0 truncate text-foreground" title={run.command || title}>
          {title}
        </span>
        <span className={cn("truncate text-muted-foreground", exitClass)} title={statusLabel}>
          {statusLabel}
        </span>
        <span className="truncate text-muted-foreground" title={when}>
          {when}
        </span>
        <span className="truncate text-right tabular-nums text-muted-foreground">
          {countLabel}
        </span>
      </div>
      {expanded ? (
        <div className={experimentsRunDetailPanelClass}>
          {group.supersededCount > 0 ? (
            <p className={cn(SETTINGS_ROW_DESC, "text-muted-foreground/80")}>
              {t("experiments.results.supersededPaths", {
                count: group.supersededCount,
              })}
            </p>
          ) : null}
          {group.buckets.total > 0 ? (
            <DeclaredBucketsBody
              buckets={group.buckets}
              workspacePath={workspacePath}
            />
          ) : group.supersededCount === 0 ? (
            <p className={experimentsUiValueClass}>
              {t("experiments.results.declaredEmpty")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ExperimentsResultsPanel({
  workspacePath,
  runs,
  focusRunId = null,
  onFocusConsumed,
}: {
  workspacePath: string;
  runs: ExperimentRunEntry[];
  /** When set (e.g. from Execution → Results), expand and scroll to that run. */
  focusRunId?: string | null;
  onFocusConsumed?: () => void;
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const selectedId = useExperimentStore((s) => s.selectedId);
  const snapshot = useExperimentStore((s) => s.resultsSnapshot);
  const loading = useExperimentStore((s) => s.resultsSnapshotLoading);
  const loadResultsSnapshot = useExperimentStore((s) => s.loadResultsSnapshot);

  const declaredGroups = useMemo(
    () => groupDeclaredArtifactsByRun(runs, workspacePath),
    [runs, workspacePath],
  );
  const declaredTotal = useMemo(
    () => declaredGroups.reduce((n, g) => n + g.buckets.total, 0),
    [declaredGroups],
  );

  const [resultsView, setResultsView] = useState<"declared" | "discovered">(
    "declared",
  );
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusRunId) return;
    setResultsView("declared");
    const hit = declaredGroups.some((g) => g.runId === focusRunId);
    if (hit) {
      setExpandedRunId(focusRunId);
      requestAnimationFrame(() => {
        document
          .getElementById(`results-run-${focusRunId}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
    onFocusConsumed?.();
  }, [focusRunId, declaredGroups, onFocusConsumed]);

  useEffect(() => {
    if (!expandedRunId) return;
    if (!declaredGroups.some((g) => g.runId === expandedRunId)) {
      setExpandedRunId(null);
    }
  }, [declaredGroups, expandedRunId]);

  const handleRefresh = useCallback(() => {
    if (!projectRoot || !selectedId) return;
    void loadResultsSnapshot(projectRoot, selectedId);
  }, [loadResultsSnapshot, projectRoot, selectedId]);

  const figures = snapshot?.figures ?? [];
  const tables = snapshot?.tables ?? [];
  const metrics = snapshot?.metrics ?? [];
  const imageFigures = figures
    .filter((f) => isImageArtifactPath(f.path))
    .slice(0, FIGURE_PREVIEW_CAP);
  const listOnlyFigures = figures.filter((f) => !isImageArtifactPath(f.path));
  const discoveredCount = figures.length + tables.length + metrics.length;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-[var(--height-right-area-subtoolbar)] shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <div
          role="radiogroup"
          aria-label={t("experiments.results.viewSwitchAria")}
          className="flex h-7 items-center gap-0.5 rounded-md border border-border bg-muted p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={resultsView === "declared"}
            onClick={() => setResultsView("declared")}
            className={cn(
              "h-6 rounded-sm px-2 text-[length:var(--font-size-11)] font-medium transition-colors",
              resultsView === "declared"
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("experiments.results.viewDeclared")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={resultsView === "discovered"}
            onClick={() => setResultsView("discovered")}
            className={cn(
              "h-6 rounded-sm px-2 text-[length:var(--font-size-11)] font-medium transition-colors",
              resultsView === "discovered"
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("experiments.results.viewDiscovered")}
          </button>
        </div>
        <p className="min-w-0 flex-1 truncate text-[length:var(--font-size-11)] text-muted-foreground">
          {resultsView === "declared"
            ? t("experiments.results.declaredHint")
            : t("experiments.results.discoveredHint")}
        </p>
        {resultsView === "discovered" ? (
          <Hint label={t("experiments.results.refresh")}>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="size-6 shrink-0 px-0"
              disabled={loading || !projectRoot || !selectedId}
              onClick={handleRefresh}
            >
              <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
            </Button>
          </Hint>
        ) : null}
      </div>

      {resultsView === "declared" ? (
        <section>
          <div
            className={cn(
              experimentsRunsListHeaderShellClass,
              RESULTS_RUN_GRID,
              "items-center",
            )}
          >
            <span aria-hidden />
            <span className={experimentsRunsListHeaderLabelClass}>
              {t("experiments.runs.listRun")}
              <span className="ml-1.5 tabular-nums text-muted-foreground/65">
                ({declaredGroups.length} · {declaredTotal})
              </span>
            </span>
            <span className={experimentsRunsListHeaderLabelClass}>
              {t("experiments.runs.listStatus")}
            </span>
            <span className={experimentsRunsListHeaderLabelClass}>
              {t("experiments.time")}
            </span>
            <span className={cn(experimentsRunsListHeaderLabelClass, "text-right")}>
              {t("experiments.artifacts")}
            </span>
          </div>

          {declaredGroups.length === 0 ? (
            <p className={cn(experimentsUiValueClass, "px-3 py-6")}>
              {t("experiments.results.declaredEmpty")}
            </p>
          ) : (
            declaredGroups.map((group) => (
              <ResultsDeclaredRunRow
                key={group.runId}
                group={group}
                workspacePath={workspacePath}
                expanded={expandedRunId === group.runId}
                onToggle={() =>
                  setExpandedRunId((prev) =>
                    prev === group.runId ? null : group.runId,
                  )
                }
              />
            ))
          )}
        </section>
      ) : (
        <section className="space-y-3 px-3 py-4">
          <p className={cn(SETTINGS_ROW_DESC, "text-muted-foreground/80")}>
            {t("experiments.results.discoveredSummary", {
              figures: figures.length,
              tables: tables.length,
              metrics: metrics.length,
              count: discoveredCount,
            })}
          </p>

          {loading && !snapshot ? (
            <p className={experimentsUiValueClass}>{t("experiments.results.scanning")}</p>
          ) : null}

          {!loading && snapshot && discoveredCount === 0 ? (
            <p className={experimentsUiValueClass}>{t("experiments.results.discoveredEmpty")}</p>
          ) : null}

          {figures.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[length:var(--font-path)] text-muted-foreground">
                {t("experiments.results.figures", { count: figures.length })}
              </p>
              {imageFigures.length > 0 ? (
                <FigurePreviewGrid
                  paths={imageFigures.map((f) => f.path)}
                  workspacePath={workspacePath}
                />
              ) : null}
              {listOnlyFigures.length > 0 ? (
                <ul className="space-y-1">
                  {listOnlyFigures.slice(0, BUCKET_LIST_CAP).map((f) => (
                    <li key={`fig-${f.path}`}>
                      <ResultPathRow path={f.path} workspacePath={workspacePath} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {tables.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[length:var(--font-path)] text-muted-foreground">
                {t("experiments.results.tables", { count: tables.length })}
              </p>
              <ul className="space-y-1">
                {tables.map((tbl) => (
                  <li key={tbl.path} className="flex min-w-0 flex-wrap items-baseline gap-2">
                    <ResultPathChip path={tbl.path} workspacePath={workspacePath} />
                    <span className="text-[length:var(--font-size-11)] text-muted-foreground">
                      {t("experiments.results.tableMeta", {
                        cols: tbl.columns.length,
                        rows: tbl.rowCount,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {metrics.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[length:var(--font-path)] text-muted-foreground">
                {t("experiments.results.metrics", { count: metrics.length })}
              </p>
              <ul className="space-y-2">
                {metrics.map((m) => {
                  const pairs = Object.entries(m.values).slice(0, 8);
                  return (
                    <li key={m.path} className="space-y-1">
                      <ResultPathChip path={m.path} workspacePath={workspacePath} />
                      {pairs.length > 0 ? (
                        <p className="font-mono text-[length:var(--font-size-11)] text-muted-foreground">
                          {pairs.map(([k, v]) => `${k}=${v}`).join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {snapshot?.warnings?.length ? (
            <ul className="space-y-0.5 text-[length:var(--font-size-11)] text-warning">
              {snapshot.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </section>
      )}
    </div>
  );
}
