/**
 * Provenance Lite - shared schema + types for the append-only
 * `.prismnext/provenance.jsonl` event log.
 *
 * Cross-cutting event stream that binds experiment runs and claimed output
 * artifacts back to their generating command / env / chat session, so the
 * Experiments UI can trace any artifact to the run that produced it.
 *
 * Renderer-safe (no node:fs / crypto). Appending lives in the main-process
 * `provenance-service`; this module only defines the shape + pure helpers.
 *
 * Design: docs-private/superpowers/specs/2026-07-11-provenance-lite-design.md
 */

/** Project-relative path to the append-only event log. */
export const PROVENANCE_REL = ".prismnext/provenance.jsonl";

/** Bump on breaking field renames. Existing events carry their own version. */
export const PROVENANCE_SCHEMA_VERSION = 1 as const;

export type ProvenanceEventType =
  | "run_recorded" // experiment or ad-hoc run captured
  | "artifact_linked" // file linked to a run (explicit or inferred)
  | "download_recorded"; // MCP / literature PDF saved to workspace (Phase 1.1)

/** How a file was bound to a run - drives the trust signal in the inspector. */
export type ProvenanceLinkMethod = "explicit" | "mtime_inferred";

/** Fields common to every provenance event. */
export interface ProvenanceEventBase {
  /** `prov_<timestamp>_<hex>` id. */
  id: string;
  schemaVersion: typeof PROVENANCE_SCHEMA_VERSION;
  type: ProvenanceEventType;
  /** ISO 8601. */
  at: string;
  /** Workspace context prefix (e.g. experiment folder name, or "."). */
  workspaceRel: string;
  /** OpenCode chat session id when known, else null. */
  chatSessionId: string | null;
  /** Git branch at event time (best-effort), else null. */
  gitBranch: string | null;
  /** Short git commit at event time (best-effort), else null. */
  gitCommit: string | null;
}

/** A run completed (exit code captured). Mirror of an `ExperimentRunEntry`. */
export interface ProvenanceRunRecorded extends ProvenanceEventBase {
  type: "run_recorded";
  experimentId: string | null; // null for ad-hoc non-experiment runs (P2)
  runId: string;
  command: string;
  cwd: string; // project-relative preferred
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  /** Subset of ExperimentEnv captured for reproducibility. */
  env: {
    python: string | null;
    pythonVersion: string | null;
    platform: string;
    gitCommit: string | null;
  };
  /** Explicit artifact paths from the run payload (project-relative). */
  artifacts: string[];
  stdoutTailBytes: number;
  stderrTailBytes: number;
}

/** A file linked to a prior run. */
export interface ProvenanceArtifactLinked extends ProvenanceEventBase {
  type: "artifact_linked";
  runId: string;
  experimentId: string | null;
  /** Project-relative file path. */
  artifactPath: string;
  linkMethod: ProvenanceLinkMethod;
  /** MIME or extension hint, else null. */
  mediaType: string | null;
  bytes: number | null;
}

/** A PDF downloaded / ingested into the workspace (Phase 1.1). */
export interface ProvenanceDownloadRecorded extends ProvenanceEventBase {
  type: "download_recorded";
  artifactPath: string;
  source: "paper-search-mcp" | "literature-ingest" | "manual";
  identifier: string | null; // DOI / arXiv id
  sourceUrl: string | null;
  bytes: number | null;
}

export type ProvenanceEvent =
  | ProvenanceRunRecorded
  | ProvenanceArtifactLinked
  | ProvenanceDownloadRecorded;

export function isProvenanceRunRecorded(e: ProvenanceEvent): e is ProvenanceRunRecorded {
  return e.type === "run_recorded";
}

export function isProvenanceArtifactLinked(e: ProvenanceEvent): e is ProvenanceArtifactLinked {
  return e.type === "artifact_linked";
}

export function isProvenanceDownloadRecorded(e: ProvenanceEvent): e is ProvenanceDownloadRecorded {
  return e.type === "download_recorded";
}

/** Normalize an artifact path to forward-slash, no leading "./". */
export function normalizeArtifactPath(projectRel: string): string {
  return projectRel.replace(/\\/g, "/").replace(/^\.\/+/, "");
}
