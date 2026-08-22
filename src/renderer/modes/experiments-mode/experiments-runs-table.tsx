/**
 * experiments-runs-table — Run history for the Experiments Execution pane.
 *
 * Literature/Git-style flush list: click a row to expand detail inline.
 * Filter/sort live in the mode toolbar (store.runsQuery). No pagination.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CircleXIcon,
  CopyIcon,
  FileIcon,
  FileTextIcon,
  Link2Icon,
  SquareArrowOutUpRightIcon,
} from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import {
  CopyFeedbackButton,
  InlineEditableField,
} from "@/modes/literature-mode/literature-inline-field";
import { useExperimentStore } from "@/stores/experiment-store";
import { artifactFullPath, openArtifactPathInFiles, resolveRunImagePathsForDisplay } from "./experiments-artifact-nav";
import { ChatProjectImage } from "@/lib/markdown/extract-markdown-images";
import { useDocumentStore } from "@/stores/document-store";
import { resolveProjectRelativePath } from "@/lib/files/project-path";
import { isImageArtifactPath } from "../../../shared/interaction/artifact-path";
import { ExperimentsProvenanceInspector } from "./experiments-provenance-inspector";
import {
  experimentRunListTitle,
  queryExperimentRuns,
  stepFocusIndex,
} from "@/lib/experiments/runs-query";
import {
  type ExperimentEnv,
  type ExperimentRunEntry,
} from "../../../shared/experiments/log";
import {
  experimentsCodeClass,
  experimentsMetadataLabelClass,
  experimentsMetadataRowClass,
  experimentsRunDetailPanelClass,
  experimentsRunRowTextClass,
  experimentsRunsListHeaderLabelClass,
  experimentsRunsListHeaderShellClass,
  experimentsUiValueClass,
  formatExperimentRelativeTime,
} from "./experiments-detail-chrome";
import { useExperimentProjectRoot } from "./experiments-project-root";
import { experimentRunDragPayload } from "./experiment-run-drag";
import { setComposerDragData } from "@/lib/chat/composer-drag";

export interface ExperimentsRunsTableProps {
  runs: ExperimentRunEntry[];
  workspacePath?: string;
  /** Jump to Results and expand this run's declared artifacts. */
  onOpenResults?: (runId: string) => void;
}

/** Artifacts shown before the list collapses into "+N more". */
const ARTIFACT_PREVIEW = 8;

/** icon · title · kind · status · duration · finished · checkbox (trailing) */
const HISTORY_GRID_CLASS =
  "grid grid-cols-[0.75rem_minmax(0,1fr)_3.5rem_3rem_3.25rem_4rem_1rem] gap-x-2";

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
  else if (env.python) bits.push("python");
  else bits.push(noPython);
  if (env.rVersion) bits.push(`R ${env.rVersion}`);
  else if (env.rscript) bits.push("R");
  if (env.gitCommit) bits.push(`git ${env.gitCommit}`);
  if (env.venvPath) bits.push(venvLabel);
  if (env.platform) bits.push(env.platform);
  return bits.join(" · ");
}

function RunMetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={experimentsMetadataRowClass}>
      <span className={cn(experimentsMetadataLabelClass, "leading-5")}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const COPY_FEEDBACK_MS = 1500;

/** Same pattern as Overview `CopyableText`: click text or hover icon; checkmark feedback. */
function InlineCopyValue({
  text,
  className,
  mono = false,
}: {
  text: string;
  className?: string;
  mono?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <Hint
      label={
        copied
          ? t("common.copied")
          : t("experiments.detail.clickToCopy", { text })
      }
    >
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            if (timerRef.current != null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
          });
        }}
        className={cn(
          "group inline-flex max-w-full items-baseline gap-1.5 text-left transition-colors",
          mono ? experimentsCodeClass : experimentsUiValueClass,
          "rounded-[3px] hover:text-foreground",
          className,
        )}
      >
        <span className="min-w-0 break-all">{text}</span>
        {copied ? (
          <CheckIcon
            className="size-3 shrink-0 self-center text-success"
            aria-label={t("common.copied")}
          />
        ) : (
          <CopyIcon
            className="size-3 shrink-0 self-center text-muted-foreground/45 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        )}
      </button>
    </Hint>
  );
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
    <div className="flex min-w-0 items-center gap-1.5 py-0.5">
      <FileIcon className="size-3 shrink-0 text-muted-foreground/55" aria-hidden />
      <Hint label={fullPath}>
        <button
          type="button"
          onClick={() => void openArtifactPathInFiles(path, workspacePath)}
          className={cn(
            "min-w-0 truncate text-left text-[length:var(--font-size-13)] text-foreground/90",
            "hover:underline underline-offset-2",
          )}
        >
          {name}
        </button>
      </Hint>
      {onInspect ? (
        <Hint label={t("experiments.runs.viewProvenance")}>
          <button
            type="button"
            onClick={() => onInspect(path)}
            aria-label={`${t("experiments.runs.viewProvenance")}: ${name}`}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/55 transition-colors hover:bg-accent hover:text-foreground"
          >
            <Link2Icon className="size-3" aria-hidden />
          </button>
        </Hint>
      ) : null}
    </div>
  );
}

function RunRow({
  run,
  workspacePath,
  experimentId,
  selected,
  focused,
  checked,
  onSelect,
  onFocus,
  onCheckedChange,
}: {
  run: ExperimentRunEntry;
  workspacePath?: string;
  experimentId?: string;
  selected: boolean;
  focused: boolean;
  checked: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onCheckedChange: (checked: boolean) => void;
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
      ? "text-success"
      : "text-destructive";
  const title = experimentRunListTitle(run);
  const duration = formatDuration(run.startedAt, run.finishedAt);
  const statusLabel = cancelled
    ? t("experiments.runs.cancelledShort")
    : exit === 0
      ? t("experiments.runs.successShort")
      : t("experiments.runs.failedShort");
  const kindLabel = run.kind || t("experiments.untyped");
  const metaClass = cn(
    "truncate",
    experimentsRunRowTextClass,
    "text-muted-foreground",
  );

  return (
    <div
      id={`run-row-${run.runId}`}
      role="option"
      aria-selected={selected}
      aria-expanded={selected}
      tabIndex={focused ? 0 : -1}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        setComposerDragData(e.dataTransfer, [
          experimentRunDragPayload(run, { workspacePath, experimentId }),
        ]);
      }}
      onFocus={onFocus}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        HISTORY_GRID_CLASS,
        "w-full items-center px-3",
        "h-[var(--height-right-area-subtoolbar)] shrink-0 min-w-0 border-b border-border/60 text-left box-border",
        experimentsRunRowTextClass,
        "cursor-pointer hover:bg-muted",
        selected && "bg-muted",
        focused && !selected && "bg-accent",
      )}
    >
      <ExitIcon className={cn("size-3 shrink-0", exitClass)} aria-hidden />
      <span className="min-w-0 truncate text-foreground" title={run.command || title}>
        {title}
      </span>
      <span className={metaClass} title={t("experiments.type")}>
        {kindLabel}
      </span>
      <span
        className={cn(metaClass, exitClass)}
        title={
          cancelled
            ? t("experiments.runs.cancelledExitTitle", { code: exit })
            : t("experiments.runs.exitCodeTitle", { code: exit })
        }
      >
        {statusLabel}
      </span>
      <span
        className={cn(metaClass, "text-right tabular-nums")}
        title={t("experiments.provenance.duration")}
      >
        {duration ?? "—"}
      </span>
      <time
        dateTime={run.finishedAt}
        className={cn(metaClass, "text-right tabular-nums")}
        title={run.finishedAt}
      >
        {formatTime(run.finishedAt)}
      </time>
      <span
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="size-3 shrink-0 cursor-pointer rounded-sm accent-primary"
          title={t("experiments.runs.selectRunAria", { title })}
          aria-label={t("experiments.runs.selectRunAria", { title })}
        />
      </span>
    </div>
  );
}

function RunDetailPanel({
  run,
  workspacePath,
  experimentId,
  onInspectArtifact,
  onOpenResults,
}: {
  run: ExperimentRunEntry;
  workspacePath?: string;
  experimentId?: string | null;
  onInspectArtifact?: (path: string) => void;
  onOpenResults?: (runId: string) => void;
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const updateRunNotes = useExperimentStore((s) => s.updateRunNotes);
  const hasTail = Boolean(run.stdoutTail?.trim());
  const hasArtifacts = run.artifacts.length > 0;
  const noteText = run.notes?.trim() ?? "";
  const duration = formatDuration(run.startedAt, run.finishedAt);

  const [artifactsExpanded, setArtifactsExpanded] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const showArtifactFold = hasArtifacts && run.artifacts.length > ARTIFACT_PREVIEW;
  const visibleArtifacts =
    hasArtifacts && showArtifactFold && !artifactsExpanded
      ? run.artifacts.slice(0, ARTIFACT_PREVIEW)
      : run.artifacts;
  const hiddenArtifactCount = run.artifacts.length - ARTIFACT_PREVIEW;
  const snapshotImages = resolveRunImagePathsForDisplay(
    { artifacts: run.artifacts, artifactSnapshots: run.artifactSnapshots },
    workspacePath,
  ).filter((p) => (run.artifactSnapshots?.length ? true : isImageArtifactPath(p)));
  const docRoot = useDocumentStore((s) => s.projectRoot);
  const [workingCopyNewer, setWorkingCopyNewer] = useState(false);

  useEffect(() => {
    setArtifactsExpanded(false);
    setOutputOpen(false);
  }, [run.runId]);

  useEffect(() => {
    setWorkingCopyNewer(false);
    if (!docRoot || !run.artifactSnapshots?.length || !run.finishedAt) return;
    const finishedMs = Date.parse(run.finishedAt) || 0;
    if (!finishedMs) return;
    let cancelled = false;
    void (async () => {
      for (const art of run.artifacts) {
        if (!isImageArtifactPath(art)) continue;
        const abs = resolveProjectRelativePath(docRoot, artifactFullPath(art, workspacePath));
        if (!abs) continue;
        try {
          const st = await window.electronAPI.fsStat(abs);
          if (st && st.mtimeMs > finishedMs + 1000) {
            if (!cancelled) setWorkingCopyNewer(true);
            return;
          }
        } catch {
          // ignore
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docRoot, run.runId, run.finishedAt, run.artifacts, run.artifactSnapshots, workspacePath]);

  const exitLabel = run.cancelled
    ? t("experiments.runs.cancelledExitTitle", { code: run.exitCode })
    : t("experiments.runs.exitCodeTitle", { code: run.exitCode });

  return (
    <div className={experimentsRunDetailPanelClass} data-run-detail={run.runId}>
      <div className="space-y-0.5">
        <RunMetaRow label={t("experiments.note")}>
          <InlineEditableField
            value={noteText}
            multiline
            fitContent
            minRows={1}
            maxRows={8}
            placeholder={t("experiments.runs.notePlaceholder")}
            displayClassName={cn(experimentsUiValueClass, "whitespace-pre-wrap")}
            onSave={async (next) => {
              if (!projectRoot || !experimentId) throw new Error("no experiment");
              const ok = await updateRunNotes(projectRoot, experimentId, run.runId, next);
              if (!ok) throw new Error("save failed");
            }}
          />
        </RunMetaRow>

        <RunMetaRow label={t("experiments.command")}>
          <InlineCopyValue text={run.command} mono />
        </RunMetaRow>

        <RunMetaRow label={t("experiments.type")}>
          <span className={experimentsUiValueClass}>
            {run.kind || t("experiments.untyped")}
          </span>
        </RunMetaRow>

        <RunMetaRow label={t("experiments.exit")}>
          <span className={experimentsUiValueClass}>{exitLabel}</span>
        </RunMetaRow>

        <RunMetaRow label={t("experiments.provenance.duration")}>
          <span className={experimentsUiValueClass}>{duration ?? "—"}</span>
        </RunMetaRow>

        <RunMetaRow label={t("experiments.overview.environment")}>
          <span className={experimentsUiValueClass}>
            {envSummary(run.env, t("experiments.runs.noPython"), t("experiments.runs.venv"))}
          </span>
        </RunMetaRow>

        <RunMetaRow label={t("experiments.overview.id")}>
          <InlineCopyValue text={run.runId} />
        </RunMetaRow>
      </div>

      {hasTail ? (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setOutputOpen((v) => !v)}
            aria-expanded={outputOpen}
            className="inline-flex h-6 items-center gap-1 text-[length:var(--font-size-11)] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDownIcon
              className={cn(
                "size-3 shrink-0 transition-transform",
                outputOpen && "rotate-180",
              )}
              aria-hidden
            />
            {outputOpen
              ? t("experiments.runs.hideOutput")
              : t("experiments.runs.showOutput")}
          </button>
          {outputOpen ? (
            <div className="relative mt-1.5">
              <pre
                className={cn(
                  "max-h-64 overflow-auto rounded-sm border border-border bg-background",
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
                className="absolute top-1.5 right-1.5 rounded bg-background p-0.5 text-muted-foreground/55 hover:bg-accent hover:text-foreground"
              >
                <CopyIcon className="size-3" aria-hidden />
              </CopyFeedbackButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasArtifacts ? (
        <RunMetaRow label={t("experiments.artifacts")}>
          <div>
            {workingCopyNewer ? (
              <p className="mb-1 text-[length:var(--font-size-11)] text-warning">
                {t("experiments.runs.workingCopyNewer")}
              </p>
            ) : null}
            <div className="flex flex-col">
              {visibleArtifacts.map((artifact) => (
                <ArtifactChip
                  key={artifact}
                  path={artifact}
                  workspacePath={workspacePath}
                  onInspect={onInspectArtifact}
                />
              ))}
            </div>
            {showArtifactFold ? (
              <button
                type="button"
                onClick={() => setArtifactsExpanded((v) => !v)}
                aria-expanded={artifactsExpanded}
                className="mt-1 inline-flex h-6 items-center gap-1 text-[length:var(--font-size-11)] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3 shrink-0 transition-transform",
                    artifactsExpanded && "rotate-180",
                  )}
                  aria-hidden
                />
                {artifactsExpanded
                  ? t("experiments.runs.showLess")
                  : t("experiments.runs.moreArtifactsShort", { count: hiddenArtifactCount })}
              </button>
            ) : null}
            {onOpenResults ? (
              <button
                type="button"
                onClick={() => onOpenResults(run.runId)}
                className="mt-1.5 inline-flex h-6 items-center gap-1 text-[length:var(--font-size-11)] text-muted-foreground transition-colors hover:text-foreground"
              >
                <SquareArrowOutUpRightIcon className="size-3 shrink-0" aria-hidden />
                {t("experiments.runs.openInResults")}
              </button>
            ) : null}
            {snapshotImages.length > 0 && (run.artifactSnapshots?.length ?? 0) > 0 ? (
              <div className="mt-2 space-y-2">
                <div className="text-[length:var(--font-size-11)] text-muted-foreground">
                  {t("experiments.runs.runSnapshot")}
                </div>
                {snapshotImages.slice(0, 3).map((rel) => (
                  <ChatProjectImage
                    key={rel}
                    src={rel}
                    alt={rel.split("/").pop() || "snapshot"}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </RunMetaRow>
      ) : null}

      {run.logPath ? (
        <div className="pt-1">
          <Hint label={artifactFullPath(run.logPath, workspacePath)}>
            <button
              type="button"
              className="inline-flex h-6 items-center gap-1 text-[length:var(--font-size-11)] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => void openArtifactPathInFiles(run.logPath!, workspacePath)}
            >
              <FileTextIcon className="size-3 shrink-0" aria-hidden />
              {t("experiments.runs.openFullLog")}
            </button>
          </Hint>
        </div>
      ) : null}
    </div>
  );
}

export function ExperimentsRunsTable({
  runs,
  workspacePath,
  onOpenResults,
}: ExperimentsRunsTableProps) {
  const { t } = useTranslation();
  const experimentId = useExperimentStore((s) => s.selectedId);
  const query = useExperimentStore((s) => s.runsQuery);
  const checkedRunIds = useExperimentStore((s) => s.checkedRunIds);
  const setCheckedRunIds = useExperimentStore((s) => s.setCheckedRunIds);
  const toggleRunChecked = useExperimentStore((s) => s.toggleRunChecked);
  const clearCheckedRuns = useExperimentStore((s) => s.clearCheckedRuns);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ path: string } | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const ordered = useMemo(() => queryExperimentRuns(runs, query), [runs, query]);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedRunId(null);
    setFocusIndex(0);
    clearCheckedRuns();
  }, [runs.length, workspacePath, query.status, query.text, query.sort, query.kind, clearCheckedRuns]);

  useEffect(() => {
    if (!selectedRunId) return;
    if (!ordered.some((r) => r.runId === selectedRunId)) {
      setSelectedRunId(null);
    }
  }, [ordered, selectedRunId]);

  useEffect(() => {
    if (checkedRunIds.length === 0) return;
    const visible = new Set(ordered.map((r) => r.runId));
    const next = checkedRunIds.filter((id) => visible.has(id));
    if (next.length !== checkedRunIds.length) setCheckedRunIds(next);
  }, [ordered, checkedRunIds, setCheckedRunIds]);

  const safeFocus =
    ordered.length === 0 ? -1 : Math.min(focusIndex, ordered.length - 1);

  const allVisibleChecked =
    ordered.length > 0 && ordered.every((r) => checkedRunIds.includes(r.runId));
  const someVisibleChecked = ordered.some((r) => checkedRunIds.includes(r.runId));

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = someVisibleChecked && !allVisibleChecked;
    }
  }, [someVisibleChecked, allVisibleChecked]);

  const toggleAllVisible = (checked: boolean) => {
    if (checked) {
      setCheckedRunIds([...new Set([...checkedRunIds, ...ordered.map((r) => r.runId)])]);
    } else {
      const drop = new Set(ordered.map((r) => r.runId));
      setCheckedRunIds(checkedRunIds.filter((id) => !drop.has(id)));
    }
  };

  const selectAt = (index: number) => {
    const run = ordered[index];
    if (!run) return;
    setFocusIndex(index);
    setSelectedRunId((prev) => (prev === run.runId ? null : run.runId));
  };

  const handleListKeyDown = (e: KeyboardEvent) => {
    if (ordered.length === 0) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "BUTTON" ||
        target.closest("[data-slot=select-trigger]"))
    ) {
      return;
    }

    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      const next = stepFocusIndex(safeFocus < 0 ? 0 : safeFocus, 1, ordered.length);
      selectAt(next);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      const next = stepFocusIndex(safeFocus < 0 ? 0 : safeFocus, -1, ordered.length);
      selectAt(next);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (safeFocus >= 0) selectAt(safeFocus);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSelectedRunId(null);
      clearCheckedRuns();
    } else if (e.key === "Home") {
      e.preventDefault();
      selectAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      selectAt(ordered.length - 1);
    }
  };

  if (runs.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className={SETTINGS_ROW_DESC}>{t("experiments.runs.noRunsYet")}</p>
        <p className="mt-1 text-[length:var(--font-size-11)] text-muted-foreground/50">
          {t("experiments.runs.enterCommandHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      {ordered.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className={SETTINGS_ROW_DESC}>{t("experiments.runs.noMatch")}</p>
        </div>
      ) : (
        <div
          className="min-w-0 outline-none"
          tabIndex={0}
          role="listbox"
          aria-label={t("experiments.runs.historyAria")}
          aria-activedescendant={
            selectedRunId ? `run-row-${selectedRunId}` : undefined
          }
          onKeyDown={handleListKeyDown}
        >
          <div
            className={cn(
              HISTORY_GRID_CLASS,
              experimentsRunsListHeaderShellClass,
              "items-center",
            )}
            role="row"
          >
            <span aria-hidden />
            <span className={experimentsRunsListHeaderLabelClass} role="columnheader">
              {t("experiments.runs.listRun")}
            </span>
            <span className={experimentsRunsListHeaderLabelClass} role="columnheader">
              {t("experiments.type")}
            </span>
            <span className={experimentsRunsListHeaderLabelClass} role="columnheader">
              {t("experiments.runs.listStatus")}
            </span>
            <span
              className={cn(experimentsRunsListHeaderLabelClass, "text-right")}
              role="columnheader"
            >
              {t("experiments.runs.listDuration")}
            </span>
            <span
              className={cn(experimentsRunsListHeaderLabelClass, "text-right")}
              role="columnheader"
            >
              {t("experiments.time")}
            </span>
            <span className="flex items-center justify-center">
              <input
                ref={headerCheckRef}
                type="checkbox"
                checked={allVisibleChecked}
                onChange={(e) => toggleAllVisible(e.target.checked)}
                className="size-3 shrink-0 cursor-pointer rounded-sm accent-primary"
                aria-label={t("experiments.runs.selectAllAria")}
                title={t("experiments.runs.selectAllAria")}
              />
            </span>
          </div>

          <div className="flex flex-col">
            {ordered.map((run, index) => {
              const expanded = selectedRunId === run.runId;
              return (
                <div
                  key={run.runId}
                  className="flex flex-col"
                  data-run-row={run.runId}
                >
                  <RunRow
                    run={run}
                    workspacePath={workspacePath}
                    experimentId={experimentId ?? undefined}
                    selected={expanded}
                    focused={index === safeFocus}
                    checked={checkedRunIds.includes(run.runId)}
                    onSelect={() => selectAt(index)}
                    onFocus={() => setFocusIndex(index)}
                    onCheckedChange={(c) => {
                      const has = checkedRunIds.includes(run.runId);
                      if (c !== has) toggleRunChecked(run.runId);
                    }}
                  />
                  {expanded ? (
                    <RunDetailPanel
                      run={run}
                      workspacePath={workspacePath}
                      experimentId={experimentId}
                      onInspectArtifact={(p) => setInspect({ path: p })}
                      onOpenResults={onOpenResults}
                    />
                  ) : null}
                </div>
              );
            })}
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
