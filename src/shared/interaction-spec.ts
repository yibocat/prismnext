/**
 * Interactive Research Artifact — Scene Spec (P0 shell).
 * True source lives at `.workbench/interactions/<id>/spec.json`.
 *
 * Naming note (avoid confusion):
 * - **Interaction spec** — this file; directory `.workbench/interactions/` stores specs.
 * - **Chat `artifact` fence** — embeds a project **file path** in chat (see chat-artifact.ts).
 * - **Run `artifacts[]`** — experiment-run output paths in runs.jsonl / provenance.
 * - **Leftover** — pre-workbench specs under `.prismnext/interactions/` or `.prismnext/artifacts/` are not read (D-30).
 */

import { projectInteractionsRel } from "./workbench-paths";

/** Project-relative root for Interaction spec directories. */
export const INTERACTION_SPEC_DIR_REL = projectInteractionsRel();

/** @deprecated Leftover paper-side path. Not read or migrated (D-30). */
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

function firstNonEmptyString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function asResourceList(raw: unknown): InteractionResource[] {
  if (Array.isArray(raw)) {
    return raw.filter((r): r is InteractionResource => !!r && typeof r === "object");
  }
  if (raw && typeof raw === "object") return [{ ...(raw as InteractionResource) }];
  return [];
}

function liftPathAliases(o: Record<string, unknown>): InteractionResource[] {
  const resources = asResourceList(o.resources).map((r) => ({ ...r }));
  const alias = firstNonEmptyString(o.path, o.source, o.imagePath, o.src, o.file);
  if (alias) resources.push({ role: "figure", path: alias });
  if (Array.isArray(o.files)) {
    for (const f of o.files) {
      if (typeof f === "string" && f.trim()) {
        resources.push({ role: "figure", path: f.trim() });
      } else if (f && typeof f === "object" && typeof (f as { path?: unknown }).path === "string") {
        resources.push({ ...(f as InteractionResource) });
      }
    }
  }
  return resources;
}

/**
 * Accept the shapes models actually send (JSON string, `figure:static`,
 * top-level `path`/`source`/`files`, omitted compute/revision).
 * Stored specs still go through {@link parseInteractionSpec}.
 */
export function coerceInteractionSpecInput(raw: unknown): unknown {
  let value: unknown = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return raw;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const o = { ...(value as Record<string, unknown>) };
  if (
    o.spec &&
    typeof o.spec === "object" &&
    !Array.isArray(o.spec) &&
    typeof o.id !== "string"
  ) {
    return coerceInteractionSpecInput(o.spec);
  }

  if (typeof o.kind === "string") {
    o.kind = o.kind.trim().replace(/:/g, ".");
  }
  if (o.compute == null || o.compute === "") {
    o.compute = "local";
  }
  if (o.revision == null || o.revision === "") {
    o.revision = 1;
  } else if (typeof o.revision === "string" && /^\d+$/.test(o.revision.trim())) {
    o.revision = Number.parseInt(o.revision.trim(), 10);
  }

  const resources = liftPathAliases(o);
  if (resources.length > 0) o.resources = resources;
  return o;
}

/** Human-readable reason after {@link coerceInteractionSpecInput} still fails parse. */
export function explainInteractionSpecFailure(raw: unknown): string {
  const coerced = coerceInteractionSpecInput(raw);
  if (typeof raw === "string") {
    try {
      JSON.parse(raw);
    } catch {
      return "spec must be a JSON object, not a string. Example: {\"id\":\"fig.demo\",\"title\":\"Demo\",\"kind\":\"figure.static\",\"compute\":\"local\",\"revision\":1,\"resources\":[{\"role\":\"figure\",\"path\":\"figures/demo.pdf\"}]}";
    }
  }
  if (!coerced || typeof coerced !== "object" || Array.isArray(coerced)) {
    return "spec must be a JSON object with id, title, kind, compute, revision, and resources[].";
  }
  const o = coerced as Record<string, unknown>;
  const missing: string[] = [];
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!isValidInteractionId(id)) missing.push("id (slug like som-cell-diagram)");
  if (typeof o.title !== "string" || !o.title.trim()) missing.push("title");
  if (typeof o.kind !== "string" || !o.kind.trim()) {
    missing.push("kind (figure.static or plot.* — use a dot, not a colon)");
  }
  if (o.compute !== "local" && o.compute !== "bound") missing.push("compute (local or bound)");
  if (typeof o.revision !== "number" || !Number.isFinite(o.revision)) {
    missing.push("revision (integer >= 1)");
  }
  const resources = asResourceList(o.resources);
  const hasPath = resources.some((r) => typeof r.path === "string" && r.path.trim());
  if (!hasPath) {
    missing.push("resources[] with path (png/svg/jpg/webp/gif/pdf — not source/imagePath/files)");
  }
  if (missing.length) {
    return `invalid_spec: missing ${missing.join("; ")}`;
  }
  return "invalid_spec: check id/title/kind/compute/revision and resources[].path";
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
  "plot.area",
  "plot.bar",
  "plot.histogram",
  "plot.box",
  "plot.density",
  "plot.heatmap",
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
