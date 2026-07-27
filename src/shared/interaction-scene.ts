/**
 * Interaction scene.program — entry resolution helpers (pure).
 */

import type { InteractionResource, InteractionSpec } from "./interaction-spec";

export const INTERACTION_SCENE_KINDS = ["scene.program", "scene.ir"] as const;

export type InteractionSceneKind = (typeof INTERACTION_SCENE_KINDS)[number];

export const BUILTIN_SCENE_LORENZ = "builtin:lorenz";

export const DEFAULT_SCENE_ENTRY = "scene.js";

export function isInteractionSceneKind(kind: string): boolean {
  return (INTERACTION_SCENE_KINDS as readonly string[]).includes(kind.trim());
}

function resourceScriptPath(r: InteractionResource): string | null {
  const p = (r.path ?? r.artifactPath)?.trim();
  if (!p) return null;
  const norm = p.replace(/\\/g, "/").replace(/^\.\//, "");
  if (norm.includes("..") || norm.startsWith("/") || /^[A-Za-z]:/.test(norm)) return null;
  if (!/\.(mjs|js|cjs)$/i.test(norm)) return null;
  return norm;
}

function inferEntryFromResources(resources?: InteractionResource[]): string | null {
  if (!resources?.length) return null;
  const byRole = resources.find((r) => r.role === "script" && resourceScriptPath(r));
  if (byRole) return resourceScriptPath(byRole);
  const sceneJs = resources.find((r) => {
    const p = resourceScriptPath(r);
    return p && /(^|\/)scene\.(mjs|js|cjs)$/i.test(p);
  });
  if (sceneJs) return resourceScriptPath(sceneJs);
  const anyJs = resources.find((r) => resourceScriptPath(r));
  return anyJs ? resourceScriptPath(anyJs) : null;
}

/** Safe artifact-relative entry path, or builtin:<name>. */
export function resolveSceneEntry(spec: InteractionSpec): string | null {
  if (!isInteractionSceneKind(spec.kind)) return null;
  const raw = (spec.entry ?? "").trim();
  if (raw) {
    if (raw.startsWith("builtin:")) {
      const name = raw.slice("builtin:".length).trim();
      if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
      return `builtin:${name}`;
    }
    const p = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!p || p.includes("..") || p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
    if (!/\.(mjs|js|cjs)$/i.test(p)) return null;
    return p;
  }

  // Agent often writes scene.js but forgets entry — default to scene.js, never a builtin.
  const inferred = inferEntryFromResources(spec.resources);
  if (inferred) return inferred;
  return DEFAULT_SCENE_ENTRY;
}

export function isBuiltinSceneEntry(entry: string): boolean {
  return entry.startsWith("builtin:");
}

export function builtinSceneName(entry: string): string | null {
  if (!isBuiltinSceneEntry(entry)) return null;
  return entry.slice("builtin:".length);
}
