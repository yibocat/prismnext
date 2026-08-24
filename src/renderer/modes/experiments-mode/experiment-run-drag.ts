import type { ComposerDragPayload } from "@/lib/chat/composer-drag";
import type { ExperimentRunEntry } from "../../../shared/experiments/log";

export function experimentRunDragPayload(
  run: ExperimentRunEntry,
  opts?: { workspacePath?: string; experimentId?: string },
): ComposerDragPayload {
  return {
    v: 1,
    kind: "experiment-run",
    runId: run.runId,
    experimentId: opts?.experimentId,
    command: run.command,
    exitCode: run.exitCode,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    artifacts: run.artifacts ?? [],
    artifactSnapshots: run.artifactSnapshots,
    env: run.env,
    chatSessionId: run.chatSessionId ?? null,
    workspacePath: opts?.workspacePath,
    runKind: run.kind,
    notes: run.notes,
    logPath: run.logPath ?? null,
    intent: "discuss",
  };
}

export function experimentMentionDragPayload(
  experiment: { id: string; title: string },
): ComposerDragPayload {
  return {
    v: 1,
    kind: "experiment-mention",
    experimentId: experiment.id,
    label: experiment.title,
  };
}
