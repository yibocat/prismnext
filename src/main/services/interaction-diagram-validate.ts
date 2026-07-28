/**
 * Write-time disk validation for diagram.mermaid (main process only).
 *
 * Mirrors figure.static: `resolveDiagramSource` stays in shared (renderer-safe);
 * `existsSync` / size checks live here so Vite never pulls `node:fs` into the
 * browser bundle.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DIAGRAM_MAX_INLINE_BYTES,
  resolveDiagramSource,
  type DiagramEngine,
} from "../../shared/interaction-diagram";
import type { InteractionSpec } from "../../shared/interaction-spec";

export type DiagramValidationResult =
  | { ok: true; engine: DiagramEngine; mode: "inline" | "file" }
  | { ok: false; error: string };

/**
 * Write-time structural validation only — no parse/compile, no async (D38).
 * Real syntax validation happens at panel mount time and via the offscreen
 * thumbnail self-check.
 */
export function validateDiagramSpec(
  projectRoot: string,
  spec: InteractionSpec,
): DiagramValidationResult {
  const resolved = resolveDiagramSource(spec);
  if (!resolved.ok) return resolved;

  if (resolved.mode === "inline") {
    const bytes = Buffer.byteLength(resolved.source, "utf8");
    if (bytes > DIAGRAM_MAX_INLINE_BYTES) {
      return {
        ok: false,
        error: `diagram source too large (${bytes} bytes > ${DIAGRAM_MAX_INLINE_BYTES} byte limit) — move it to a file resource instead`,
      };
    }
    return { ok: true, engine: resolved.engine, mode: "inline" };
  }

  const abs = join(projectRoot, resolved.path);
  if (!existsSync(abs)) {
    return {
      ok: false,
      error:
        `diagram resource not found on disk: ${resolved.path}. ` +
        `Write the Mermaid/DOT text first, then resources: [{ role: "diagram-source", path: "<filename>" }]`,
    };
  }
  return { ok: true, engine: resolved.engine, mode: "file" };
}
