import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  isValidInteractionId,
  isAllowedInteractionKind,
  parseInteractionSpec,
  type InteractionSpec,
} from "../../shared/interaction-spec";
import { validateInteractionForWrite } from "./interaction-validate";

const ARTIFACTS_REL = join(".prismnext", "artifacts");
const LAST_ERROR_FILE = ".last-error.json";
const THUMBNAIL_FILE = ".thumbnail.png";

function stampBoundResources(
  projectRoot: string,
  spec: InteractionSpec,
): { ok: true; spec: InteractionSpec } | { ok: false; error: string } {
  if (spec.compute !== "bound" || !spec.resources?.length) return { ok: true, spec };

  const resources = [];
  for (const resource of spec.resources) {
    const rawPath = (resource.path ?? resource.artifactPath)?.trim();
    if (!rawPath) {
      return { ok: false, error: "bound resources require a project-relative path" };
    }
    const absolute = resolve(projectRoot, rawPath);
    const projectRelative = relative(projectRoot, absolute);
    if (!projectRelative || projectRelative.startsWith("..") || isAbsolute(projectRelative)) {
      return { ok: false, error: `bound resource path escapes the project: ${JSON.stringify(rawPath)}` };
    }
    let data: Buffer;
    try {
      const stat = statSync(absolute);
      if (!stat.isFile()) return { ok: false, error: `bound resource is not a file: ${rawPath}` };
      data = readFileSync(absolute);
    } catch {
      return { ok: false, error: `bound resource not found on disk: ${rawPath}` };
    }
    resources.push({
      ...resource,
      path: projectRelative.replace(/\\/g, "/"),
      fingerprint: {
        algorithm: "sha256" as const,
        bytes: data.byteLength,
        digest: createHash("sha256").update(data).digest("hex"),
      },
    });
  }
  return { ok: true, spec: { ...spec, resources } };
}

export type InteractionLastError = {
  at: string;
  message: string;
  phase?: "load" | "mount" | "update" | "thumbnail";
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

export function interactionThumbnailPath(projectRoot: string, id: string): string {
  return join(interactionArtifactsDir(projectRoot), id, THUMBNAIL_FILE);
}

/** Offscreen-rendered `figure.plotly`/`instrument` screenshot (V4-B). Atomic write. */
export function writeInteractionThumbnail(
  projectRoot: string,
  id: string,
  png: Buffer,
): { ok: boolean; error?: string } {
  if (!isValidInteractionId(id)) return { ok: false, error: "invalid id" };
  const dir = join(interactionArtifactsDir(projectRoot), id);
  mkdirSync(dir, { recursive: true });
  const abs = interactionThumbnailPath(projectRoot, id);
  const tmp = join(dir, `.thumbnail.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, png);
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

export function deleteInteractionThumbnail(projectRoot: string, id: string): { ok: boolean } {
  if (!isValidInteractionId(id)) return { ok: false };
  const abs = interactionThumbnailPath(projectRoot, id);
  if (!existsSync(abs)) return { ok: true };
  try {
    unlinkSync(abs);
    return { ok: true };
  } catch {
    return { ok: false };
  }
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
      raw.phase === "load" ||
      raw.phase === "mount" ||
      raw.phase === "update" ||
      raw.phase === "thumbnail"
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

function readInteractionSpecUnchecked(projectRoot: string, id: string): InteractionSpec | null {
  const abs = interactionSpecPath(projectRoot, id);
  if (!existsSync(abs)) return null;
  try {
    const spec = parseInteractionSpec(JSON.parse(readFileSync(abs, "utf8")));
    return spec?.id === id ? spec : null;
  } catch {
    return null;
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
  if (!existsSync(abs)) return { spec: null, error: "not found" };
  const spec = readInteractionSpecUnchecked(projectRoot, id);
  if (!spec) return { spec: null, error: "invalid spec" };
  if (spec.compute === "bound" && spec.resources?.length) {
    const stamped = stampBoundResources(projectRoot, spec);
    if (!stamped.ok) return { spec: null, error: stamped.error };
    for (let i = 0; i < spec.resources.length; i++) {
      const expected = spec.resources[i]?.fingerprint;
      const actual = stamped.spec.resources?.[i]?.fingerprint;
      if (
        expected &&
        actual &&
        (expected.algorithm !== actual.algorithm ||
          expected.bytes !== actual.bytes ||
          expected.digest !== actual.digest)
      ) {
        return {
          spec: null,
          error:
            `bound resource changed: ${spec.resources[i]?.path ?? spec.resources[i]?.artifactPath}. ` +
            "Rewrite the Interaction to acknowledge the new resource revision.",
        };
      }
    }
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
  // A changed bound resource makes the artifact unreadable to consumers until
  // explicitly rewritten, but it must still participate in revision bumping.
  const existingSpec =
    existing.spec ??
    (existing.error?.startsWith("bound resource changed")
      ? readInteractionSpecUnchecked(projectRoot, incoming.id)
      : null);
  let revision = incoming.revision;
  if (existingSpec) {
    if (!revision || revision <= existingSpec.revision) {
      revision = existingSpec.revision + 1;
    }
  } else if (!revision || revision < 1) {
    revision = 1;
  }

  const merged: InteractionSpec = existingSpec
    ? {
        ...existingSpec,
        ...incoming,
        id: incoming.id,
        revision,
      }
    : { ...incoming, revision };

  let parsed = parseInteractionSpec(merged);
  if (!parsed) return { ok: false, error: "invalid spec" };

  const validated = validateInteractionForWrite(projectRoot, parsed);
  if (!validated.ok) return validated;
  parsed = validated.spec;

  const stamped = stampBoundResources(projectRoot, parsed);
  if (!stamped.ok) return { ok: false, error: stamped.error };
  parsed = stamped.spec;

  const write = writeInteractionSpec(projectRoot, parsed);
  if (!write.ok) return { ok: false, error: write.error };
  return { ok: true, spec: parsed, created: !existingSpec };
}
