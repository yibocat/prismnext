/**
 * experiments-runs-table — Run history for the Experiments detail view.
 *
 * Accordion rows (one expanded at a time) + paginated newest-first list.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  CopyIcon,
  FileIcon,
  Link2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { CopyFeedbackButton } from "@/modes/literature-mode/literature-inline-field";
import { artifactFullPath, openArtifactInFiles } from "./experiments-artifact-nav";
import { ExperimentsProvenanceInspector } from "./experiments-provenance-inspector";
import type {
  ExperimentEnv,
  ExperimentRunEntry,
} from "../../../shared/experiment-log";
import {
  experimentsCodeClass,
  experimentsRunExpandedClass,
  experimentsRunRowTextClass,
  experimentsRunsListHeaderLabelClass,
  experimentsRunsListHeaderShellClass,
  experimentsRunsTableShellClass,
} from "./experiments-detail-chrome";

export interface ExperimentsRunsTableProps {
  runs: ExperimentRunEntry[];
  workspacePath?: string;
}

const PAGE_SIZE = 10;

/** Artifacts shown before the list collapses into "+N more" (keeps runs with many outputs readable). */
const ARTIFACT_PREVIEW = 8;

/** Shared column template for header + data rows. */
const HISTORY_GRID_CLASS =
  "grid grid-cols-[0.75rem_0.75rem_minmax(0,1.2fr)_minmax(6rem,0.9fr)_2rem_4.25rem] gap-x-2";

function formatTime(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(t).toLocaleDateString();
}

function formatDuration(startedAt: string, finishedAt: string): string | null {
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function envSummary(env: ExperimentEnv): string {
  const bits: string[] = [];
  if (env.pythonVersion) bits.push(`py ${env.pythonVersion}`);
  else if (env.python) bits.push("py");
  else bits.push("no python");
  if (env.rVersion) bits.push(`R ${env.rVersion}`);
  else if (env.rscript) bits.push("R");
  if (env.gitCommit) bits.push(`git ${env.gitCommit}`);
  if (env.venvPath) bits.push("venv");
  return bits.join(" · ");
}

function ArtifactChip({
  path,
  workspacePath,
  onInspect,
}: {
  path: string;
  workspacePath?: string;
  onInspect?: (path: string) => void;
}) {
  const fullPath = artifactFullPath(path, workspacePath);
  const name = path.split("/").pop() ?? path;

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => openArtifactInFiles(fullPath)}
        className="inline-flex h-6 items-center gap-1 rounded-md border border-border/55 bg-background px-2 text-[length:var(--font-menu-item)] text-foreground/90 transition-colors hover:bg-accent hover:text-foreground"
        title={fullPath}
      >
        <FileIcon className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
        <span className="max-w-[14rem] truncate">{name}</span>
      </button>
      {onInspect ? (
        <button
          type="button"
          onClick={() => onInspect(path)}
          title="View provenance"
          aria-label={`View provenance for ${name}`}
          className="inline-flex h-6 items-center rounded-md border border-border/55 bg-background px-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Link2Icon className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

function RunRow({
  run,
  workspacePath,
  open,
  onToggle,
  onInspectArtifact,
}: {
  run: ExperimentRunEntry;
  workspacePath?: string;
  open: boolean;
  onToggle: () => void;
  onInspectArtifact?: (path: string) => void;
}) {
  const exit = run.exitCode;
  const ExitIcon = exit === 0 ? CircleCheckIcon : CircleXIcon;
  const exitClass =
    exit === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
  const hasTail = Boolean(run.stdoutTail?.trim());
  const hasArtifacts = run.artifacts.length > 0;
  const hasNote = Boolean(run.notes?.trim());
  const expandable = hasTail || hasArtifacts || hasNote;
  const duration = formatDuration(run.startedAt, run.finishedAt);
  const noteText = hasNote ? run.notes!.trim() : "";

  // Collapse the artifact chip list once it gets long, so a run with many
  // outputs doesn't flood the row. The "+N more" toggle expands inline.
  const [artifactsExpanded, setArtifactsExpanded] = useState(false);
  const showArtifactFold = hasArtifacts && run.artifacts.length > ARTIFACT_PREVIEW;
  const visibleArtifacts =
    hasArtifacts && showArtifactFold && !artifactsExpanded
      ? run.artifacts.slice(0, ARTIFACT_PREVIEW)
      : run.artifacts;
  const hiddenArtifactCount = run.artifacts.length - ARTIFACT_PREVIEW;

  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={() => expandable && onToggle()}
        disabled={!expandable}
        aria-expanded={open}
        className={cn(
          HISTORY_GRID_CLASS,
          "w-full items-center px-3",
          "h-[var(--height-right-area-subtoolbar)] shrink-0 min-w-0 border-b border-border/60 text-left",
          experimentsRunRowTextClass,
          expandable && "cursor-pointer hover:bg-accent/40",
          !expandable && "cursor-default",
          open && "bg-muted/30",
        )}
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-90",
            !expandable && "opacity-0",
          )}
          aria-hidden
        />
        <ExitIcon className={cn("size-3 shrink-0", exitClass)} aria-hidden />
        <span className={cn("min-w-0 truncate text-foreground/90", experimentsCodeClass)} title={run.command}>
          {run.command}
        </span>
        <span
          className={cn(
            "min-w-0 truncate",
            hasNote ? "text-foreground/75" : "text-muted-foreground/25",
          )}
          title={noteText || "No note"}
        >
          {hasNote ? noteText : "—"}
        </span>
        <span
          className={cn("text-right tabular-nums", exitClass)}
          title={`exit code ${exit}`}
        >
          {exit}
        </span>
        <time
          dateTime={run.finishedAt}
          className="text-right tabular-nums text-muted-foreground/70"
          title={run.finishedAt}
        >
          {formatTime(run.finishedAt)}
        </time>
      </button>

      {open ? (
        <div className={experimentsRunExpandedClass}>
          {hasNote ? (
            <p className="text-[length:var(--font-size-13)] text-foreground/85">
              <span className="font-medium text-muted-foreground">Note</span>
              {" — "}
              {noteText}
            </p>
          ) : null}

          {hasTail ? (
            <div>
              <div className="mb-1 text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/60">
                Output
              </div>
              <div className="relative">
                <pre
                  className={cn(
                    "max-h-64 overflow-auto rounded-sm border border-border/60 bg-background/80",
                    "px-2 py-1.5 pr-8 text-foreground/85",
                    experimentsCodeClass,
                    "whitespace-pre-wrap break-words",
                  )}
                >
                  {run.stdoutTail}
                </pre>
                <CopyFeedbackButton
                  onCopy={() => navigator.clipboard.writeText(run.stdoutTail)}
                  title="Copy output"
                  className="absolute top-1.5 right-1.5 rounded bg-background/90 p-0.5 text-muted-foreground/60 shadow-sm hover:bg-muted hover:text-foreground"
                >
                  <CopyIcon className="size-3" aria-hidden />
                </CopyFeedbackButton>
              </div>
            </div>
          ) : null}

          {hasArtifacts ? (
            <div>
              <div className="mb-1.5 text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/60">
                Artifacts
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleArtifacts.map((artifact) => (
                  <ArtifactChip
                    key={artifact}
                    path={artifact}
                    workspacePath={workspacePath}
                    onInspect={onInspectArtifact}
                  />
                ))}
                {showArtifactFold ? (
                  <button
                    type="button"
                    onClick={() => setArtifactsExpanded((v) => !v)}
                    aria-expanded={artifactsExpanded}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-border/55 bg-background px-2 text-[length:var(--font-menu-item)] text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
                    title={
                      artifactsExpanded
                        ? "Show fewer"
                        : `Show ${hiddenArtifactCount} more artifact${hiddenArtifactCount === 1 ? "" : "s"}`
                    }
                  >
                    <ChevronDownIcon
                      className={cn(
                        "size-3 shrink-0 text-muted-foreground/60 transition-transform",
                        artifactsExpanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                    {artifactsExpanded ? "show less" : `+${hiddenArtifactCount} more`}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--font-size-11)] text-muted-foreground/55">
            <span className="text-[length:var(--font-path)]">{run.runId}</span>
            {duration ? <span>{duration}</span> : null}
            <span>{envSummary(run.env)}</span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function ExperimentsRunsTable({
  runs,
  workspacePath,
}: ExperimentsRunsTableProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [inspect, setInspect] = useState<{ path: string } | null>(null);

  const ordered = useMemo(() => [...runs].reverse(), [runs]);
  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
    setExpandedRunId(null);
  }, [runs.length, workspacePath]);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const pageRuns = useMemo(() => {
    const start = page * PAGE_SIZE;
    return ordered.slice(start, start + PAGE_SIZE);
  }, [ordered, page]);

  const rangeStart = ordered.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, ordered.length);

  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-4 py-8 text-center">
        <p className={SETTINGS_ROW_DESC}>No runs yet.</p>
        <p className="mt-1 text-[length:var(--font-size-11)] text-muted-foreground/50">
          Enter a command above and click Run.
        </p>
      </div>
    );
  }

  const handleToggle = (runId: string) => {
    setExpandedRunId((current) => (current === runId ? null : runId));
  };

  return (
    <div className={experimentsRunsTableShellClass}>
      <div
        className={cn(
          HISTORY_GRID_CLASS,
          experimentsRunsListHeaderShellClass,
          "items-center",
        )}
        role="row"
      >
        <span aria-hidden />
        <span aria-hidden />
        <span className={experimentsRunsListHeaderLabelClass} role="columnheader">
          Command
        </span>
        <span className={experimentsRunsListHeaderLabelClass} role="columnheader">
          Note
        </span>
        <span className={cn(experimentsRunsListHeaderLabelClass, "text-right")} role="columnheader">
          Exit
        </span>
        <span className={cn(experimentsRunsListHeaderLabelClass, "text-right")} role="columnheader">
          Time
        </span>
      </div>
      <ul>
        {pageRuns.map((run) => (
          <RunRow
            key={run.runId}
            run={run}
            workspacePath={workspacePath}
            open={expandedRunId === run.runId}
            onToggle={() => handleToggle(run.runId)}
            onInspectArtifact={(p) => setInspect({ path: p })}
          />
        ))}
      </ul>
      {totalPages > 1 ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5",
            "bg-muted/15 text-[length:var(--font-size-11)] text-muted-foreground",
          )}
        >
          <span className="tabular-nums">
            {rangeStart}–{rangeEnd} of {ordered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 gap-0.5 px-1.5"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              title="Previous page"
            >
              <ChevronLeftIcon className="size-3" aria-hidden />
              Prev
            </Button>
            <span className="min-w-[4.5rem] text-center tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 gap-0.5 px-1.5"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              title="Next page"
            >
              Next
              <ChevronRightIcon className="size-3" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
      <ExperimentsProvenanceInspector
        open={inspect !== null}
        onOpenChange={(next) => {
          if (!next) setInspect(null);
        }}
        artifactPath={inspect?.path ?? ""}
        workspacePath={workspacePath}
      />
    </div>
  );
}
