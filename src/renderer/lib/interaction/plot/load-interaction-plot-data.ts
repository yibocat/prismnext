import type { InteractionSpec } from "../../../../shared/interaction-spec";
import {
  buildLocalDemoPlotPoints,
  csvRowsToPlotPoints,
  isInteractionPlotKind,
  MAX_PLOT_CSV_BYTES,
  parsePlotParams,
  parseSimpleCsv,
  pickCsvResourcePath,
  type PlotDataResult,
} from "../../../../shared/interaction-plot";

function resolveProjectAbsPath(projectRoot: string, relPath: string): string {
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p)) return p;
  const root = projectRoot.replace(/\/$/, "");
  return `${root}/${p}`;
}

export async function loadInteractionPlotData(
  spec: InteractionSpec,
  projectRoot: string,
): Promise<PlotDataResult> {
  if (!isInteractionPlotKind(spec.kind)) {
    return { ok: false, error: `unsupported kind "${spec.kind}"` };
  }

  const { xCol, yCols } = parsePlotParams(spec.params);

  if (spec.compute === "local") {
    const points = buildLocalDemoPlotPoints(spec.kind, yCols);
    return {
      ok: true,
      points,
      xLabel: xCol,
      yLabel: yCols.length === 1 ? yCols[0] : undefined,
    };
  }

  const csvPath = pickCsvResourcePath(spec.resources);
  if (!csvPath) {
    return { ok: false, error: "bound plot requires a csv resource path" };
  }

  const abs = resolveProjectAbsPath(projectRoot, csvPath);
  let content: string;
  try {
    const res = await window.electronAPI.fsRead(abs);
    content = res.content;
  } catch {
    return { ok: false, error: `could not read "${csvPath}"` };
  }

  if (content.length > MAX_PLOT_CSV_BYTES) {
    return { ok: false, error: "csv file is too large" };
  }

  const parsed = parseSimpleCsv(content);
  if (!parsed) {
    return { ok: false, error: "invalid or empty csv" };
  }

  return csvRowsToPlotPoints(parsed.rows, parsed.columns, xCol, yCols);
}
