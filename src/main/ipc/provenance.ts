/**
 * provenance:* IPC - read-only lookups for the Experiments provenance inspector.
 *
 * Binds a claimed artifact (or a runId) back to its generating `run_recorded`
 * event. "Not found" is a normal null (honest empty), never an error - so the
 * handlers return `ProvenanceRunRecorded | null` directly rather than an
 * ok-union (there is no failure mode to express).
 *
 * Design: docs-private/superpowers/specs/2026-07-11-provenance-lite-design.md §6
 */
import { ipcMain } from "electron";
import {
  resolveRunById,
  resolveRunForArtifact,
  type ResolvedArtifactProvenance,
} from "../services/provenance-service";

export function registerProvenanceHandlers(): void {
  ipcMain.handle(
    "provenance:getForArtifact",
    async (
      _event,
      args: { projectRoot: string; artifactPath: string },
    ): Promise<ResolvedArtifactProvenance | null> =>
      resolveRunForArtifact(args.projectRoot, args.artifactPath),
  );

  ipcMain.handle(
    "provenance:getForRun",
    async (_event, args: { projectRoot: string; runId: string }) =>
      resolveRunById(args.projectRoot, args.runId),
  );
}
