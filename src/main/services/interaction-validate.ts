import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  isInteractionFigureKind,
  resolveFigureDisplay,
} from "../../shared/interaction-figure";
import {
  isInteractionPlotlyKind,
  jsonResourcePath,
  resolveInlinePlotlyModel,
  resolvePlotlyFigureSource,
} from "../../shared/interaction-plotly";
import {
  isInteractionInstrumentKind,
  validateInstrumentSpec,
} from "../../shared/interaction-instrument";
import { isInteractionScriptKind } from "../../shared/interaction-script";
import { isInteractionDiagramKind } from "../../shared/interaction-diagram";
import type { InteractionSpec } from "../../shared/interaction-spec";
import { validateScriptSpec } from "./interaction-script-validate";
import { validateDiagramSpec } from "./interaction-diagram-validate";

export type InteractionWriteValidation =
  | { ok: true; spec: InteractionSpec }
  | { ok: false; error: string };

/**
 * Single kind-specific validation entry point shared by the bridge and store.
 * This deliberately validates without writing: callers decide whether the
 * result is a preview response or a persisted upsert.
 */
export function validateInteractionForWrite(
  projectRoot: string,
  input: InteractionSpec,
): InteractionWriteValidation {
  let spec = input;

  if (isInteractionFigureKind(spec.kind)) {
    const fig = resolveFigureDisplay(spec);
    if (!fig.ok) return fig;
    if (!existsSync(join(projectRoot, fig.path))) {
      return {
        ok: false,
        error:
          `figure resource not found on disk: ${fig.path}. ` +
          `Save PNG/HTML under .prismnext/artifacts/${spec.id}/ first, then ` +
          `resources: [{ role: "figure", path: "<filename>.png" }]`,
      };
    }
  }

  if (isInteractionInstrumentKind(spec.kind)) {
    const result = validateInstrumentSpec(spec);
    if (!result.ok) return result;
    spec = { ...spec, model: result.model as unknown as Record<string, unknown> };
  }

  if (isInteractionScriptKind(spec.kind)) {
    const result = validateScriptSpec(projectRoot, spec);
    if (!result.ok) return result;
  }

  if (isInteractionDiagramKind(spec.kind)) {
    const result = validateDiagramSpec(projectRoot, spec);
    if (!result.ok) return result;
  }

  if (isInteractionPlotlyKind(spec.kind)) {
    if (jsonResourcePath(spec.resources)) {
      const source = resolvePlotlyFigureSource(spec);
      if (!source.ok) return source;
      if (source.mode === "file" && !existsSync(join(projectRoot, source.path))) {
        return {
          ok: false,
          error:
            `figure json not found on disk: ${source.path}. ` +
            "Write the Plotly JSON first, then reference it in resources[].",
        };
      }
    } else {
      const resolved = resolveInlinePlotlyModel(spec.model);
      if (!resolved.ok) return resolved;
      spec = { ...spec, model: { figure: resolved.figure } };
    }
  }

  return { ok: true, spec };
}
