/**
 * Provenance service - append-only `.workbench/provenance.jsonl` event log.
 *
 * Cross-cutting stream that binds experiment runs and claimed output artifacts
 * back to their generating command / env / chat session. `runs.jsonl` remains
 * the experiment domain's source of truth; this log mirrors run records +
 * emits artifact link events so the Experiments UI can trace any claimed
 * artifact to the run that produced it.
 *
 * Best-effort: write helpers never throw to the caller - a provenance failure
 * must not break run accounting. Read helpers skip corrupt lines silently.
 *
 * Design: docs-private/superpowers/specs/2026-07-11-provenance-lite-design.md
 */
import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";
import { randomBytes } from "node:crypto";
import { appendJsonlLine } from "../lib/jsonl-append";
import {
  PROVENANCE_REL,
  PROVENANCE_SCHEMA_VERSION,
  isProvenanceArtifactLinked,
  isProvenanceRunRecorded,
  normalizeArtifactPath,
  type ProvenanceArtifactLinked,
  type ProvenanceDownloadRecorded,
  type ProvenanceEvent,
  type ProvenanceLinkMethod,
  type ProvenanceRunRecorded,
} from "../../shared/provenance";
import type { ExperimentRunEntry } from "../../shared/experiment-log";

function provenancePath(projectRoot: string): string {
  return join(projectRoot.replace(/\\/g, "/"), PROVENANCE_REL);
}

/** `prov_<ms>_<hex4>` - main-process only (uses Date + crypto). */
export function generateProvenanceId(): string {
  return `prov_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

/** Best-effort current git branch for `projectRoot` (null when detached / no git). */
function currentGitBranch(projectRoot: string): string | null {
  try {
    const out = execSync("git rev-parse --abbrev-ref HEAD 2>/dev/null", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    });
    const branch = (out || "").trim();
    // detached HEAD reports "HEAD" - the commit is still recorded, branch is N/A.
    return branch && branch !== "HEAD" ? branch : null;
  } catch {
    return null;
  }
}

/** Read all events, skipping blank / corrupt lines. Empty array if no log yet. */
export function readProvenanceEvents(projectRoot: string): ProvenanceEvent[] {
  const path = provenancePath(projectRoot);
  if (!existsSync(path)) return [];
  const out: ProvenanceEvent[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as ProvenanceEvent);
    } catch {
      // skip corrupt lines
    }
  }
  return out;
}

/** Append one event (creates `.workbench/` if needed). Never throws; returns false on I/O failure. */
export function appendProvenanceEvent(projectRoot: string, event: ProvenanceEvent): boolean {
  const root = projectRoot.replace(/\\/g, "/");
  try {
    appendJsonlLine(provenancePath(root), event);
    return true;
  } catch {
    // Best-effort: never break run accounting on provenance I/O failure.
    return false;
  }
}

/** The run + how the file was linked, for one claimed artifact. Null = unlinked. */
export interface ResolvedArtifactProvenance {
  run: ProvenanceRunRecorded;
  linkMethod: ProvenanceLinkMethod;
}

/** Find the run that claimed `artifactPath` (latest link wins). Null = unlinked. */
export function resolveRunForArtifact(
  projectRoot: string,
  artifactPath: string,
): ResolvedArtifactProvenance | null {
  const normalized = normalizeArtifactPath(artifactPath);
  const events = readProvenanceEvents(projectRoot);
  const link = [...events].reverse().find(
    (e): e is ProvenanceArtifactLinked =>
      isProvenanceArtifactLinked(e) && normalizeArtifactPath(e.artifactPath) === normalized,
  );
  if (!link) return null;
  const run = events.find(
    (e): e is ProvenanceRunRecorded => isProvenanceRunRecorded(e) && e.runId === link.runId,
  );
  if (!run) return null;
  return { run, linkMethod: link.linkMethod };
}

/** Find a run_recorded event by runId. Null when absent. */
export function resolveRunById(projectRoot: string, runId: string): ProvenanceRunRecorded | null {
  const events = readProvenanceEvents(projectRoot);
  return (
    events.find(
      (e): e is ProvenanceRunRecorded => isProvenanceRunRecorded(e) && e.runId === runId,
    ) ?? null
  );
}

const MEDIA_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  json: "application/json",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  html: "text/html",
};

function mediaTypeForPath(p: string): string | null {
  const ext = p.split(".").pop()?.toLowerCase();
  return ext ? (MEDIA_BY_EXT[ext] ?? null) : null;
}

/** Grace window after `finishedAt` to still attribute a file to the run (ms). */
const MTIME_GRACE_MS = 500;
/** Cap recursion depth + entry count so a sprawling island can't stall the run. */
const MTIME_SCAN_MAX_DEPTH = 4;
const MTIME_SCAN_MAX_ENTRIES = 2000;

/**
 * Bounded mtime inference: find files under `islandAbs` whose mtime falls in
 * `[startedAt, finishedAt + grace]` and that were NOT declared explicitly.
 * Returns project-relative paths. Pure + synchronous, best-effort (never throws).
 */
function inferArtifactsByMtime(
  projectRoot: string,
  islandAbs: string,
  startedAt: string,
  finishedAt: string,
  explicit: Set<string>,
): { path: string; bytes: number | null }[] {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(finishedAt) + MTIME_GRACE_MS;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return [];
  const out: { path: string; bytes: number | null }[] = [];
  let visited = 0;
  const walk = (dir: string, depth: number): void => {
    if (depth > MTIME_SCAN_MAX_DEPTH || visited > MTIME_SCAN_MAX_ENTRIES) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited > MTIME_SCAN_MAX_ENTRIES) break;
      // Skip hidden (covers shared `.venv`), dependency trees, and caches —
      // mtime noise here must never become provenance claims.
      if (entry.name.startsWith(".")) continue;
      if (
        entry.name === "venv" ||
        entry.name === "node_modules" ||
        entry.name === "__pycache__" ||
        entry.name === ".venv"
      ) {
        continue;
      }
      const abs = join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(abs, depth + 1);
        } else if (entry.isFile()) {
          visited++;
          const st = statSync(abs);
          const m = st.mtimeMs;
          if (m >= startMs && m <= endMs) {
            const rel = relative(projectRoot, abs).replace(/\\/g, "/");
            if (!explicit.has(normalizeArtifactPath(rel))) {
              out.push({ path: rel, bytes: st.size });
            }
          }
        }
      } catch {
        // skip unreadable entry
      }
    }
  };
  walk(islandAbs, 0);
  return out;
}

export interface RecordRunProvenanceOpts {
  workspaceRel: string;
  experimentId: string;
  run: ExperimentRunEntry;
  /** OpenCode chat session that triggered the run, when known. */
  chatSessionId?: string | null;
  /** Pre-generated event id (shared with `ExperimentRunEntry.provenanceEventId`). */
  provenanceEventId?: string;
  /**
   * Absolute workspace island dir to scan for mtime-inferred artifacts.
   * When provided, files modified within [startedAt, finishedAt+grace] that
   * were NOT declared explicitly get an `artifact_linked` (mtime_inferred).
   */
  islandAbs?: string;
}

/**
 * Mirror an experiment `appendRun` into provenance.jsonl: one `run_recorded`
 * event + one `artifact_linked` per explicit artifact. Best-effort - returns
 * the event id on success, null on any failure (caller ignores null).
 */
export function recordRunProvenance(
  projectRoot: string,
  opts: RecordRunProvenanceOpts,
): string | null {
  try {
    const eventId = opts.provenanceEventId ?? generateProvenanceId();
    const at = opts.run.finishedAt;
    const gitCommit = opts.run.env?.gitCommit ?? null;
    const base = {
      workspaceRel: opts.workspaceRel,
      chatSessionId: opts.chatSessionId ?? null,
      gitBranch: currentGitBranch(projectRoot),
      gitCommit,
    };
    const runEvent: ProvenanceRunRecorded = {
      id: eventId,
      schemaVersion: PROVENANCE_SCHEMA_VERSION,
      type: "run_recorded",
      at,
      ...base,
      experimentId: opts.experimentId,
      runId: opts.run.runId,
      command: opts.run.command,
      cwd: opts.run.cwd,
      exitCode: opts.run.exitCode,
      startedAt: opts.run.startedAt,
      finishedAt: opts.run.finishedAt,
      env: {
        python: opts.run.env?.python ?? null,
        pythonVersion: opts.run.env?.pythonVersion ?? null,
        platform: opts.run.env?.platform ?? process.platform,
        gitCommit,
      },
      artifacts: opts.run.artifacts ?? [],
      stdoutTailBytes: opts.run.stdoutTail?.length ?? 0,
      stderrTailBytes: opts.run.stderrTail?.length ?? 0,
    };
    if (!appendProvenanceEvent(projectRoot, runEvent)) {
      return null;
    }

    for (const artifactPath of opts.run.artifacts ?? []) {
      const link: ProvenanceArtifactLinked = {
        id: generateProvenanceId(),
        schemaVersion: PROVENANCE_SCHEMA_VERSION,
        type: "artifact_linked",
        at,
        ...base,
        runId: opts.run.runId,
        experimentId: opts.experimentId,
        artifactPath: normalizeArtifactPath(artifactPath),
        linkMethod: "explicit",
        mediaType: mediaTypeForPath(artifactPath),
        bytes: null,
      };
      appendProvenanceEvent(projectRoot, link);
    }

    // Phase 1.1 - mtime inference: bind files the run produced but the agent
    // did NOT list. Bounded scan of the experiment island within the run's
    // time window; marked `mtime_inferred` (lower trust than explicit).
    if (opts.islandAbs) {
      const explicit = new Set(
        (opts.run.artifacts ?? []).map((p) => normalizeArtifactPath(p)),
      );
      const inferred = inferArtifactsByMtime(
        projectRoot,
        opts.islandAbs,
        opts.run.startedAt,
        opts.run.finishedAt,
        explicit,
      );
      for (const found of inferred) {
        const link: ProvenanceArtifactLinked = {
          id: generateProvenanceId(),
          schemaVersion: PROVENANCE_SCHEMA_VERSION,
          type: "artifact_linked",
          at,
          ...base,
          runId: opts.run.runId,
          experimentId: opts.experimentId,
          artifactPath: normalizeArtifactPath(found.path),
          linkMethod: "mtime_inferred",
          mediaType: mediaTypeForPath(found.path),
          bytes: found.bytes,
        };
        appendProvenanceEvent(projectRoot, link);
      }
    }
    return eventId;
  } catch {
    return null;
  }
}

export interface RecordDownloadProvenanceOpts {
  /** Project-relative file path of the downloaded file. */
  artifactPath: string;
  source: "paper-search-mcp" | "literature-ingest" | "manual";
  /** DOI / arXiv id when known. */
  identifier?: string | null;
  /** Origin URL when the file was fetched remotely. */
  sourceUrl?: string | null;
  bytes?: number | null;
  /** Workspace context prefix (defaults to "." - project root). */
  workspaceRel?: string;
  chatSessionId?: string | null;
}

/**
 * Record a `download_recorded` event (Phase 1.1) - a PDF or other file fetched
 * / ingested into the workspace. Best-effort - never throws to the caller.
 */
export function recordDownloadProvenance(
  projectRoot: string,
  opts: RecordDownloadProvenanceOpts,
): void {
  try {
    const event: ProvenanceDownloadRecorded = {
      id: generateProvenanceId(),
      schemaVersion: PROVENANCE_SCHEMA_VERSION,
      type: "download_recorded",
      at: new Date().toISOString(),
      workspaceRel: opts.workspaceRel ?? ".",
      chatSessionId: opts.chatSessionId ?? null,
      gitBranch: currentGitBranch(projectRoot),
      gitCommit: null,
      artifactPath: normalizeArtifactPath(opts.artifactPath),
      source: opts.source,
      identifier: opts.identifier ?? null,
      sourceUrl: opts.sourceUrl ?? null,
      bytes: opts.bytes ?? null,
    };
    appendProvenanceEvent(projectRoot, event);
  } catch {
    // best-effort: provenance must never break the download path
  }
}
