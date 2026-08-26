import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_REMOTE_MAX_FILE_BYTES,
  RemoteOperationError,
  parseRemoteAbs,
  shouldExcludeRemoteSyncPath,
  type RemoteSyncKind,
  type RemoteSyncManifest,
  type RemoteSyncProgress,
} from "../../shared/remote";
import { remoteCacheRel } from "../../shared/workbench/paths";
import { resolveWorkbenchHome } from "../workbench/home";

export const REMOTE_SYNC_PROGRESS_CHANNEL = "remote:syncProgress";

const BLOB_CHUNK = 4 * 1024 * 1024;

export interface RemoteSyncBroker {
  isBound(profileId: string): boolean;
  invoke(profileId: string, method: string, params: unknown): Promise<unknown>;
}

export interface SyncFileInput {
  profileId: string;
  projectId: string;
  remoteAbs: string;
  destRel?: string;
}

type ProgressFn = (progress: RemoteSyncProgress) => void;

let cancelled = false;

export function cancelRemoteSync(): void {
  cancelled = true;
}

export function resetRemoteSyncForTests(): void {
  cancelled = false;
}

function assertNotCancelled(): void {
  if (cancelled) {
    throw new RemoteOperationError("sync_cancelled", "Sync cancelled.");
  }
}

export function remoteCacheRoot(profileId: string, projectId: string, home = resolveWorkbenchHome()): string {
  return join(home, ...remoteCacheRel(profileId, projectId).split("/"));
}

function manifestPath(cacheRoot: string): string {
  return join(cacheRoot, "manifest.json");
}

export function readSyncManifest(cacheRoot: string): RemoteSyncManifest {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath(cacheRoot), "utf8")) as RemoteSyncManifest;
    if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === "object") return parsed;
  } catch {
    // missing or corrupt
  }
  return { version: 1, profileId: "", projectId: "", entries: {} };
}

function writeSyncManifest(cacheRoot: string, manifest: RemoteSyncManifest): void {
  mkdirSync(cacheRoot, { recursive: true });
  writeFileSync(manifestPath(cacheRoot), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function pullRemoteBlob(
  broker: RemoteSyncBroker,
  profileId: string,
  method: string,
  params: Record<string, unknown>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let offset = 0;
  for (;;) {
    assertNotCancelled();
    const raw = await broker.invoke(profileId, method, {
      ...params,
      offset,
      length: BLOB_CHUNK,
    }) as { bytes?: string; eof?: boolean };
    chunks.push(Buffer.from(String(raw.bytes ?? ""), "base64"));
    if (raw.eof || !raw.bytes) break;
    offset += BLOB_CHUNK;
  }
  return Buffer.concat(chunks);
}

function destRelFromRemoteAbs(remoteAbs: string, destRel?: string): string {
  if (destRel?.trim()) return destRel.replace(/\\/g, "/").replace(/^\/+/, "");
  const parsed = parseRemoteAbs(remoteAbs);
  const abs = parsed?.abs ?? remoteAbs;
  const parts = abs.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.slice(-3).join("/") || "file";
}

function writeCacheFile(absPath: string, bytes: Buffer): void {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp.${process.pid}`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, absPath);
}

export async function syncRemoteFile(
  broker: RemoteSyncBroker,
  input: SyncFileInput,
  onProgress?: ProgressFn,
): Promise<{ ok: true; path: string; skipped?: "exclude" | "too_large" } | { ok: false; error: string }> {
  cancelled = false;
  const profileId = input.profileId.trim();
  const projectId = input.projectId.trim();
  if (!profileId || !projectId) return { ok: false, error: "missing_project" };
  if (!broker.isBound(profileId)) {
    throw new RemoteOperationError("not_connected", "Not connected.");
  }
  const parsed = parseRemoteAbs(input.remoteAbs);
  const abs = parsed?.abs ?? input.remoteAbs;
  const rel = destRelFromRemoteAbs(input.remoteAbs, input.destRel);
  const cacheRoot = remoteCacheRoot(profileId, projectId);
  onProgress?.({ current: 0, total: 1, title: rel, kind: "file" });

  const st = await broker.invoke(profileId, "fs:stat", { absPath: abs, path: abs }) as {
    size?: number;
    mtimeMs?: number;
    isFile?: boolean;
  } | null;
  const size = typeof st?.size === "number" ? st.size : 0;
  const gate = shouldExcludeRemoteSyncPath(rel, size);
  if (gate.exclude) {
    if (gate.reason === "too_large") {
      throw new RemoteOperationError("sync_too_large", `File is larger than ${DEFAULT_REMOTE_MAX_FILE_BYTES} bytes.`);
    }
    return { ok: true, path: join(cacheRoot, "files", rel), skipped: gate.reason };
  }

  const bytes = await pullRemoteBlob(broker, profileId, "fs:readBlob", { path: abs, absPath: abs });
  const dest = join(cacheRoot, "files", rel);
  writeCacheFile(dest, bytes);
  const manifest = readSyncManifest(cacheRoot);
  manifest.profileId = profileId;
  manifest.projectId = projectId;
  manifest.entries[rel] = {
    relPath: rel,
    size: bytes.byteLength,
    sha256: sha256Bytes(bytes),
    mtimeMs: typeof st?.mtimeMs === "number" ? st.mtimeMs : Date.now(),
  };
  writeSyncManifest(cacheRoot, manifest);
  onProgress?.({ current: 1, total: 1, title: rel, kind: "file" });
  return { ok: true, path: dest };
}

export async function syncRemotePaperPdf(
  broker: RemoteSyncBroker,
  input: { projectRoot: string; paperId: string; projectId: string },
  onProgress?: ProgressFn,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  cancelled = false;
  const parsed = parseRemoteAbs(input.projectRoot);
  if (!parsed) return { ok: false, error: "not_remote" };
  if (!broker.isBound(parsed.profileId)) {
    throw new RemoteOperationError("not_connected", "Not connected.");
  }
  const paperId = input.paperId.trim();
  onProgress?.({ current: 0, total: 1, title: paperId, kind: "pdf" });
  const raw = await broker.invoke(parsed.profileId, "literature:readPdfBytes", {
    projectRoot: parsed.abs,
    paperId,
  }) as { bytes?: ArrayBuffer | Uint8Array | string } | Uint8Array | ArrayBuffer | null;
  let bytes: Buffer;
  if (Buffer.isBuffer(raw)) {
    bytes = raw;
  } else if (raw instanceof Uint8Array) {
    bytes = Buffer.from(raw);
  } else if (raw && typeof raw === "object" && "bytes" in raw) {
    const payload = raw.bytes;
    if (typeof payload === "string") bytes = Buffer.from(payload, "base64");
    else if (payload instanceof Uint8Array) bytes = Buffer.from(payload);
    else if (payload instanceof ArrayBuffer) bytes = Buffer.from(payload);
    else return { ok: false, error: "no_pdf" };
  } else {
    return { ok: false, error: "no_pdf" };
  }
  const gate = shouldExcludeRemoteSyncPath(`${paperId}.pdf`, bytes.byteLength);
  if (gate.reason === "too_large") {
    throw new RemoteOperationError("sync_too_large", "PDF is larger than the on-demand limit.");
  }
  const dest = join(remoteCacheRoot(parsed.profileId, input.projectId), "papers", `${paperId}.pdf`);
  writeCacheFile(dest, bytes);
  onProgress?.({ current: 1, total: 1, title: paperId, kind: "pdf" });
  return { ok: true, path: dest };
}

export async function syncRemoteExperimentArtifacts(
  broker: RemoteSyncBroker,
  input: { projectRoot: string; projectId: string; experimentId: string },
  onProgress?: ProgressFn,
): Promise<{ ok: true; paths: string[]; skipped: number }> {
  cancelled = false;
  const parsed = parseRemoteAbs(input.projectRoot);
  if (!parsed) throw new RemoteOperationError("protocol", "Not a remote project.");
  if (!broker.isBound(parsed.profileId)) {
    throw new RemoteOperationError("not_connected", "Not connected.");
  }
  const listed = await broker.invoke(parsed.profileId, "experiment:listArtifactRels", {
    projectRoot: parsed.abs,
    id: input.experimentId,
  }) as { rels?: string[] };
  const rels = Array.isArray(listed?.rels) ? listed.rels : [];
  const paths: string[] = [];
  let skipped = 0;
  let current = 0;
  for (const rel of rels) {
    assertNotCancelled();
    onProgress?.({ current, total: rels.length, title: rel, kind: "experiment" });
    const gate = shouldExcludeRemoteSyncPath(rel);
    if (gate.exclude) {
      skipped += 1;
      current += 1;
      continue;
    }
    const abs = `${parsed.abs.replace(/\/$/, "")}/${rel.replace(/^\/+/, "")}`;
    const bytes = await pullRemoteBlob(broker, parsed.profileId, "fs:readBlob", { path: abs });
    if (shouldExcludeRemoteSyncPath(rel, bytes.byteLength).reason === "too_large") {
      skipped += 1;
      current += 1;
      continue;
    }
    const dest = join(
      remoteCacheRoot(parsed.profileId, input.projectId),
      "experiments",
      input.experimentId,
      rel,
    );
    writeCacheFile(dest, bytes);
    paths.push(dest);
    current += 1;
  }
  onProgress?.({ current: rels.length, total: rels.length, title: input.experimentId, kind: "experiment" });
  return { ok: true, paths, skipped };
}

export function cacheKindDir(
  profileId: string,
  projectId: string,
  kind: Exclude<RemoteSyncKind, "skills">,
): string {
  const root = remoteCacheRoot(profileId, projectId);
  if (kind === "sessions") return join(root, "sessions");
  if (kind === "pdf") return join(root, "papers");
  if (kind === "experiment") return join(root, "experiments");
  return join(root, "files");
}
