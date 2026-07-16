import { memo, useState } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { ExternalLinkIcon, FlaskConicalIcon } from "lucide-react";
import { ToolCard, Field } from "./shared";
import { ChatProjectImage } from "@/lib/markdown/extract-markdown-images";
import { resolveImageArtifactPaths } from "@/modes/experiments-mode/experiments-artifact-nav";
import {
  openExperimentInPanel,
  resolveExperimentIdFromTool,
} from "@/modes/experiments-mode/open-experiment";

const LABELS: Record<string, string> = {
  "experiment-log": "Experiment log",
  "experiment-run": "Experiment run",
  "results-snapshot": "Results snapshot",
};

const ACTION_LABELS: Record<string, string> = {
  list: "list",
  create: "create",
  read: "read",
  append_run: "append run",
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

function ArtifactImageGallery({
  artifacts,
  workspacePath,
}: {
  artifacts: string[];
  workspacePath?: string;
}) {
  const images = resolveImageArtifactPaths(artifacts, workspacePath);
  if (!images.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {images.map((rel) => (
        <div key={rel} className="overflow-hidden rounded-md border border-border/50 bg-muted/20">
          <ChatProjectImage src={rel} alt={rel.split("/").pop() || "artifact"} />
          <p className="truncate px-2 pb-1.5 text-[length:var(--font-size-11)] text-muted-foreground">
            {rel}
          </p>
        </div>
      ))}
    </div>
  );
}

function ExperimentSummary({
  toolName,
  toolUse,
  data,
}: {
  toolName: string;
  toolUse: ContentBlock;
  data: Record<string, unknown>;
}) {
  if (data.error && typeof data.error === "string") {
    return (
      <p className="text-[length:var(--font-chat-meta)] text-destructive">
        {data.error}
        {typeof data.hint === "string" ? ` - ${data.hint}` : ""}
      </p>
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
        <Field label="lab" value={String(data.workspacePath ?? "")} />
        <Field
          label="found"
          value={`${figures.length} figures · ${tables.length} tables · ${metrics.length} metrics`}
        />
        {unparsed.length ? <Field label="unparsed" value={String(unparsed.length)} /> : null}
        {typeof data.textSummary === "string" && data.textSummary.trim() ? (
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-[length:var(--font-size-11)]">
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
          <Field label="experiment root" value={String(data.experimentRoot ?? "")} />
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
            label="runs"
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
          <ArtifactImageGallery artifacts={artifacts} workspacePath={cwd} />
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

  // experiment-run (default) — thick card
  const run = data.run as Record<string, unknown> | undefined;
  const exitRaw =
    typeof data.exitCode === "number"
      ? data.exitCode
      : typeof run?.exitCode === "number"
        ? run.exitCode
        : null;
  const exitLabel = exitRaw != null ? String(exitRaw) : "";
  const artifacts = asStringArray(run?.artifacts ?? data.artifacts);
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
  const stdoutPreview = lastStdoutLines(run?.stdoutTail ?? data.stdoutTail, 20);

  return (
    <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
      {command ? <Field label="command" value={command} /> : null}
      {cwd ? <Field label="cwd" value={cwd} /> : null}
      {run ? <Field label="run id" value={String(run.runId ?? "")} /> : null}
      {typeof run?.startedAt === "string" || typeof run?.finishedAt === "string" ? (
        <Field
          label="time"
          value={[
            typeof run?.startedAt === "string" ? run.startedAt : null,
            typeof run?.finishedAt === "string" ? run.finishedAt : null,
            duration,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      ) : null}
      <p className="flex gap-2">
        <span className="text-muted-foreground/70">exit</span>
        <span className={exitToneClass(exitRaw)}>{exitLabel || "—"}</span>
        {kind ? (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{kind}</span>
          </>
        ) : null}
      </p>
      {mergedArtifacts.length ? (
        <Field label="artifacts" value={mergedArtifacts.join(", ")} />
      ) : null}
      {typeof run?.logPath === "string" && run.logPath ? (
        <Field label="full log" value={run.logPath} />
      ) : null}
      {stdoutPreview ? (
        <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[length:var(--font-size-11)] text-foreground/80">
          {stdoutPreview}
        </pre>
      ) : null}
      <ArtifactImageGallery artifacts={mergedArtifacts} workspacePath={workspaceHint} />
    </div>
  );
}

export const ExperimentToolWidget = memo(function ExperimentToolWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const resultContent = toolResult?.content ?? toolUse.content;
  const data = unwrapPayload(resultContent);
  const isLoading = !toolResult;
  const isError = !!data?.error || data?.ok === false;

  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  const action = typeof input.action === "string" ? input.action : "run";
  const label =
    toolName === "experiment-run"
      ? LABELS["experiment-run"]
      : toolName === "results-snapshot"
        ? LABELS["results-snapshot"]
        : `${LABELS["experiment-log"] ?? toolName} · ${ACTION_LABELS[action] ?? action}`;

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
  const canOpenInExperiments = Boolean(experimentId) && !isLoading && !isError;

  return (
    <ToolCard
      toolName={toolName}
      icon={<FlaskConicalIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{label}</span>}
      headerEnd={
        canOpenInExperiments ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 shrink-0 text-[length:var(--font-chat-meta)] text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              void openExperimentInPanel(experimentId!);
            }}
            title="Open in Experiments"
          >
            <ExternalLinkIcon className="size-3" />
            Experiments
          </button>
        ) : null
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={isError}
      hasContent={!!data || !!rawFallback}
    >
      {() =>
        data ? (
          <ExperimentSummary toolName={toolName} toolUse={toolUse} data={data} />
        ) : rawFallback ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[length:var(--font-size-12)] text-muted-foreground">
            {rawFallback}
          </pre>
        ) : null
      }
    </ToolCard>
  );
});
