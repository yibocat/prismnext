/**
 * experiments-results-panel — Station 3 Results view.
 *
 * Two layers (kept semantically separate):
 *  - Declared: paths recorded on run entries (bookkeeping)
 *  - Discovered: workspace scan via experiment:snapshot (figures / tables / metrics)
 */

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FileIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { ChatProjectImage } from "@/lib/markdown/extract-markdown-images";
import { cn } from "@/lib/utils";
import { useExperimentStore } from "@/stores/experiment-store";
import {
  type ExperimentRunEntry,
} from "../../../shared/experiment-log";
import { isImageArtifactPath } from "../../../shared/artifact-path";
import {
  artifactFullPath,
  openArtifactPathInFiles,
} from "./experiments-artifact-nav";
import { useExperimentProjectRoot } from "./experiments-project-root";
import {
  experimentsSubsectionLabelClass,
  experimentsUiValueClass,
} from "./experiments-detail-chrome";

const DECLARED_CAP = 40;
const FIGURE_PREVIEW_CAP = 12;

/** Newest-first unique declared artifact paths from run records. */
export function collectDeclaredArtifacts(runs: ExperimentRunEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!;
    for (const raw of run.artifacts ?? []) {
      const p = (raw || "").trim().replace(/\\/g, "/");
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
      if (out.length >= DECLARED_CAP) return out;
    }
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

export function ExperimentsResultsPanel({
  workspacePath,
  runs,
}: {
  workspacePath: string;
  runs: ExperimentRunEntry[];
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const selectedId = useExperimentStore((s) => s.selectedId);
  const snapshot = useExperimentStore((s) => s.resultsSnapshot);
  const loading = useExperimentStore((s) => s.resultsSnapshotLoading);
  const loadResultsSnapshot = useExperimentStore((s) => s.loadResultsSnapshot);

  const declared = useMemo(() => collectDeclaredArtifacts(runs), [runs]);

  const handleRefresh = useCallback(() => {
    if (!projectRoot || !selectedId) return;
    void loadResultsSnapshot(projectRoot, selectedId);
  }, [loadResultsSnapshot, projectRoot, selectedId]);

  const figures = snapshot?.figures ?? [];
  const tables = snapshot?.tables ?? [];
  const metrics = snapshot?.metrics ?? [];
  const imageFigures = figures
    .filter((f) => isImageArtifactPath(f.path) || /\.(png|jpe?g|webp|svg)$/i.test(f.path))
    .slice(0, FIGURE_PREVIEW_CAP);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className={SETTINGS_ROW_DESC}>{t("experiments.results.intro")}</p>
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
      </div>

      <section className="space-y-2">
        <h4 className={experimentsSubsectionLabelClass}>
          {t("experiments.results.declared")}
          <span className="ml-1.5 tabular-nums text-muted-foreground/65">
            ({declared.length})
          </span>
        </h4>
        <p className={cn(SETTINGS_ROW_DESC, "text-muted-foreground/80")}>
          {t("experiments.results.declaredHint")}
        </p>
        {declared.length === 0 ? (
          <p className={experimentsUiValueClass}>{t("experiments.results.declaredEmpty")}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {declared.map((p) => (
              <ResultPathChip key={p} path={p} workspacePath={workspacePath} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-border pt-4">
        <h4 className={experimentsSubsectionLabelClass}>
          {t("experiments.results.discovered")}
          {snapshot ? (
            <span className="ml-1.5 tabular-nums text-muted-foreground/65">
              ({figures.length} · {tables.length} · {metrics.length})
            </span>
          ) : null}
        </h4>
        <p className={cn(SETTINGS_ROW_DESC, "text-muted-foreground/80")}>
          {t("experiments.results.discoveredHint")}
        </p>

        {loading && !snapshot ? (
          <p className={experimentsUiValueClass}>{t("experiments.results.scanning")}</p>
        ) : null}

        {!loading && snapshot && figures.length === 0 && tables.length === 0 && metrics.length === 0 ? (
          <p className={experimentsUiValueClass}>{t("experiments.results.discoveredEmpty")}</p>
        ) : null}

        {figures.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[length:var(--font-path)] text-muted-foreground">
              {t("experiments.results.figures", { count: figures.length })}
            </p>
            {imageFigures.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 @md:grid-cols-3">
                {imageFigures.map((f) => {
                  const src = artifactFullPath(f.path, workspacePath);
                  return (
                    <button
                      key={f.path}
                      type="button"
                      className="overflow-hidden rounded-md border border-border bg-muted text-left transition-colors hover:border-foreground/25"
                      onClick={() => void openArtifactPathInFiles(f.path, workspacePath)}
                      title={f.path}
                    >
                      <ChatProjectImage
                        src={src}
                        alt={f.path.split("/").pop() || "figure"}
                      />
                      <span className="block truncate px-2 py-1 text-[length:var(--font-size-11)] text-muted-foreground">
                        {f.path.split("/").pop()}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {figures.map((f) => (
                <ResultPathChip key={`fig-${f.path}`} path={f.path} workspacePath={workspacePath} />
              ))}
            </div>
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
    </div>
  );
}
