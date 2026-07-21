export type PlanStepView = {
  text: string;
  status: string;
};

const TEXT_KEYS = ["text", "content", "description", "title", "label"] as const;

function pickText(item: Record<string, unknown>): string {
  for (const key of TEXT_KEYS) {
    const val = item[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

export function normalizePlanStatus(raw: unknown): string {
  const s = String(raw ?? "pending").toLowerCase().replace(/-/g, "_");
  if (s === "done" || s === "complete" || s === "cancelled" || s === "canceled") {
    return "completed";
  }
  if (s === "active" || s === "running") return "in_progress";
  return s;
}

function firstStepArray(input: Record<string, unknown>): unknown[] {
  for (const key of ["entries", "steps", "plan", "todos"] as const) {
    const value = input[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

/** Defensively extract plan steps from OpenCode `plan.updated` / tool_use input. */
export function parsePlanSteps(input: unknown): PlanStepView[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => parsePlanItem(item))
      .filter((step): step is PlanStepView => step != null);
  }

  if (!input || typeof input !== "object") return [];

  const root = input as Record<string, unknown>;
  return firstStepArray(root)
    .map((item) => parsePlanItem(item))
    .filter((step): step is PlanStepView => step != null);
}

function parsePlanItem(item: unknown): PlanStepView | null {
  if (typeof item === "string") {
    const text = item.trim();
    return text ? { text, status: "pending" } : null;
  }
  if (!item || typeof item !== "object") return null;

  const rec = item as Record<string, unknown>;
  const text = pickText(rec);
  if (!text) return null;

  return {
    text,
    status: normalizePlanStatus(rec.status),
  };
}
