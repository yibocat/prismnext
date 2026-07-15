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
};

const ACTION_LABELS: Record<string, string> = {
  list: "list",
  create: "create",
  read: "read",
  append_run: "append run",
  detect_env: "detect env",
  open: "open",
  run: "run",
};

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

  if (toolName === "experiment-log") {
    if (action === "list") {
      const experiments = Array.isArray(data.experiments) ? data.experiments : [];
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <Field label="experiment root" value={String(data.experimentRoot ?? "")} />
          <Field label="experiments" value={String(experiments.length)} />
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
      const lastRun = runs[runs.length - 1] as Record<string, unknown> | undefined;
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <Field label="title" value={String(meta?.title ?? data.id ?? "")} />
          <Field label="runs" value={String(runs.length)} />
          {lastRun ? <Field label="last exit" value={String(lastRun.exitCode ?? "")} /> : null}
        </div>
      );
    }
    if (action === "append_run") {
      const run = data.run as Record<string, unknown> | undefined;
      const artifacts = asStringArray(run?.artifacts);
      const cwd = typeof run?.cwd === "string" ? run.cwd : undefined;
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <Field label="run id" value={String(run?.runId ?? "")} />
          <Field label="exit" value={String(run?.exitCode ?? "")} />
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

  const run = data.run as Record<string, unknown> | undefined;
  const exitLabel =
    typeof data.exitCode === "number"
      ? String(data.exitCode)
      : run?.exitCode != null
        ? String(run.exitCode)
        : "";
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

  return (
    <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
      {run ? <Field label="run id" value={String(run.runId ?? "")} /> : null}
      <Field label="exit" value={exitLabel} />
      {mergedArtifacts.length ? (
        <Field label="artifacts" value={mergedArtifacts.join(", ")} />
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
