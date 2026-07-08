import { memo, useState } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { FlaskConicalIcon } from "lucide-react";
import { ToolCard, param } from "./shared";

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
        {typeof data.hint === "string" ? ` — ${data.hint}` : ""}
      </p>
    );
  }
  if (data.ok === false) {
    return (
      <p className="text-[length:var(--font-chat-meta)] text-destructive">
        {typeof data.error === "string" ? data.error : "Experiment operation failed"}
        {typeof data.hint === "string" ? ` — ${data.hint}` : ""}
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
          {param("experiment root", String(data.experimentRoot ?? ""))}
          {param("experiments", String(experiments.length))}
        </div>
      );
    }
    if (action === "create") {
      const meta = data.meta as Record<string, unknown> | undefined;
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          {param("id", String(data.id ?? meta?.id ?? ""))}
          {param("path", String(data.path ?? ""))}
          {param("title", String(meta?.title ?? ""))}
        </div>
      );
    }
    if (action === "read") {
      const meta = data.meta as Record<string, unknown> | undefined;
      const runs = Array.isArray(data.runs) ? data.runs : [];
      const lastRun = runs[runs.length - 1] as Record<string, unknown> | undefined;
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          {param("title", String(meta?.title ?? data.id ?? ""))}
          {param("runs", String(runs.length))}
          {lastRun ? param("last exit", String(lastRun.exitCode ?? "")) : null}
        </div>
      );
    }
    if (action === "append_run") {
      const run = data.run as Record<string, unknown> | undefined;
      return (
        <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
          {param("run id", String(run?.runId ?? ""))}
          {param("exit", String(run?.exitCode ?? ""))}
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
          {param("workspace", String(data.workspacePath ?? data.experimentPath ?? ""))}
          {param("env", bits.join(" · ") || "none")}
        </div>
      );
    }
    return null;
  }

  // experiment-run
  const run = data.run as Record<string, unknown> | undefined;
  const exitLabel =
    typeof data.exitCode === "number"
      ? String(data.exitCode)
      : run?.exitCode != null
        ? String(run.exitCode)
        : "";
  const artifacts = asStringArray(run?.artifacts ?? data.artifacts);
  return (
    <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
      {run ? param("run id", String(run.runId ?? "")) : null}
      {param("exit", exitLabel)}
      {artifacts.length ? param("artifacts", artifacts.join(", ")) : null}
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

  return (
    <ToolCard
      toolName={toolName}
      icon={<FlaskConicalIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{label}</span>}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={isError}
      hasContent={!!data}
    >
      {() => (data ? <ExperimentSummary toolName={toolName} toolUse={toolUse} data={data} /> : null)}
    </ToolCard>
  );
});
