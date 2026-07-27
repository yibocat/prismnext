import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  isValidInteractionId,
  isAllowedInteractionKind,
  parseInteractionSpec,
  type InteractionSpec,
} from "../../shared/interaction-spec";
import { dryRunSceneSource } from "../../shared/interaction-scene-eval";
import {
  isBuiltinSceneEntry,
  resolveSceneEntry,
  DEFAULT_SCENE_ENTRY,
} from "../../shared/interaction-scene";
import {
  isInteractionSceneIrKind,
  validateSceneIrSpec,
} from "../../shared/interaction-scene-ir";
import {
  isInteractionFigureKind,
  resolveFigureDisplay,
} from "../../shared/interaction-figure";

const ARTIFACTS_REL = join(".prismnext", "artifacts");
const LAST_ERROR_FILE = ".last-error.json";

export type InteractionLastError = {
  at: string;
  message: string;
  phase?: "load" | "mount" | "update";
};

export function interactionArtifactsDir(projectRoot: string): string {
  return join(projectRoot, ARTIFACTS_REL);
}

export function interactionSpecPath(projectRoot: string, id: string): string {
  return join(interactionArtifactsDir(projectRoot), id, "spec.json");
}

export function interactionLastErrorPath(projectRoot: string, id: string): string {
  return join(interactionArtifactsDir(projectRoot), id, LAST_ERROR_FILE);
}

export function interactionScenePath(
  projectRoot: string,
  id: string,
  entry = DEFAULT_SCENE_ENTRY,
): string {
  return join(interactionArtifactsDir(projectRoot), id, entry);
}

export function readInteractionLastError(
  projectRoot: string,
  id: string,
): InteractionLastError | null {
  if (!isValidInteractionId(id)) return null;
  const abs = interactionLastErrorPath(projectRoot, id);
  if (!existsSync(abs)) return null;
  try {
    const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
    const message = typeof raw.message === "string" ? raw.message.trim() : "";
    if (!message) return null;
    const at =
      typeof raw.at === "string" && raw.at.trim()
        ? raw.at.trim()
        : new Date().toISOString();
    const phase =
      raw.phase === "load" || raw.phase === "mount" || raw.phase === "update"
        ? raw.phase
        : undefined;
    return { at, message, ...(phase ? { phase } : {}) };
  } catch {
    return null;
  }
}

export function writeInteractionLastError(
  projectRoot: string,
  id: string,
  error: { message: string; phase?: InteractionLastError["phase"] },
): { ok: boolean; error?: string } {
  if (!isValidInteractionId(id)) return { ok: false, error: "invalid id" };
  const message = typeof error.message === "string" ? error.message.trim() : "";
  if (!message) return { ok: false, error: "empty message" };
  const dir = join(interactionArtifactsDir(projectRoot), id);
  mkdirSync(dir, { recursive: true });
  const payload: InteractionLastError = {
    at: new Date().toISOString(),
    message,
    ...(error.phase ? { phase: error.phase } : {}),
  };
  try {
    writeFileSync(
      interactionLastErrorPath(projectRoot, id),
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "write failed" };
  }
}

export function clearInteractionLastError(
  projectRoot: string,
  id: string,
): { ok: boolean } {
  if (!isValidInteractionId(id)) return { ok: false };
  const abs = interactionLastErrorPath(projectRoot, id);
  if (!existsSync(abs)) return { ok: true };
  try {
    unlinkSync(abs);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function readInteractionSpec(
  projectRoot: string,
  id: string,
): { spec: InteractionSpec | null; error?: string } {
  if (!isValidInteractionId(id)) {
    return { spec: null, error: "invalid id" };
  }
  const abs = interactionSpecPath(projectRoot, id);
  if (!existsSync(abs)) {
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

  const dir = join(interactionArtifactsDir(projectRoot), parsed.id);
  mkdirSync(dir, { recursive: true });
  const abs = join(dir, "spec.json");
  const payload = `${JSON.stringify(parsed, null, 2)}\n`;
  const tmp = join(dir, `.spec.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, payload, "utf8");
    renameSync(tmp, abs);
    return { ok: true };
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore cleanup failure */
    }
    return { ok: false, error: e instanceof Error ? e.message : "write failed" };
  }
}

/**
 * Persist artifact-relative scene.js (or custom entry). Validates hard bans first.
 */
export function writeInteractionSceneSource(
  projectRoot: string,
  id: string,
  source: string,
  entry = DEFAULT_SCENE_ENTRY,
): { ok: boolean; error?: string; relativePath?: string } {
  if (!isValidInteractionId(id)) {
    return { ok: false, error: "invalid id" };
  }
  const file = (entry || DEFAULT_SCENE_ENTRY).trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !file ||
    file.includes("..") ||
    file.startsWith("/") ||
    /^[A-Za-z]:/.test(file) ||
    !/\.(mjs|js|cjs)$/i.test(file) ||
    file.startsWith("builtin:")
  ) {
    return { ok: false, error: "invalid scene entry path" };
  }
  const text = typeof source === "string" ? source : "";
  if (!text.trim()) {
    return { ok: false, error: "sceneSource is empty" };
  }
  const dry = dryRunSceneSource(text);
  if (!dry.ok) {
    return { ok: false, error: dry.error };
  }

  const dir = join(interactionArtifactsDir(projectRoot), id);
  mkdirSync(dir, { recursive: true });
  const abs = join(dir, file);
  try {
    writeFileSync(abs, text.endsWith("\n") ? text : `${text}\n`, "utf8");
    clearInteractionLastError(projectRoot, id);
    return {
      ok: true,
      relativePath: `.prismnext/artifacts/${id}/${file}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "write scene failed" };
  }
}

export function sceneSourceExists(
  projectRoot: string,
  id: string,
  entry = DEFAULT_SCENE_ENTRY,
): boolean {
  if (!isValidInteractionId(id)) return false;
  const file = (entry || DEFAULT_SCENE_ENTRY).trim();
  if (!file || file.startsWith("builtin:")) return false;
  const abs = interactionScenePath(projectRoot, id, file);
  if (!existsSync(abs)) return false;
  try {
    return readFileSync(abs, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}

/** True when scene.program needs a custom script on disk (not a builtin entry). */
export function sceneProgramNeedsSource(spec: InteractionSpec): boolean {
  if (spec.kind !== "scene.program") return false;
  const entry = resolveSceneEntry(spec);
  if (!entry) return true;
  return !isBuiltinSceneEntry(entry);
}

export function listInteractionIds(projectRoot: string): string[] {
  const root = interactionArtifactsDir(projectRoot);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const id = name.name;
    if (!isValidInteractionId(id)) continue;
    if (existsSync(join(root, id, "spec.json"))) out.push(id);
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

  if (isInteractionSceneIrKind(parsed.kind)) {
    const ir = validateSceneIrSpec(parsed);
    if (!ir.ok) return { ok: false, error: ir.error };
  }

  if (isInteractionFigureKind(parsed.kind)) {
    const fig = resolveFigureDisplay(parsed);
    if (!fig.ok) return { ok: false, error: fig.error };
    const abs = join(projectRoot, fig.path);
    if (!existsSync(abs)) {
      return {
        ok: false,
        error:
          `figure resource not found on disk: ${fig.path}. ` +
          `Save PNG/HTML under .prismnext/artifacts/${parsed.id}/ first, then ` +
          `resources: [{ role: "figure", path: "<filename>.png" }]`,
      };
    }
  }

  const write = writeInteractionSpec(projectRoot, parsed);
  if (!write.ok) return { ok: false, error: write.error };
  return { ok: true, spec: parsed, created: !existing.spec };
}
