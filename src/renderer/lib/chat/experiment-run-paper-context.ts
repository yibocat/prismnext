/**
 * Experiment run → paper writing context (Phase 4 reverse-link).
 *
 * Turns a structured run into agent-facing Methods / figure scaffolding when
 * the user clicks "Use in paper" from Experiments. Complementary to literature
 * citation staging (paper → [n]) — this path starts from an empirical run.
 */
import type { ComposerPart } from "@/lib/chat/composer-parts";
import {
  artifactFullPath,
  resolveImageArtifactPaths,
} from "@/modes/experiments-mode/experiments-artifact-nav";

export type ExperimentRunCiteIntent = "discuss" | "cite-in-paper";

export type ExperimentRunPaperFields = {
  runId: string;
  label?: string;
  experimentId?: string;
  command: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  artifactPath?: string;
  linkMethod?: string;
  artifacts?: string[];
  artifactSnapshots?: string[];
  env?: {
    python?: string | null;
    pythonVersion?: string | null;
    platform?: string;
    gitCommit?: string | null;
  } | null;
  chatSessionId?: string | null;
  workspacePath?: string;
  kind?: string;
  notes?: string;
  logPath?: string | null;
  intent?: ExperimentRunCiteIntent;
};

/** Project-relative path for a lab-relative artifact. */
export function experimentArtifactProjectPath(
  workspacePath: string | undefined,
  artifactRel: string,
): string {
  return artifactFullPath(artifactRel, workspacePath);
}

/** Image artifacts as project-relative paths suitable for markdown / `\includegraphics`. */
export function experimentRunFigurePaths(fields: ExperimentRunPaperFields): string[] {
  // Paper cites working copies (e.g. manuscript/…), not frozen registry snapshots.
  return resolveImageArtifactPaths(fields.artifacts ?? [], fields.workspacePath);
}

/**
 * Flatten a run into the multi-line block injected into the agent prompt.
 * When `intent === "cite-in-paper"`, append Methods / figure writing instructions.
 */
export function formatExperimentRunAgentContext(fields: ExperimentRunPaperFields): string {
  const label = fields.label ?? `run:${fields.runId}`;
  const lines = [
    `[experiment-run: ${label}]`,
    `command: \`${fields.command}\``,
    `exit: ${fields.exitCode}`,
    `runId: ${fields.runId}`,
  ];
  if (fields.experimentId) lines.push(`experiment: ${fields.experimentId}`);
  if (fields.kind) lines.push(`kind: ${fields.kind}`);
  if (fields.workspacePath) lines.push(`lab: ${fields.workspacePath}`);
  if (fields.artifactPath) {
    const proj = experimentArtifactProjectPath(fields.workspacePath, fields.artifactPath);
    lines.push(
      `artifact: ${proj}${fields.linkMethod ? ` (${fields.linkMethod})` : ""}`,
    );
  }
  const arts = fields.artifacts ?? [];
  if (arts.length > 0) {
    const projArts = arts.map((a) => experimentArtifactProjectPath(fields.workspacePath, a));
    lines.push(`artifacts: ${projArts.join(", ")}`);
  }
  if (fields.artifactSnapshots?.length) {
    lines.push(`artifactSnapshots: ${fields.artifactSnapshots.join(", ")}`);
    lines.push(
      "(When showing what THIS run produced, prefer artifactSnapshots — artifacts are mutable working paths.)",
    );
  }
  if (fields.logPath) {
    lines.push(
      `fullLog: ${experimentArtifactProjectPath(fields.workspacePath, fields.logPath)}`,
    );
  }
  if (fields.notes?.trim()) lines.push(`notes: ${fields.notes.trim()}`);
  if (fields.chatSessionId) lines.push(`chatSession: ${fields.chatSessionId}`);
  const env = fields.env;
  if (env) {
    const bits = [
      env.pythonVersion ? `py ${env.pythonVersion}` : env.python ? "python" : null,
      env.platform,
      env.gitCommit ? `git ${env.gitCommit}` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`env: ${bits.join(" · ")}`);
  }

  if (fields.intent === "cite-in-paper") {
    lines.push("");
    lines.push("## Paper reverse-link (user asked: use this run in the manuscript)");
    lines.push(
      "Draft a Methods sentence that cites the real command / env above (do not invent tooling).",
    );
    lines.push(
      "If figures are listed, propose `\includegraphics` or markdown embeds using those project-relative paths next to the claim they support — do not invent paths. Copying files into the manuscript folder is optional and only when the user asks or the draft requires it.",
    );
    const figs = experimentRunFigurePaths(fields);
    if (figs.length) {
      lines.push("Suggested figure embeds:");
      for (const p of figs) {
        const name = p.split("/").pop() || p;
        lines.push(`![${name}](${p})`);
      }
    }
    if (fields.logPath) {
      lines.push(
        "Full stdout/stderr may be at fullLog — use it only if the JSONL tail is insufficient.",
      );
    }
  }

  return lines.join("\n");
}

/** Fields from a composer experiment-run part. */
export function experimentRunFieldsFromPart(
  part: Extract<ComposerPart, { type: "experiment-run" }>,
): ExperimentRunPaperFields {
  return {
    runId: part.runId,
    label: part.label,
    experimentId: part.experimentId,
    command: part.command,
    exitCode: part.exitCode,
    startedAt: part.startedAt,
    finishedAt: part.finishedAt,
    artifactPath: part.artifactPath,
    linkMethod: part.linkMethod,
    artifacts: part.artifacts,
    artifactSnapshots: part.artifactSnapshots,
    env: part.env,
    chatSessionId: part.chatSessionId,
    workspacePath: part.workspacePath,
    kind: part.kind,
    notes: part.notes,
    logPath: part.logPath,
    intent: part.intent,
  };
}
