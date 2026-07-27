/**
 * Interactive Research Artifact — Scene Spec.
 * True source lives at `.prismnext/artifacts/<id>/spec.json`.
 */

export type InteractionCompute = "local" | "bound";

/** Known resource roles (agents may still use other role strings). */
export const INTERACTION_RESOURCE_ROLES = [
  "data",
  "figure",
  "html",
  "mesh",
  "field",
  "graph",
  "steps",
] as const;

export type InteractionResourceRole = (typeof INTERACTION_RESOURCE_ROLES)[number];

export type InteractionResource = {
  role?: string;
  path?: string;
  runId?: string;
  artifactPath?: string;
};

export type InteractionSpec = {
  id: string;
  title: string;
  kind: string;
  compute: InteractionCompute;
  revision: number;
  /** Scene program entry: artifact-relative `scene.js` or `builtin:<name>`. */
  entry?: string;
  params?: Record<string, unknown>;
  model?: Record<string, unknown>;
  bindings?: Record<string, Record<string, unknown>>;
  view?: Record<string, unknown>;
  resources?: InteractionResource[];
};

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function isValidInteractionId(id: string): boolean {
  const s = (id || "").trim();
  return Boolean(s) && ID_RE.test(s) && !s.includes("..");
}

export function parseInteractionSpec(raw: unknown): InteractionSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const kind = typeof o.kind === "string" ? o.kind.trim() : "";
  const compute = o.compute === "local" || o.compute === "bound" ? o.compute : null;
  const revision =
    typeof o.revision === "number" && Number.isFinite(o.revision)
      ? Math.max(1, Math.floor(o.revision))
      : null;
  if (!isValidInteractionId(id) || !title || !kind || !compute || revision === null) {
    return null;
  }

  const spec: InteractionSpec = { id, title, kind, compute, revision };

  if (typeof o.entry === "string" && o.entry.trim()) {
    spec.entry = o.entry.trim();
  }
  if (o.params && typeof o.params === "object" && !Array.isArray(o.params)) {
    spec.params = o.params as Record<string, unknown>;
  }
  if (o.model && typeof o.model === "object" && !Array.isArray(o.model)) {
    spec.model = o.model as Record<string, unknown>;
  }
  if (o.bindings && typeof o.bindings === "object" && !Array.isArray(o.bindings)) {
    spec.bindings = o.bindings as Record<string, Record<string, unknown>>;
  }
  if (o.view && typeof o.view === "object" && !Array.isArray(o.view)) {
    spec.view = o.view as Record<string, unknown>;
  }
  if (Array.isArray(o.resources)) {
    spec.resources = o.resources
      .filter((r): r is InteractionResource => r && typeof r === "object")
      .map((r) => ({ ...r }));
  }
  return spec;
}

export function kindDisplayLabel(kind: string): string {
  const base = kind.split(".")[0] ?? kind;
  if (base === "plot") return "Plot";
  if (base === "math") return "Math";
  if (base === "figure") return "Figure";
  if (base === "scene") return "Scene";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Kinds agents may write (declarative + programmable canvas). */
export const INTERACTION_KINDS_AGENT = [
  "plot.line",
  "plot.series",
  "plot.scatter",
  "figure.static",
  "figure.plotly",
  "instrument",
  "figure.script",
  "diagram.mermaid",
] as const;

export type InteractionKindAgent = (typeof INTERACTION_KINDS_AGENT)[number];

export function isAllowedInteractionKind(kind: string): boolean {
  return (INTERACTION_KINDS_AGENT as readonly string[]).includes(kind.trim());
}

/**
 * Retired kinds (V4-A) — no longer writable, but existing on-disk specs
 * still resolve to a read-only "migration" view instead of failing silently.
 * See docs-private/superpowers/plans/2026-07-27-interaction-plotly-v4a.md.
 */
export const INTERACTION_KINDS_DEPRECATED = [
  "scene.ir",
  "math.surface",
  "math.field",
  "scene.program",
] as const;

export function isDeprecatedInteractionKind(kind: string): boolean {
  return (INTERACTION_KINDS_DEPRECATED as readonly string[]).includes(kind.trim());
}

export function buildInteractionFenceMarkdown(id: string, title?: string): string {
  const lines = ["```interaction", `id: ${id.trim()}`];
  if (title?.trim()) lines.push(`title: ${title.trim()}`);
  lines.push("```");
  return lines.join("\n");
}

export function interactionFenceHint(id: string, title?: string): {
  fenceMarkdown: string;
  replyRule: string;
} {
  return {
    fenceMarkdown: buildInteractionFenceMarkdown(id, title),
    replyRule:
      "Embed fenceMarkdown in your next assistant message (assistant reply only) so the user gets a clickable Interaction card.",
  };
}
