/**
 * Flat metrics JSON helpers — same contract as Results snapshot scan
 * (top-level object of finite numbers / short strings).
 */

const MAX_STRING = 200;

/** Parse a JSON object into flat metric values, or null if unsuitable. */
export function parseFlatMetricsObject(raw: unknown): Record<string, number | string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const values: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
    else if (typeof v === "string" && v.length <= MAX_STRING) values[k] = v;
  }
  return Object.keys(values).length > 0 ? values : null;
}

export function parseFlatMetricsJsonText(text: string): Record<string, number | string> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  return parseFlatMetricsObject(raw);
}

/** Prefer *metrics*.json then any .json artifact path (basename). */
export function pickMetricsArtifactPaths(artifacts: string[] | null | undefined): string[] {
  const list = (artifacts ?? []).map((p) => p.replace(/\\/g, "/")).filter(Boolean);
  const metricsNamed = list.filter((p) => {
    const base = p.split("/").pop()?.toLowerCase() ?? "";
    return base.endsWith(".json") && base.includes("metric");
  });
  if (metricsNamed.length > 0) return metricsNamed;
  return list.filter((p) => p.toLowerCase().endsWith(".json"));
}
