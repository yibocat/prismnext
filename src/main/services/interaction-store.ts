import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isValidInteractionId,
  isAllowedInteractionKind,
  parseInteractionSpec,
  type InteractionSpec,
} from "../../shared/interaction-spec";

const ARTIFACTS_REL = join(".prismnext", "artifacts");

export function interactionArtifactsDir(projectRoot: string): string {
  return join(projectRoot, ARTIFACTS_REL);
}

export function interactionSpecPath(projectRoot: string, id: string): string {
  return join(interactionArtifactsDir(projectRoot), id, "spec.json");
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
  try {
    writeFileSync(abs, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch (e) {
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

  const write = writeInteractionSpec(projectRoot, parsed);
  if (!write.ok) return { ok: false, error: write.error };
  return { ok: true, spec: parsed, created: !existing.spec };
}
