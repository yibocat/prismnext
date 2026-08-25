/**
 * Experiment runs.jsonl — append, notes, artifact inference.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { join, relative } from "node:path";
import { randomBytes } from "node:crypto";
import { appendJsonlLine } from "../lib/jsonl-append";
import { findProjectRelByBasename } from "../lib/find-project-file";
import {
  artifactBasename,
  isImageArtifactPath,
  normalizeArtifactSlash,
  normalizeRunArtifactPaths,
} from "../../shared/interaction/artifact-path";
import {
  EXPERIMENT_REGISTRY_REL,
  EXPERIMENT_RUNS_FILENAME,
  isSafeExperimentId,
  RUN_OUTPUT_TAIL_BYTES,
  stripAnsi,
  tailBytes,
  type ExperimentRunEntry,
  type ExperimentRunInput,
} from "../../shared/experiments/log";
import { generateProvenanceId, recordRunProvenance } from "./provenance-service";
import type { ExperimentStorageContext } from "./context";
import {
  bumpRunsStats,
  nowUtcIso,
  readMeta,
  runsPath,
  shortHex,
  utcDateStamp,
  utcTimeStamp,
  workspaceIslandAbs,
} from "./registry";
import { detectEnv } from "./venv";

export function generateRunId(): string {
  const d = new Date();
  return `run-${utcDateStamp(d)}-${utcTimeStamp(d)}-${shortHex(4)}`;
}

// ─── append_run ──────────────────────────────────────────────────────────────

/** Grace after finishedAt when attributing files to a run (ms). */
const ARTIFACT_MTIME_GRACE_MS = 1500;
const ARTIFACT_MTIME_MAX_DEPTH = 4;
const ARTIFACT_MTIME_MAX_ENTRIES = 2000;

/**
 * Path-like tokens in command output. Any extension — artifacts are result files
 * (csv/json/npz/png/…), not an image-only type list. No folder allowlists.
 */
const OUTPUT_REL_PATH_RE =
  /(?:^|[\s"'`(=\[{])((?:[\w.-]+\/)+[\w.-]+\.[\w.-]+)\b/gi;
const OUTPUT_BASENAME_RE =
  /(?:^|[\s"'`(=\[{])([\w.-]+\.[\w]{1,12})\b/gi;

function mtimeInRunWindow(abs: string, startMs: number, endMs: number): boolean {
  try {
    const st = statSync(abs);
    return st.isFile() && st.mtimeMs >= startMs && st.mtimeMs <= endMs;
  } catch {
    return false;
  }
}

/**
 * Result files under the lab island whose mtime falls in the run window.
 * Any file type (metrics, tables, plots, archives, …). No project-folder allowlist.
 * Skips only dependency/cache/log trees that are never run outputs.
 */
export function inferArtifactsByMtimeInIsland(
  projectRoot: string,
  islandAbs: string,
  startedAt: string,
  finishedAt: string,
): string[] {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(finishedAt) + ARTIFACT_MTIME_GRACE_MS;
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || !islandAbs || !existsSync(islandAbs)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  let visited = 0;

  const walk = (dir: string, depth: number): void => {
    if (depth > ARTIFACT_MTIME_MAX_DEPTH || visited > ARTIFACT_MTIME_MAX_ENTRIES) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited > ARTIFACT_MTIME_MAX_ENTRIES) break;
      if (entry.name.startsWith(".")) continue;
      if (
        entry.name === "venv" ||
        entry.name === "node_modules" ||
        entry.name === "__pycache__" ||
        entry.name === "logs"
      ) {
        continue;
      }
      const abs = join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(abs, depth + 1);
        } else if (entry.isFile()) {
          visited += 1;
          if (!mtimeInRunWindow(abs, startMs, endMs)) continue;
          const rel = normalizeArtifactSlash(relative(projectRoot, abs));
          if (!rel || rel.startsWith("..") || seen.has(rel)) continue;
          seen.add(rel);
          out.push(rel);
        }
      } catch {
        // skip
      }
    }
  };

  walk(islandAbs, 0);
  return out;
}

/**
 * Paths mentioned in stdout/stderr/notes that exist on disk and were touched in
 * the run window. Folder names and file kinds come from the text + disk — not
 * from an allowlist of directories or extensions.
 */
export function inferArtifactsFromOutputText(
  projectRoot: string,
  workspacePath: string,
  text: string,
  startedAt: string,
  finishedAt: string,
): string[] {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(finishedAt) + ARTIFACT_MTIME_GRACE_MS;
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || !text.trim()) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const tryAdd = (relRaw: string) => {
    const candidates = [
      normalizeArtifactSlash(relRaw),
      workspacePath
        ? normalizeArtifactSlash(`${workspacePath.replace(/\/$/, "")}/${relRaw}`)
        : "",
    ].filter(Boolean);
    for (const rel of candidates) {
      if (seen.has(rel) || rel.includes("..")) continue;
      const abs = join(projectRoot, rel);
      if (!mtimeInRunWindow(abs, startMs, endMs)) continue;
      seen.add(rel);
      out.push(rel);
      return;
    }
    const base = artifactBasename(relRaw);
    if (!base || !base.includes(".")) return;
    const found = findProjectRelByBasename(projectRoot, base);
    if (!found || seen.has(found)) return;
    const abs = join(projectRoot, found);
    if (!mtimeInRunWindow(abs, startMs, endMs)) return;
    seen.add(found);
    out.push(found);
  };

  for (const re of [OUTPUT_REL_PATH_RE, OUTPUT_BASENAME_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const token = m[1];
      if (token) tryAdd(token);
    }
  }
  return out;
}

/**
 * Frozen **image** copies for chat/history figure display when working paths are
 * overwritten later. Non-image artifacts stay path-only in `artifacts[]`.
 */
export function snapshotImageArtifactsForRun(
  ctx: ExperimentStorageContext,
  experimentId: string,
  runId: string,
  artifacts: string[],
): string[] {
  const snaps: string[] = [];
  const usedNames = new Set<string>();
  const destDir = join(ctx.registryRoot, experimentId, "artifacts", runId);

  for (const rel of artifacts) {
    if (!isImageArtifactPath(rel)) continue;
    const abs = join(ctx.projectRoot, normalizeArtifactSlash(rel));
    if (!existsSync(abs)) continue;
    try {
      if (!statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    mkdirSync(destDir, { recursive: true });
    let base = artifactBasename(rel) || "image.png";
    if (usedNames.has(base)) {
      const dot = base.lastIndexOf(".");
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : "";
      base = `${stem}-${randomBytes(3).toString("hex")}${ext}`;
    }
    usedNames.add(base);
    const destAbs = join(destDir, base);
    try {
      copyFileSync(abs, destAbs);
    } catch {
      continue;
    }
    snaps.push(
      normalizeArtifactSlash(
        join(EXPERIMENT_REGISTRY_REL, experimentId, "artifacts", runId, base),
      ),
    );
  }
  return snaps;
}

export function appendRun(
  ctx: ExperimentStorageContext,
  id: string,
  input: ExperimentRunInput,
  context?: { chatSessionId?: string | null },
): { ok: true; run: ExperimentRunEntry; path: string } | { ok: false; error: string } {
  const meta = readMeta(ctx, id);
  if (!meta) {
    return { ok: false, error: "experiment_not_found" };
  }
  const command = (input.command ?? "").toString();
  if (!command.trim()) {
    return { ok: false, error: "missing_command" };
  }
  const island = workspaceIslandAbs(ctx, meta);
  const startedAt = input.startedAt ?? nowUtcIso();
  const finishedAt = input.finishedAt ?? nowUtcIso();
  const workspacePath = meta.workspacePath;
  const declared = Array.isArray(input.artifacts) ? input.artifacts : [];
  // When the agent omits artifacts[]: any result files (not image-only) —
  // (1) touched under the island, (2) paths mentioned in stdout/stderr/notes
  // that exist + mtime-match. No folder/extension allowlists.
  const inferred = [
    ...inferArtifactsByMtimeInIsland(ctx.projectRoot, island, startedAt, finishedAt),
    ...inferArtifactsFromOutputText(
      ctx.projectRoot,
      workspacePath,
      [input.stdoutTail, input.stderrTail, input.notes].filter(Boolean).join("\n"),
      startedAt,
      finishedAt,
    ),
  ];
  const artifacts = normalizeRunArtifactPaths([...declared, ...inferred], {
    workspacePath,
    existsProjectRel: (rel) => existsSync(join(ctx.projectRoot, rel)),
    findByBasename: (base) => findProjectRelByBasename(ctx.projectRoot, base),
  });
  const runId = input.runId || generateRunId();
  const artifactSnapshots = snapshotImageArtifactsForRun(ctx, id, runId, artifacts);
  const run: ExperimentRunEntry = {
    runId,
    startedAt,
    finishedAt,
    command,
    cwd: input.cwd ?? workspacePath,
    exitCode: typeof input.exitCode === "number" ? input.exitCode : -1,
    stdoutTail: tailBytes(stripAnsi(input.stdoutTail ?? ""), RUN_OUTPUT_TAIL_BYTES),
    stderrTail: tailBytes(stripAnsi(input.stderrTail ?? ""), RUN_OUTPUT_TAIL_BYTES),
    artifacts,
    env:
      input.env ??
      detectEnv(island, {
        workspaceAbs: ctx.workspaceAbs,
        workspaceRel: ctx.workspaceRel,
      }),
  };
  if (artifactSnapshots.length > 0) run.artifactSnapshots = artifactSnapshots;
  if (input.notes) run.notes = input.notes;
  if (input.cancelled) run.cancelled = true;
  if (input.kind) run.kind = input.kind;
  if (input.logPath) run.logPath = input.logPath;
  if (input.executionId) run.executionId = input.executionId;
  if (input.transcriptPath) run.transcriptPath = input.transcriptPath;
  if (input.stderrPath) run.stderrPath = input.stderrPath;
  // Provenance before runs.jsonl (Bug #5): never stamp an orphan provenanceEventId
  // on the run when the mirror fails. Prefer a provenance row without a run link
  // over a run pointing at a missing event.
  const chatSessionId = context?.chatSessionId ?? null;
  run.chatSessionId = chatSessionId;
  const provenanceEventId = generateProvenanceId();
  const mirroredId = recordRunProvenance(ctx.projectRoot, {
    workspaceRel: ctx.workspaceRel,
    experimentId: id,
    run,
    chatSessionId,
    provenanceEventId,
    islandAbs: island,
  });
  if (mirroredId) {
    run.provenanceEventId = mirroredId;
  }
  try {
    appendJsonlLine(runsPath(ctx, id), run);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  bumpRunsStats(ctx, id, run);
  return { ok: true, run, path: join(EXPERIMENT_REGISTRY_REL, id, EXPERIMENT_RUNS_FILENAME) };
}

/**
 * Patch `notes` on an existing run line in `runs.jsonl` (Human UI edit).
 * Empty / whitespace clears the field.
 */
export function updateRunNotes(
  ctx: ExperimentStorageContext,
  id: string,
  runId: string,
  notes: string,
): { ok: true; run: ExperimentRunEntry } | { ok: false; error: string } {
  const trimmedId = (id || "").trim();
  const trimmedRunId = (runId || "").trim();
  if (!isSafeExperimentId(trimmedId) || !trimmedRunId) {
    return { ok: false, error: "invalid_id" };
  }
  const meta = readMeta(ctx, trimmedId);
  if (!meta) {
    return { ok: false, error: "experiment_not_found" };
  }
  const rp = runsPath(ctx, trimmedId);
  if (!existsSync(rp)) {
    return { ok: false, error: "run_not_found" };
  }
  let raw: string;
  try {
    raw = readFileSync(rp, "utf-8");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  let updated: ExperimentRunEntry | null = null;
  const nextLines: string[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as ExperimentRunEntry;
      if (entry.runId === trimmedRunId) {
        const next: ExperimentRunEntry = { ...entry };
        const note = notes.trim();
        if (note) next.notes = note;
        else delete next.notes;
        updated = next;
        nextLines.push(JSON.stringify(next));
      } else {
        nextLines.push(line);
      }
    } catch {
      nextLines.push(line);
    }
  }
  if (!updated) {
    return { ok: false, error: "run_not_found" };
  }
  try {
    writeFileSync(rp, nextLines.length > 0 ? `${nextLines.join("\n")}\n` : "", "utf-8");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, run: updated };
}
