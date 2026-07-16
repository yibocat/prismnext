/**
 * experiments-runs-table — Run history for the Experiments detail view.
 *
 * Master–detail: compact list (left) + detail pane (right); stacks on
 * narrow containers. ↑/↓ or j/k move selection; Enter selects; Esc clears.
 */

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  BanIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  CopyIcon,
  FileIcon,
  FileTextIcon,
  Link2Icon,
  PenLineIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import { cn } from "@/lib/utils";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { CopyFeedbackButton } from "@/modes/literature-mode/literature-inline-field";
import { insertExperimentRunToChat } from "@/lib/chat/insert-to-chat";
import { useExperimentStore } from "@/stores/experiment-store";
import { artifactFullPath, openArtifactPathInFiles } from "./experiments-artifact-nav";
import { ExperimentsProvenanceInspector } from "./experiments-provenance-inspector";
import {
  DEFAULT_RUNS_QUERY,
  queryExperimentRuns,
  stepFocusIndex,
  type RunsKindFilter,
  type RunsQuery,
  type RunsSortOrder,
  type RunsStatusFilter,
} from "./experiments-runs-query";
import {
  EXPERIMENT_RUN_KINDS,
  type ExperimentEnv,
  type ExperimentRunEntry,
} from "../../../shared/experiment-log";
import { literatureDetailBadgeClass } from "@/modes/literature-mode/literature-list-chrome";
import {
  experimentsCodeClass,
  experimentsRunDetailPanelClass,
  experimentsRunRowTextClass,
  experimentsRunsListHeaderLabelClass,
  experimentsRunsListHeaderShellClass,
  experimentsRunsSplitShellClass,
  experimentsSubsectionLabelClass,
  formatExperimentRelativeTime,
} from "./experiments-detail-chrome";

export interface ExperimentsRunsTableProps {
  runs: ExperimentRunEntry[];
  workspacePath?: string;
}

const PAGE_SIZE = 10;

/** Artifacts shown before the list collapses into "+N more". */
const ARTIFACT_PREVIEW = 8;

/** Compact list columns for the left pane: status · command · exit · time. */
const HISTORY_GRID_CLASS =
  "grid grid-cols-[0.75rem_minmax(0,1fr)_2rem_3.5rem] gap-x-2";

function formatTime(iso: string): string {
  if (!iso) return "—";
  return formatExperimentRelativeTime(iso);
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

function envSummary(env: ExperimentEnv, noPython: string, venvLabel: string): string {
  const bits: string[] = [];
  if (env.pythonVersion) bits.push(`py ${env.pythonVersion}`);
  else if (env.python) bits.push("py");
  else bits.push(noPython);
  if (env.rVersion) bits.push(`R ${env.rVersion}`);
  else if (env.rscript) bits.push("R");
  if (env.gitCommit) bits.push(`git ${env.gitCommit}`);
  if (env.venvPath) bits.push(venvLabel);
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
  const { t } = useTranslation();
  const fullPath = artifactFullPath(path, workspacePath);
  const name = path.split("/").pop() ?? path;

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => void openArtifactPathInFiles(path, workspacePath)}
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
          title={t("experiments.runs.viewProvenance")}
          aria-label={`${t("experiments.runs.viewProvenance")}: ${name}`}
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
  selected,
  focused,
  onSelect,
  onFocus,
}: {
  run: ExperimentRunEntry;
  selected: boolean;
  focused: boolean;
  onSelect: () => void;
  onFocus: () => void;
}) {
  const { t } = useTranslation();
  const exit = run.exitCode;
  const cancelled = Boolean(run.cancelled);
  const ExitIcon = cancelled
    ? BanIcon
    : exit === 0
      ? CircleCheckIcon
      : CircleXIcon;
  const exitClass = cancelled
    ? "text-muted-foreground"
    : exit === 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";

  return (
    <li data-run-row={run.runId}>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        onFocus={onFocus}
        tabIndex={focused ? 0 : -1}
        className={cn(
          HISTORY_GRID_CLASS,
          "w-full items-center px-2.5",
          "h-[var(--height-right-area-subtoolbar)] shrink-0 min-w-0 border-b border-border/60 text-left",
          "border-l-2 border-l-transparent",
          experimentsRunRowTextClass,
          "cursor-pointer hover:bg-muted/40",
          selected && "border-l-foreground/50 bg-muted/40",
          focused && !selected && "bg-muted/25",
        )}
      >
        <ExitIcon className={cn("size-3 shrink-0", exitClass)} aria-hidden />
        <span className={cn("min-w-0 truncate text-foreground/90", experimentsCodeClass)} title={run.command}>
          {run.command}
        </span>
        <span
          className={cn("text-right tabular-nums", exitClass)}
          title={
            cancelled
              ? t("experiments.runs.cancelledExitTitle", { code: exit })
              : t("experiments.runs.exitCodeTitle", { code: exit })
          }
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
    </li>
  );
}

function RunDetailPanel({
  run,
  workspacePath,
  experimentId,
  onInspectArtifact,
}: {
  run: ExperimentRunEntry;
  workspacePath?: string;
  experimentId?: string | null;
  onInspectArtifact?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const hasTail = Boolean(run.stdoutTail?.trim());
  const hasArtifacts = run.artifacts.length > 0;
  const hasNote = Boolean(run.notes?.trim());
  const noteText = hasNote ? run.notes!.trim() : "";
  const duration = formatDuration(run.startedAt, run.finishedAt);

  const [artifactsExpanded, setArtifactsExpanded] = useState(false);
  const showArtifactFold = hasArtifacts && run.artifacts.length > ARTIFACT_PREVIEW;
  const visibleArtifacts =
    hasArtifacts && showArtifactFold && !artifactsExpanded
      ? run.artifacts.slice(0, ARTIFACT_PREVIEW)
      : run.artifacts;
  const hiddenArtifactCount = run.artifacts.length - ARTIFACT_PREVIEW;

  return (
    <div className={experimentsRunDetailPanelClass} data-run-detail={run.runId}>
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <p className={experimentsSubsectionLabelClass}>{t("experiments.runs.selectedRun")}</p>
        <span className={cn("min-w-0 truncate text-foreground/85", experimentsCodeClass)} title={run.command}>
          {run.command}
        </span>
      </div>

      {hasNote ? (
        <p className="text-[length:var(--font-size-13)] text-foreground/85">
          <span className="font-medium text-muted-foreground">{t("experiments.note")}</span>
          {" — "}
          {noteText}
        </p>
      ) : null}

      {hasTail ? (
        <div>
          <div className="mb-1 text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/60">
            {t("experiments.output")}
          </div>
          <div className="relative">
            <pre
              className={cn(
                "max-h-64 overflow-auto rounded-sm border border-border/60 bg-background",
                "px-2 py-1.5 pr-8 text-foreground/85",
                experimentsCodeClass,
                "whitespace-pre-wrap break-words",
              )}
            >
              {run.stdoutTail}
            </pre>
            <CopyFeedbackButton
              onCopy={() => navigator.clipboard.writeText(run.stdoutTail)}
              title={t("experiments.runs.copyOutput")}
              className="absolute top-1.5 right-1.5 rounded bg-background/90 p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
            >
              <CopyIcon className="size-3" aria-hidden />
            </CopyFeedbackButton>
          </div>
        </div>
      ) : null}

      {hasArtifacts ? (
        <div>
          <div className="mb-1.5 text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/60">
            {t("experiments.artifacts")}
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
                    ? t("experiments.runs.showLess")
                    : t("experiments.runs.showMoreArtifacts", { count: hiddenArtifactCount })
                }
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3 shrink-0 text-muted-foreground/60 transition-transform",
                    artifactsExpanded && "rotate-180",
                  )}
                  aria-hidden
                />
                {artifactsExpanded
                  ? t("experiments.runs.showLess")
                  : t("experiments.runs.moreArtifactsShort", { count: hiddenArtifactCount })}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!hasNote && !hasTail && !hasArtifacts ? (
        <p className={SETTINGS_ROW_DESC}>{t("experiments.runs.noOutput")}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--font-size-11)] text-muted-foreground/55">
        {run.kind ? (
          <span className={literatureDetailBadgeClass} title={t("experiments.type")}>
            {run.kind}
          </span>
        ) : null}
        <span className="text-[length:var(--font-path)]">{run.runId}</span>
        {duration ? <span>{duration}</span> : null}
        <span>
          {envSummary(run.env, t("experiments.runs.noPython"), t("experiments.runs.venv"))}
        </span>
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded-md border border-border/55 bg-background px-2 text-[length:var(--font-menu-item)] text-foreground/85 transition-colors hover:bg-accent hover:text-foreground"
          title={t("experiments.runs.sendToChat")}
          onClick={() =>
            insertExperimentRunToChat({
              runId: run.runId,
              experimentId: experimentId ?? undefined,
              command: run.command,
              exitCode: run.exitCode,
              startedAt: run.startedAt,
              finishedAt: run.finishedAt,
              artifacts: run.artifacts ?? [],
              env: run.env,
              chatSessionId: run.chatSessionId ?? null,
              workspacePath,
              runKind: run.kind,
              notes: run.notes,
              logPath: run.logPath ?? null,
              intent: "cite-in-paper",
            })
          }
        >
          <PenLineIcon className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
          {t("experiments.runs.useInPaper")}
        </button>
        {run.logPath ? (
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border/55 bg-background px-2 text-[length:var(--font-menu-item)] text-foreground/85 transition-colors hover:bg-accent hover:text-foreground"
            title={artifactFullPath(run.logPath, workspacePath)}
            onClick={() => void openArtifactPathInFiles(run.logPath!, workspacePath)}
          >
            <FileTextIcon className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
            {t("experiments.runs.openFullLog")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ExperimentsRunsTable({
  runs,
  workspacePath,
}: ExperimentsRunsTableProps) {
  const { t } = useTranslation();
  const experimentId = useExperimentStore((s) => s.selectedId);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [inspect, setInspect] = useState<{ path: string } | null>(null);
  const [query, setQuery] = useState<RunsQuery>(DEFAULT_RUNS_QUERY);
  const [focusIndex, setFocusIndex] = useState(0);

  const ordered = useMemo(() => queryExperimentRuns(runs, query), [runs, query]);
  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
    setSelectedRunId(null);
    setFocusIndex(0);
  }, [runs.length, workspacePath, query.status, query.text, query.sort, query.kind]);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const pageRuns = useMemo(() => {
    const start = page * PAGE_SIZE;
    return ordered.slice(start, start + PAGE_SIZE);
  }, [ordered, page]);

  // Clear selection when the selected run leaves the current page.
  useEffect(() => {
    if (!selectedRunId) return;
    if (!pageRuns.some((r) => r.runId === selectedRunId)) {
      setSelectedRunId(null);
    }
  }, [pageRuns, selectedRunId]);

  const rangeStart = ordered.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, ordered.length);
  const safeFocus =
    pageRuns.length === 0 ? -1 : Math.min(focusIndex, pageRuns.length - 1);

  const selectedRun =
    selectedRunId != null
      ? (pageRuns.find((r) => r.runId === selectedRunId) ?? null)
      : null;

  const selectAt = (index: number) => {
    const run = pageRuns[index];
    if (!run) return;
    setFocusIndex(index);
    setSelectedRunId(run.runId);
  };

  const handleListKeyDown = (e: KeyboardEvent) => {
    if (pageRuns.length === 0) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.closest("[data-slot=select-trigger]"))
    ) {
      return;
    }

    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      const next = stepFocusIndex(safeFocus < 0 ? 0 : safeFocus, 1, pageRuns.length);
      selectAt(next);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      const next = stepFocusIndex(safeFocus < 0 ? 0 : safeFocus, -1, pageRuns.length);
      selectAt(next);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (safeFocus >= 0) selectAt(safeFocus);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSelectedRunId(null);
    } else if (e.key === "Home") {
      e.preventDefault();
      selectAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      selectAt(pageRuns.length - 1);
    }
  };

  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-4 py-8 text-center">
        <p className={SETTINGS_ROW_DESC}>{t("experiments.runs.noRunsYet")}</p>
        <p className="mt-1 text-[length:var(--font-size-11)] text-muted-foreground/50">
          {t("experiments.runs.enterCommandHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 font-sans">
        <Input
          value={query.text}
          onChange={(e) => setQuery((q) => ({ ...q, text: e.target.value }))}
          placeholder={t("experiments.runs.filterPlaceholder")}
          className="h-6 max-w-xs text-[length:var(--font-size-11)]"
          aria-label={t("experiments.runs.filterAria")}
        />
        <AppSelect
          value={query.status}
          onValueChange={(v) =>
            setQuery((q) => ({ ...q, status: v as RunsStatusFilter }))
          }
        >
          <AppSelectTrigger variant="wide" aria-label={t("experiments.runs.exitFilterAria")}>
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">{t("experiments.runs.allExits")}</AppSelectItem>
            <AppSelectItem value="success">{t("experiments.runs.success")}</AppSelectItem>
            <AppSelectItem value="failed">{t("experiments.runs.failed")}</AppSelectItem>
            <AppSelectItem value="cancelled">{t("experiments.runs.cancelled")}</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
        <AppSelect
          value={query.kind}
          onValueChange={(v) =>
            setQuery((q) => ({ ...q, kind: v as RunsKindFilter }))
          }
        >
          <AppSelectTrigger variant="wide" aria-label={t("experiments.runs.typeFilterAria")}>
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">{t("experiments.runs.allTypes")}</AppSelectItem>
            {EXPERIMENT_RUN_KINDS.map((k) => (
              <AppSelectItem key={k} value={k}>
                {k}
              </AppSelectItem>
            ))}
            <AppSelectItem value="untagged">{t("experiments.untyped")}</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
        <AppSelect
          value={query.sort}
          onValueChange={(v) =>
            setQuery((q) => ({ ...q, sort: v as RunsSortOrder }))
          }
        >
          <AppSelectTrigger variant="wide" aria-label={t("experiments.runs.sortAria")}>
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="newest">{t("experiments.runs.newestFirst")}</AppSelectItem>
            <AppSelectItem value="oldest">{t("experiments.runs.oldestFirst")}</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
        <span className="tabular-nums text-[length:var(--font-size-11)] text-muted-foreground/55">
          {ordered.length === runs.length
            ? `${ordered.length}`
            : `${ordered.length} / ${runs.length}`}
        </span>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center">
          <p className={SETTINGS_ROW_DESC}>{t("experiments.runs.noMatch")}</p>
        </div>
      ) : (
        <div
          className={cn(
            experimentsRunsSplitShellClass,
            "flex min-h-[16rem] flex-col @md:min-h-[20rem] @md:flex-row",
          )}
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col",
              "@md:w-[min(22rem,42%)] @md:shrink-0 @md:border-r @md:border-border/60",
            )}
          >
            <div
              className="min-h-0 flex-1 overflow-auto outline-none"
              tabIndex={0}
              role="listbox"
              aria-label={t("experiments.runs.historyAria")}
              aria-activedescendant={selectedRunId ?? undefined}
              onKeyDown={handleListKeyDown}
            >
              <div
                className={cn(
                  HISTORY_GRID_CLASS,
                  experimentsRunsListHeaderShellClass,
                  "sticky top-0 z-[1] items-center border-l-2 border-l-transparent px-2.5",
                )}
                role="row"
              >
                <span aria-hidden />
                <span className={experimentsRunsListHeaderLabelClass} role="columnheader">
                  {t("experiments.command")}
                </span>
                <span
                  className={cn(experimentsRunsListHeaderLabelClass, "text-right")}
                  role="columnheader"
                >
                  {t("experiments.exit")}
                </span>
                <span
                  className={cn(experimentsRunsListHeaderLabelClass, "text-right")}
                  role="columnheader"
                >
                  {t("experiments.time")}
                </span>
              </div>
              <ul>
                {pageRuns.map((run, index) => (
                  <RunRow
                    key={run.runId}
                    run={run}
                    selected={selectedRunId === run.runId}
                    focused={index === safeFocus}
                    onSelect={() => selectAt(index)}
                    onFocus={() => setFocusIndex(index)}
                  />
                ))}
              </ul>
            </div>
            {totalPages > 1 ? (
              <div
                className={cn(
                  "flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-2.5 py-1.5",
                  "bg-muted/15 text-[length:var(--font-size-11)] text-muted-foreground",
                )}
              >
                <span className="tabular-nums">
                  {t("experiments.runs.pageRange", {
                    from: rangeStart,
                    to: rangeEnd,
                    total: ordered.length,
                  })}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-6 gap-0.5 px-1.5"
                    disabled={page <= 0}
                    onClick={() => {
                      setPage((p) => Math.max(0, p - 1));
                      setSelectedRunId(null);
                    }}
                    title={t("experiments.runs.prevPage")}
                  >
                    <ChevronLeftIcon className="size-3" aria-hidden />
                  </Button>
                  <span className="min-w-[3rem] text-center tabular-nums">
                    {page + 1}/{totalPages}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-6 gap-0.5 px-1.5"
                    disabled={page >= totalPages - 1}
                    onClick={() => {
                      setPage((p) => Math.min(totalPages - 1, p + 1));
                      setSelectedRunId(null);
                    }}
                    title={t("experiments.runs.nextPage")}
                  >
                    <ChevronRightIcon className="size-3" aria-hidden />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col border-t border-border/60",
              "@md:border-t-0",
            )}
          >
            {selectedRun ? (
              <RunDetailPanel
                run={selectedRun}
                workspacePath={workspacePath}
                experimentId={experimentId}
                onInspectArtifact={(p) => setInspect({ path: p })}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center px-4 py-8">
                <p className="text-center text-[length:var(--font-size-12)] text-muted-foreground/60">
                  {t("experiments.runs.selectRunHint")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
