/**
 * diagram.mermaid — structural diagrams (flowcharts, DAGs, proof trees, call
 * graphs). Single kind, two text dialects (`model.engine`): Mermaid (default)
 * or Graphviz DOT. Plain-text contract, no JSON scaffold — same "let the
 * Agent write what it already knows" principle as figure.plotly's Plotly
 * JSON contract.
 *
 * See docs-private/superpowers/specs/2026-07-27-interaction-plotly-runtime-design.md
 * §12 (D36–D42) for the full design rationale.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeFigureResourceProjectPath } from "./interaction-figure";
import type { InteractionResource, InteractionSpec } from "./interaction-spec";

export const INTERACTION_DIAGRAM_KIND = "diagram.mermaid" as const;

export const DIAGRAM_ENGINES = ["mermaid", "dot"] as const;
export type DiagramEngine = (typeof DIAGRAM_ENGINES)[number];

/** Inline `model.source` cap — generous for hand-authored text diagrams. */
export const DIAGRAM_MAX_INLINE_BYTES = 256 * 1024;
/** File-resource cap — looser than inline since file mode is often program-generated. */
export const DIAGRAM_MAX_FILE_BYTES = 2 * 1024 * 1024;

export function isInteractionDiagramKind(kind: string): boolean {
  return kind.trim() === INTERACTION_DIAGRAM_KIND;
}

const FILE_EXT_RE = /\.(mmd|mermaid|dot|gv)$/i;

function resourcePath(r: InteractionResource): string | null {
  const p = (r.path ?? r.artifactPath)?.trim();
  return p || null;
}

function diagramResourcePath(resources?: InteractionResource[]): string | null {
  if (!resources?.length) return null;
  const byRole = resources.find((r) => r.role === "diagram-source" && resourcePath(r));
  if (byRole) return resourcePath(byRole);
  const byExt = resources.find((r) => {
    const p = resourcePath(r);
    return p && FILE_EXT_RE.test(p);
  });
  return byExt ? resourcePath(byExt) : null;
}

function parseEngine(raw: unknown): { ok: true; engine: DiagramEngine } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, engine: "mermaid" };
  if (typeof raw === "string" && (DIAGRAM_ENGINES as readonly string[]).includes(raw)) {
    return { ok: true, engine: raw as DiagramEngine };
  }
  return { ok: false, error: 'model.engine must be "mermaid" or "dot"' };
}

export type DiagramSource =
  | { ok: true; engine: DiagramEngine; mode: "inline"; source: string }
  | { ok: true; engine: DiagramEngine; mode: "file"; path: string }
  | { ok: false; error: string };

/**
 * Resolve which engine + inline-vs-file source a diagram.mermaid spec uses,
 * without reading file content. File resource wins over inline `model.source`
 * when both are present (mirrors resolvePlotlyFigureSource's file-over-inline
 * priority).
 */
export function resolveDiagramSource(spec: InteractionSpec): DiagramSource {
  if (!isInteractionDiagramKind(spec.kind)) {
    return { ok: false, error: `unsupported kind "${spec.kind}"` };
  }
  const engineResult = parseEngine(spec.model?.engine);
  if (!engineResult.ok) return engineResult;
  const { engine } = engineResult;

  const filePath = diagramResourcePath(spec.resources);
  if (filePath) {
    return { ok: true, engine, mode: "file", path: normalizeFigureResourceProjectPath(spec, filePath) };
  }

  const rawSource = spec.model?.source;
  const source = typeof rawSource === "string" ? rawSource : "";
  if (source.trim()) {
    return { ok: true, engine, mode: "inline", source };
  }

  return {
    ok: false,
    error:
      "diagram.mermaid needs model.source (Mermaid/DOT text) or a file resource " +
      '(resources: [{ role: "diagram-source", path: "diagram.mmd" }])',
  };
}

export type DiagramValidationResult =
  | { ok: true; engine: DiagramEngine; mode: "inline" | "file" }
  | { ok: false; error: string };

/**
 * Write-time structural validation only — no parse/compile, no async (D38).
 * Real syntax validation happens at panel mount time and via the offscreen
 * thumbnail self-check, both of which reuse the existing .last-error.json
 * pipeline instead of a new validation tier.
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

/** Minimal legal diagram.mermaid spec (Mermaid engine, inline source). */
export const DIAGRAM_SAMPLE_MERMAID_SPEC: Record<string, unknown> = {
  id: "demo.flow",
  title: "Retry flow",
  kind: INTERACTION_DIAGRAM_KIND,
  compute: "local",
  revision: 1,
  model: {
    source:
      "graph TD;\n  A[Start] --> B{Decision};\n  B -->|Yes| C[End];\n  B -->|No| A;",
  },
};

/** Minimal legal diagram.mermaid spec (Graphviz DOT engine, inline source). */
export const DIAGRAM_SAMPLE_DOT_SPEC: Record<string, unknown> = {
  id: "demo.callgraph",
  title: "Call graph",
  kind: INTERACTION_DIAGRAM_KIND,
  compute: "local",
  revision: 1,
  model: {
    engine: "dot",
    source: "digraph G {\n  rankdir=LR;\n  a -> b -> c;\n}",
  },
};
