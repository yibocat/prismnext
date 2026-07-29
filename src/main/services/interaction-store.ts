import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isFigureStaticKind } from "../../shared/interaction-figure";
import { validateFigureStaticSpec } from "../../shared/interaction-figure-fs";
import { isInteractionPlotKind } from "../../shared/interaction-plot";
import { validatePlotSpec } from "../../shared/interaction-plot-fs";
import {
  INTERACTION_SPEC_DIR_REL,
  LEGACY_INTERACTION_SPEC_DIR_REL,
  isValidInteractionId,
  isAllowedInteractionKind,
  parseInteractionSpec,
  type InteractionSpec,
} from "../../shared/interaction-spec";

/** Interaction spec root — NOT chat ```artifact fences (file paths). */
export function interactionSpecsDir(projectRoot: string): string {
  return join(projectRoot, INTERACTION_SPEC_DIR_REL);
}

/** @deprecated Use interactionSpecsDir — legacy name kept for internal grep stability. */
export const interactionArtifactsDir = interactionSpecsDir;

function legacyInteractionSpecsDir(projectRoot: string): string {
  return join(projectRoot, LEGACY_INTERACTION_SPEC_DIR_REL);
}

export function interactionSpecPath(projectRoot: string, id: string): string {
  return join(interactionSpecsDir(projectRoot), id, "spec.json");
}

function legacyInteractionSpecPath(projectRoot: string, id: string): string {
  return join(legacyInteractionSpecsDir(projectRoot), id, "spec.json");
}

function resolveExistingSpecAbsPath(projectRoot: string, id: string): string | null {
  const primary = interactionSpecPath(projectRoot, id);
  if (existsSync(primary)) return primary;
  const legacy = legacyInteractionSpecPath(projectRoot, id);
  if (existsSync(legacy)) return legacy;
  return null;
}

function listIdsUnderRoot(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const id = name.name;
    if (!isValidInteractionId(id)) continue;
    if (existsSync(join(root, id, "spec.json"))) out.push(id);
  }
  return out;
}

function removeLegacyInteractionDir(projectRoot: string, id: string): void {
  const legacyDir = join(legacyInteractionSpecsDir(projectRoot), id);
  if (!existsSync(legacyDir)) return;
  try {
    rmSync(legacyDir, { recursive: true, force: true });
  } catch {
    // best-effort — new path is canonical
  }
}

/** Move any specs still under legacy `.prismnext/artifacts/` into `interactions/`. */
export function migrateLegacyInteractionSpecs(projectRoot: string): number {
  const legacyRoot = legacyInteractionSpecsDir(projectRoot);
  if (!existsSync(legacyRoot)) return 0;

  let migrated = 0;
  for (const id of listIdsUnderRoot(legacyRoot)) {
    if (existsSync(interactionSpecPath(projectRoot, id))) {
      removeLegacyInteractionDir(projectRoot, id);
      continue;
    }
    const legacyAbs = legacyInteractionSpecPath(projectRoot, id);
    if (!existsSync(legacyAbs)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(legacyAbs, "utf8"));
    } catch {
      continue;
    }
    const spec = parseInteractionSpec(raw);
    if (!spec || spec.id !== id) continue;
    const write = writeInteractionSpec(projectRoot, spec);
    if (write.ok) migrated += 1;
  }
  return migrated;
}

export function readInteractionSpec(
  projectRoot: string,
  id: string,
): { spec: InteractionSpec | null; error?: string } {
  if (!isValidInteractionId(id)) {
    return { spec: null, error: "invalid id" };
  }
  const abs = resolveExistingSpecAbsPath(projectRoot, id);
  if (!abs) {
    return { spec: null, error: "not found" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return { spec: null, error: "invalid json" };
  }
  const spec = parseInteractionSpec(raw);
  if (!spec) return { spec: null, error: "invalid spec" };
  if (spec.id !== id) {
    return { spec: null, error: "id mismatch" };
  }
  return { spec };
}

export function writeInteractionSpec(
  projectRoot: string,
  spec: InteractionSpec,
): { ok: boolean; error?: string } {
  if (!isValidInteractionId(spec.id)) {
    return { ok: false, error: "invalid id" };
  }
  const parsed = parseInteractionSpec(spec);
  if (!parsed) return { ok: false, error: "invalid spec" };

  const dir = join(interactionSpecsDir(projectRoot), parsed.id);
  mkdirSync(dir, { recursive: true });
  const abs = join(dir, "spec.json");
  try {
    writeFileSync(abs, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    removeLegacyInteractionDir(projectRoot, parsed.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "write failed" };
  }
}

export function listInteractionIds(projectRoot: string): string[] {
  migrateLegacyInteractionSpecs(projectRoot);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const root of [interactionSpecsDir(projectRoot), legacyInteractionSpecsDir(projectRoot)]) {
    for (const id of listIdsUnderRoot(root)) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out.sort();
}

export type InteractionSummary = {
  id: string;
  title: string;
  kind: string;
  compute: InteractionSpec["compute"];
  revision: number;
};

export function listInteractionSummaries(
  projectRoot: string,
  kindPrefix?: string,
): InteractionSummary[] {
  const prefix = kindPrefix?.trim().toLowerCase();
  const out: InteractionSummary[] = [];
  for (const id of listInteractionIds(projectRoot)) {
    const { spec } = readInteractionSpec(projectRoot, id);
    if (!spec) continue;
    if (prefix && !spec.kind.toLowerCase().startsWith(prefix)) continue;
    out.push({
      id: spec.id,
      title: spec.title,
      kind: spec.kind,
      compute: spec.compute,
      revision: spec.revision,
    });
  }
  return out;
}

export function upsertInteractionSpec(
  projectRoot: string,
  incoming: InteractionSpec,
): { ok: boolean; spec?: InteractionSpec; error?: string; created?: boolean } {
  if (!isValidInteractionId(incoming.id)) {
    return { ok: false, error: "invalid id" };
  }
  if (!isAllowedInteractionKind(incoming.kind)) {
    return { ok: false, error: "unsupported kind" };
  }

  const existing = readInteractionSpec(projectRoot, incoming.id);
  let revision = incoming.revision;
  if (existing.spec) {
    if (!revision || revision <= existing.spec.revision) {
      revision = existing.spec.revision + 1;
    }
  } else if (!revision || revision < 1) {
    revision = 1;
  }

  const merged: InteractionSpec = existing.spec
    ? {
        ...existing.spec,
        ...incoming,
        id: incoming.id,
        revision,
      }
    : { ...incoming, revision };

  const parsed = parseInteractionSpec(merged);
  if (!parsed) return { ok: false, error: "invalid spec" };

  if (isFigureStaticKind(parsed.kind)) {
    const figureCheck = validateFigureStaticSpec(projectRoot, parsed, existsSync);
    if (!figureCheck.ok) {
      return { ok: false, error: figureCheck.error };
    }
  } else if (isInteractionPlotKind(parsed.kind)) {
    const plotCheck = validatePlotSpec(projectRoot, parsed, existsSync);
    if (!plotCheck.ok) {
      return { ok: false, error: plotCheck.error };
    }
  }

  const write = writeInteractionSpec(projectRoot, parsed);
  if (!write.ok) return { ok: false, error: write.error };
  return { ok: true, spec: parsed, created: !existing.spec };
}
