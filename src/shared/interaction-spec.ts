/**
 * Interactive Research Artifact — Scene Spec (P0 shell).
 * True source lives at `.prismnext/interactions/<id>/spec.json`.
 *
 * Naming note (avoid confusion):
 * - **Interaction spec** — this file; directory `.prismnext/interactions/` stores specs.
 * - **Chat `artifact` fence** — embeds a project **file path** in chat (see chat-artifact.ts).
 * - **Run `artifacts[]`** — experiment-run output paths in runs.jsonl / provenance.
 * - **Legacy** — specs written before 0.6.6 may still be under `.prismnext/artifacts/` (auto-migrated on read/write).
 */

/** Project-relative root for Interaction spec directories. */
export const INTERACTION_SPEC_DIR_REL = ".prismnext/interactions";

/** Pre-0.6.6 spec root — read + lazy migrate only. */
export const LEGACY_INTERACTION_SPEC_DIR_REL = ".prismnext/artifacts";

export function interactionSpecRelativePath(id: string): string {
  const trimmed = (id || "").trim();
  return `${INTERACTION_SPEC_DIR_REL}/${trimmed}/spec.json`;
}

export function legacyInteractionSpecRelativePath(id: string): string {
  const trimmed = (id || "").trim();
  return `${LEGACY_INTERACTION_SPEC_DIR_REL}/${trimmed}/spec.json`;
}

export type InteractionCompute = "local" | "bound";

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
  if (base === "figure") return "Figure";
  if (base === "plot") return "Plot";
  if (base === "math") return "Math";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Agent-writable kinds (progressive).
 * Roadmap (not yet writable): diagram.mermaid, formula.display — see changelog.
 */
export const INTERACTION_KINDS_AGENT = [
  "figure.static",
  "plot.line",
  "plot.series",
  "plot.scatter",
] as const;

export type InteractionKindAgent = (typeof INTERACTION_KINDS_AGENT)[number];

export function isAllowedInteractionKind(kind: string): boolean {
  return (INTERACTION_KINDS_AGENT as readonly string[]).includes(kind.trim());
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
