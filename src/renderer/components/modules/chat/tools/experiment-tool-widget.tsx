import { memo, useEffect, useState, type ReactNode } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { ExternalLinkIcon, FlaskConicalIcon } from "lucide-react";
import { ToolCard, Field, TOOL_INLINE_ROW_CLASS, StatusIcon } from "./shared";
import { ChatArtifactGallery } from "@/lib/markdown/chat-artifact-block";
import { pathsForRunChatDisplay } from "@/lib/chat/experiment-run-figures";
import {
  openExperimentInPanel,
  resolveExperimentIdFromTool,
} from "@/modes/experiments-mode/open-experiment";
import { Hint } from "@/components/ui/hint";
import { useExperimentStore } from "@/stores/experiment-store";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  "experiment-log": "Experiment",
  "experiment-run": "Run experiment",
  "results-snapshot": "Results snapshot",
};

const ACTION_LABELS: Record<string, string> = {
  list: "list",
  create: "create",
  read: "read",
  append_run: "record run",
  detect_env: "detect env",
  open: "open",
  run: "run",
  snapshot: "snapshot",
};

function exitToneClass(exit: unknown): string {
  if (typeof exit !== "number") return "text-muted-foreground";
  return exit === 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-destructive";
}

function formatDurationMs(startedAt: unknown, finishedAt: unknown): string | null {
  if (typeof startedAt !== "string" || typeof finishedAt !== "string") return null;
  const a = Date.parse(startedAt);
  const b = Date.parse(finishedAt);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function lastStdoutLines(tail: unknown, n = 20): string {
  if (typeof tail !== "string" || !tail.trim()) return "";
  const lines = tail.replace(/\r\n/g, "\n").split("\n");
  return lines.slice(-n).join("\n");
}

function parseToolJson(content: unknown): Record<string, unknown> | null {
  if (content == null) return null;
  if (typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (typeof parsed === "string") {
      try {
        const inner = JSON.parse(parsed) as unknown;
        if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
          return inner as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function unwrapPayload(content: unknown): Record<string, unknown> | null {
  const outer = parseToolJson(content);
  if (!outer) return null;
  if (typeof outer.output === "string") {
    return parseToolJson(outer.output) ?? outer;
  }
  return outer;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function isCancelledRunPayload(data: Record<string, unknown>): boolean {
  if (data.error === "experiment_run_aborted") return true;
  const run = data.run as Record<string, unknown> | undefined;
  if (run?.cancelled === true) return true;
  if (typeof run?.notes === "string" && run.notes.includes("Cancelled by user")) {
    return true;
  }
  return false;
}

/** One-line command for chat — long `-c` scripts stay readable. */
function shortCommand(cmd: string, max = 88): string {
  const one = cmd.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

function runStatusLabel(opts: {
  cancelled: boolean;
  exitRaw: number | null;
}): { text: string; className: string } {
  if (opts.cancelled) {
    return { text: "Cancelled", className: "text-warning" };
  }
  if (opts.exitRaw === 0) {
    return { text: "Succeeded", className: "text-success" };
  }
  if (opts.exitRaw != null) {
    return { text: `Failed · exit ${opts.exitRaw}`, className: "text-destructive" };
  }
  return { text: "Finished", className: "text-muted-foreground" };
}

function OutputTail({ text, emptyHint }: { text: string; emptyHint?: string }) {
  if (!text.trim()) {
    return emptyHint ? (
      <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">{emptyHint}</p>
    ) : null;
  }
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted px-2.5 py-2 font-mono text-[length:var(--font-size-11)] leading-relaxed text-foreground/85">
      {text}
    </pre>
  );
}

function ExperimentRunFinishedBody({
  toolUse,
  data,
  suppressArtifactPaths,
}: {
  toolUse: ContentBlock;
  data: Record<string, unknown>;
  suppressArtifactPaths?: readonly string[];
}) {
  const [showDetails, setShowDetails] = useState(false);
  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  const run = data.run as Record<string, unknown> | undefined;
  const cancelled = isCancelledRunPayload(data);
  const exitRaw =
    typeof data.exitCode === "number"
      ? data.exitCode
      : typeof run?.exitCode === "number"
        ? run.exitCode
        : null;
  const artifacts = asStringArray(run?.artifacts ?? data.artifacts);
  const artifactSnapshots = asStringArray(run?.artifactSnapshots ?? data.artifactSnapshots);
  const cwd = typeof run?.cwd === "string" ? run.cwd : undefined;
  const workspaceHint =
    cwd ||
    (typeof data.workspacePath === "string" ? data.workspacePath : undefined) ||
    (typeof input.id === "string" && typeof data.experimentRoot === "string"
      ? `${data.experimentRoot}/${input.id}`
      : undefined);
  const inputArtifacts = asStringArray(input.artifacts);
  const mergedArtifacts = artifacts.length ? artifacts : inputArtifacts;
  const command =
    (typeof run?.command === "string" && run.command) ||
    (typeof input.command === "string" ? input.command : "");
  const kind =
    (typeof run?.kind === "string" && run.kind) ||
    (typeof input.kind === "string" ? input.kind : "");
  const duration = formatDurationMs(run?.startedAt, run?.finishedAt);
  const stdoutPreview = lastStdoutLines(run?.stdoutTail ?? data.stdoutTail, 24);
  const status = runStatusLabel({ cancelled, exitRaw });
  const runId = typeof run?.runId === "string" ? run.runId : "";
  const logPath = typeof run?.logPath === "string" ? run.logPath : "";

  const metaBits = [duration, kind || null].filter(Boolean);

  return (
    <div className="space-y-2 text-[length:var(--font-chat-meta)]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={status.className}>{status.text}</span>
        {metaBits.length > 0 ? (
          <span className="text-muted-foreground">{metaBits.join(" · ")}</span>
        ) : null}
      </div>

      {cancelled ? (
        <p className="text-muted-foreground">
          Chat stopped waiting; a run record was still written when the process stopped.
        </p>
      ) : null}

      {command ? (
        <p
          className="truncate font-mono text-[length:var(--font-size-11)] text-foreground/80"
          title={command}
        >
          {shortCommand(command)}
        </p>
      ) : null}

      <OutputTail text={stdoutPreview} />

      {mergedArtifacts.length > 0 ? (
        <ChatArtifactGallery
          paths={pathsForRunChatDisplay({
            artifacts: mergedArtifacts,
            artifactSnapshots,
            workspacePath: workspaceHint,
          })}
          suppressPaths={suppressArtifactPaths}
        />
      ) : null}

      {(runId || cwd || logPath || exitRaw != null) && (
        <div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetails((v) => !v);
            }}
          >
            {showDetails ? "Hide details" : "Details"}
          </button>
          {showDetails ? (
            <div className="mt-1.5 space-y-0.5 text-muted-foreground">
              {exitRaw != null ? <Field label="exit" value={String(exitRaw)} /> : null}
              {runId ? <Field label="run id" value={runId} /> : null}
              {cwd ? <Field label="cwd" value={cwd} /> : null}
              {logPath ? <Field label="log" value={logPath} /> : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ExperimentSummary({
  toolName,
  toolUse,
  data,
  suppressArtifactPaths,
}: {
  toolName: string;
  toolUse: ContentBlock;
  data: Record<string, unknown>;
  suppressArtifactPaths?: readonly string[];
}) {
  if (data.error && typeof data.error === "string") {
    const aborted = data.error === "experiment_run_aborted";
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)]">
        <p className="text-destructive">
          {aborted
            ? "Session cancelled while the experiment was running"
            : data.error}
        </p>
        {aborted ? (
          <p className="text-muted-foreground">
            Cancel stops waiting in Chat; the process may still finish and append a run
            record. Open the experiment detail to confirm.
          </p>
        ) : typeof data.hint === "string" ? (
          <p className="text-muted-foreground">{data.hint}</p>
        ) : null}
      </div>
    );
  }
  if (data.ok === false) {
    return (
      <p className="text-[length:var(--font-chat-meta)] text-destructive">
        {typeof data.error === "string" ? data.error : "Experiment operation failed"}
        {typeof data.hint === "string" ? ` - ${data.hint}` : ""}
      </p>
    );
  }

  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  const action = typeof input.action === "string" ? input.action : "";

  if (toolName === "results-snapshot") {
    const figures = Array.isArray(data.figures) ? data.figures : [];
    const tables = Array.isArray(data.tables) ? data.tables : [];
    const metrics = Array.isArray(data.metrics) ? data.metrics : [];
    const unparsed = asStringArray(data.unparsed);
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
        <Field label="workspace" value={String(data.workspacePath ?? "")} />
        <Field
          label="found"
          value={`${figures.length} figures · ${tables.length} tables · ${metrics.length} metrics`}
        />
        {unparsed.length ? <Field label="unparsed" value={String(unparsed.length)} /> : null}
        {typeof data.textSummary === "string" && data.textSummary.trim() ? (
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-[length:var(--font-size-11)]">
            {data.textSummary}
          </pre>
        ) : null}
      </div>
    );
  }

  if (toolName === "experiment-log") {
    if (action === "list") {
      const experiments = Array.isArray(data.experiments) ? data.experiments : [];
      const preview = experiments.slice(0, 5) as Array<Record<string, unknown>>;
      const more = experiments.length - preview.length;
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <Field label="experiments root" value={String(data.experimentRoot ?? "")} />
          <Field label="experiments" value={String(experiments.length)} />
          {preview.length > 0 ? (
            <ul className="mt-1 space-y-0.5 pl-0.5">
              {preview.map((exp) => (
                <li key={String(exp.id)} className="truncate">
                  <span className="text-foreground/85">{String(exp.title ?? exp.id)}</span>
                  {exp.runCount != null ? (
                    <span className="text-muted-foreground/70"> · {String(exp.runCount)} runs</span>
                  ) : null}
                  {exp.status === "archived" ? (
                    <span className="text-muted-foreground/60"> · archived</span>
                  ) : null}
                </li>
              ))}
              {more > 0 ? (
                <li className="text-muted-foreground/60">+{more} more</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      );
    }
    if (action === "create") {
      const meta = data.meta as Record<string, unknown> | undefined;
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <Field label="id" value={String(data.id ?? meta?.id ?? "")} />
          <Field label="path" value={String(data.path ?? "")} />
          <Field label="title" value={String(meta?.title ?? "")} />
        </div>
      );
    }
    if (action === "read") {
      const meta = data.meta as Record<string, unknown> | undefined;
      const runs = Array.isArray(data.runs) ? data.runs : [];
      const recent = runs.slice(-3).reverse() as Array<Record<string, unknown>>;
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <Field label="title" value={String(meta?.title ?? data.id ?? "")} />
          <Field
            label="run records"
            value={String(data.runCount ?? runs.length)}
          />
          {recent.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {recent.map((r) => (
                <li key={String(r.runId)} className="flex min-w-0 items-baseline gap-1.5">
                  <span className={exitToneClass(r.exitCode)}>
                    exit {String(r.exitCode ?? "?")}
                  </span>
                  {typeof r.kind === "string" ? (
                    <span className="shrink-0 text-muted-foreground/60">{r.kind}</span>
                  ) : null}
                  <span className="min-w-0 truncate font-mono text-[length:var(--font-size-11)] text-foreground/80">
                    {String(r.command ?? "")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }
    if (action === "append_run") {
      const run = data.run as Record<string, unknown> | undefined;
      const artifacts = asStringArray(run?.artifacts);
      const artifactSnapshots = asStringArray(run?.artifactSnapshots);
      const cwd = typeof run?.cwd === "string" ? run.cwd : undefined;
      const duration = formatDurationMs(run?.startedAt, run?.finishedAt);
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <Field label="run id" value={String(run?.runId ?? "")} />
          {typeof run?.command === "string" ? (
            <Field label="command" value={run.command} />
          ) : null}
          <Field label="exit" value={String(run?.exitCode ?? "")} />
          {typeof run?.kind === "string" ? <Field label="kind" value={run.kind} /> : null}
          {duration ? <Field label="duration" value={duration} /> : null}
          {artifacts.length ? <Field label="artifacts" value={artifacts.join(", ")} /> : null}
          <ChatArtifactGallery
            paths={pathsForRunChatDisplay({
              artifacts,
              artifactSnapshots,
              workspacePath: cwd,
            })}
            suppressPaths={suppressArtifactPaths}
          />
        </div>
      );
    }
    if (action === "detect_env") {
      const env = (data.env ?? {}) as Record<string, unknown>;
      const bits: string[] = [];
      if (env.pythonVersion) bits.push(`py ${env.pythonVersion}`);
      if (env.rVersion) bits.push(`R ${env.rVersion}`);
      if (env.gitCommit) bits.push(`git ${env.gitCommit}`);
      if (env.venvPath) bits.push("venv");
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <Field label="workspace" value={String(data.workspacePath ?? data.experimentPath ?? "")} />
          <Field label="env" value={bits.join(" · ") || "none"} />
        </div>
      );
    }
    if (action === "open") {
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <Field label="id" value={String(data.id ?? "")} />
          <Field label="title" value={String(data.title ?? "")} />
          <Field label="focused" value={String(data.focused ?? true)} />
        </div>
      );
    }
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
        <Field label="ok" value={String(data.ok ?? "")} />
        <Field label="id" value={String(data.id ?? "")} />
        {typeof data.error === "string" ? <Field label="error" value={data.error} /> : null}
      </div>
    );
  }

  // experiment-run (default) — narrative run card (not a raw field dump)
  return (
    <ExperimentRunFinishedBody
      toolUse={toolUse}
      data={data}
      suppressArtifactPaths={suppressArtifactPaths}
    />
  );
}

function ExperimentRunLiveBody({
  command,
  liveOutput,
}: {
  command: string;
  liveOutput: string;
}) {
  const tail = lastStdoutLines(liveOutput, 30);
  return (
    <div className="space-y-2 text-[length:var(--font-chat-meta)]">
      <p className="text-muted-foreground">Streaming output…</p>
      {command ? (
        <p
          className="truncate font-mono text-[length:var(--font-size-11)] text-foreground/80"
          title={command}
        >
          {shortCommand(command)}
        </p>
      ) : null}
      <OutputTail text={tail} emptyHint="Waiting for the first lines…" />
    </div>
  );
}

export const ExperimentToolWidget = memo(function ExperimentToolWidget({
  toolUse,
  toolResult,
  toolName,
  suppressArtifactPaths,
  hostedInComposer = false,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
  suppressArtifactPaths?: readonly string[];
  hostedInComposer?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const resultContent = toolResult?.content ?? toolUse.content;
  const data = unwrapPayload(resultContent);
  const isLoading = !toolResult;
  const isError = !!data?.error || data?.ok === false;

  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  const action = typeof input.action === "string" ? input.action : "run";
  const inputCommand = typeof input.command === "string" ? input.command : "";
  const finishedRun = data?.run as Record<string, unknown> | undefined;
  const finishedCommand =
    (typeof finishedRun?.command === "string" && finishedRun.command) || inputCommand;
  const finishedDuration = formatDurationMs(finishedRun?.startedAt, finishedRun?.finishedAt);
  const finishedExit =
    typeof data?.exitCode === "number"
      ? data.exitCode
      : typeof finishedRun?.exitCode === "number"
        ? finishedRun.exitCode
        : null;
  const finishedCancelled = data ? isCancelledRunPayload(data) : false;

  const label =
    toolName === "experiment-run"
      ? (
          <span className="truncate font-medium" title={finishedCommand || undefined}>
            {finishedCommand
              ? shortCommand(finishedCommand, 64)
              : LABELS["experiment-run"]}
          </span>
        )
      : toolName === "results-snapshot"
        ? <span className="truncate font-medium">{LABELS["results-snapshot"]}</span>
        : (
            <span className="truncate font-medium">
              {`${LABELS["experiment-log"] ?? toolName} · ${ACTION_LABELS[action] ?? action}`}
            </span>
          );

  const rawFallback =
    !data && resultContent
      ? typeof resultContent === "string"
        ? resultContent
        : (() => {
            try {
              return JSON.stringify(resultContent, null, 2);
            } catch {
              return String(resultContent);
            }
          })()
      : "";

  const experimentId = resolveExperimentIdFromTool(input, data);
  const runInFlight = useExperimentStore((s) => s.runInFlight);
  const liveForThis =
    isLoading &&
    toolName === "experiment-run" &&
    experimentId &&
    runInFlight &&
    runInFlight.id === experimentId
      ? runInFlight
      : null;

  useEffect(() => {
    if (liveForThis) setExpanded(true);
  }, [liveForThis?.runId]);

  if (
    hostedInComposer
    && toolName === "experiment-run"
    && (liveForThis || isLoading)
  ) {
    return (
      <div className={cn(TOOL_INLINE_ROW_CLASS, "py-1 text-[length:var(--font-chat-message)]")}>
        <StatusIcon isLoading={!!liveForThis || isLoading} isError={!!isError} />
        <span className="shrink-0 text-muted-foreground/55">{toolName}</span>
        <FlaskConicalIcon className="size-3.5 shrink-0 text-info" />
        <span className="min-w-0 truncate text-muted-foreground/70">
          {shortCommand(liveForThis?.command || inputCommand || LABELS["experiment-run"], 72)}
        </span>
      </div>
    );
  }

  const canOpenInExperiments = Boolean(experimentId) && !isError;
  const openHint = liveForThis ? "Open live output in Experiments" : "Open in Experiments";

  let headerMeta: ReactNode = null;
  if (liveForThis) {
    headerMeta = (
      <span className="shrink-0 text-[length:var(--font-chat-meta)] text-muted-foreground">
        Running
      </span>
    );
  } else if (toolName === "experiment-run" && data && !isLoading) {
    const status = runStatusLabel({
      cancelled: finishedCancelled,
      exitRaw: finishedExit,
    });
    headerMeta = (
      <span className={cn("shrink-0 text-[length:var(--font-chat-meta)]", status.className)}>
        {status.text}
        {finishedDuration ? (
          <span className="text-muted-foreground"> · {finishedDuration}</span>
        ) : null}
      </span>
    );
  }

  return (
    <ToolCard
      toolName={toolName}
      icon={<FlaskConicalIcon className="size-3.5 text-info" />}
      label={label}
      meta={headerMeta}
      headerEnd={
        canOpenInExperiments ? (
          <Hint label={openHint}>
            <button
              type="button"
              className="inline-flex items-center gap-1 shrink-0 text-[length:var(--font-chat-meta)] text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                void openExperimentInPanel(experimentId!);
              }}
            >
              <ExternalLinkIcon className="size-3" />
              {liveForThis ? "Live" : "Open"}
            </button>
          </Hint>
        ) : null
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={isError}
      hasContent={!!data || !!rawFallback || !!liveForThis}
    >
      {() =>
        liveForThis ? (
          <ExperimentRunLiveBody
            command={
              liveForThis.command || inputCommand
            }
            liveOutput={liveForThis.liveOutput}
          />
        ) : data ? (
          <ExperimentSummary
            toolName={toolName}
            toolUse={toolUse}
            data={data}
            suppressArtifactPaths={suppressArtifactPaths}
          />
        ) : rawFallback ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-[length:var(--font-size-12)] text-muted-foreground">
            {rawFallback}
          </pre>
        ) : null
      }
    </ToolCard>
  );
});
