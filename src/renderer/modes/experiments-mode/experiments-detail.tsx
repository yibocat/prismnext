/**
 * experiments-detail — Stub detail view for the Experiments mode (Sprint 0.7).
 *
 * P0 (Task 4) ships a minimal placeholder that just shows the selected
 * experiment's title + workspace path. The full detail (brief strip, env
 * card, run panel, runs table) lands in Tasks 5–6. This stub is the
 * explicit hook point those tasks will replace.
 *
 * Why a stub file (vs. inline placeholder): keeping the hook in its own
 * module makes the Task 5/6 diff a localized replacement rather than a
 * rewrite of experiments-content.tsx, and makes the API surface visible
 * (props = the meta + env the detail will need).
 */

import type { ExperimentEnv, ExperimentMeta } from "../../../shared/experiment-log";

export interface ExperimentsDetailProps {
  meta: ExperimentMeta;
  env: ExperimentEnv | null;
}

export function ExperimentsDetail({ meta, env }: ExperimentsDetailProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4">
      <header className="space-y-1">
        <h2 className="text-[length:var(--font-size-14)] font-medium text-foreground">
          {meta.title}
        </h2>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {meta.workspacePath}
        </p>
      </header>

      {env ? (
        <p className="text-[length:var(--font-size-12)] text-muted-foreground/80">
          {env.python ? `python ${env.pythonVersion ?? ""}` : "no python"} ·{" "}
          {env.rscript ? `R ${env.rVersion ?? ""}` : "no R"} ·{" "}
          {env.gitCommit ? `git ${env.gitCommit}` : "no git"}
        </p>
      ) : null}

      <p className="mt-2 text-[length:var(--font-hint)] uppercase tracking-wide text-muted-foreground/55">
        Detail view placeholder — brief strip, env card, run panel, and
        runs table land in Tasks 5–6.
      </p>
    </div>
  );
}
