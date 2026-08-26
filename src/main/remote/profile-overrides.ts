import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_REMOTE_SYNC_MODE,
  isRemoteSyncMode,
  type RemoteModelKeysMode,
  type RemoteSyncMode,
  type SshProfile,
} from "../../shared/remote";
import { resolveWorkbenchHome } from "../workbench/home";

export type { RemoteModelKeysMode };

type OverrideRow = { modelKeys?: RemoteModelKeysMode; syncMode?: RemoteSyncMode };

function overridesPath(): string {
  return join(resolveWorkbenchHome(), "ssh", "profile-overrides.json");
}

export function readProfileOverrides(): Record<string, OverrideRow> {
  try {
    const parsed = JSON.parse(readFileSync(overridesPath(), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, OverrideRow> = {};
    for (const [id, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const modelKeys = (row as OverrideRow).modelKeys;
      const syncMode = (row as OverrideRow).syncMode;
      const next: OverrideRow = {};
      if (modelKeys === "remote" || modelKeys === "gateway") next.modelKeys = modelKeys;
      if (isRemoteSyncMode(syncMode)) next.syncMode = syncMode;
      if (next.modelKeys || next.syncMode) out[id] = next;
    }
    return out;
  } catch {
    return {};
  }
}

export function applyProfileOverrides(profile: SshProfile): SshProfile {
  const extra = readProfileOverrides()[profile.id];
  if (!extra?.modelKeys) return profile;
  return { ...profile, modelKeys: extra.modelKeys };
}

export function writeProfileModelKeys(profileId: string, modelKeys: RemoteModelKeysMode): void {
  const id = profileId.trim();
  if (!id) return;
  const all = readProfileOverrides();
  all[id] = { ...all[id], modelKeys };
  const path = overridesPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(all, null, 2)}\n`, "utf8");
}

export function profileModelKeys(profile: SshProfile | null | undefined): RemoteModelKeysMode {
  return profile?.modelKeys === "gateway" ? "gateway" : "remote";
}

export function writeProfileSyncMode(profileId: string, syncMode: RemoteSyncMode): void {
  const id = profileId.trim();
  if (!id || !isRemoteSyncMode(syncMode)) return;
  const all = readProfileOverrides();
  all[id] = { ...all[id], syncMode };
  const path = overridesPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(all, null, 2)}\n`, "utf8");
}

export function profileSyncMode(profileId: string): RemoteSyncMode {
  const extra = readProfileOverrides()[profileId.trim()];
  return extra?.syncMode && isRemoteSyncMode(extra.syncMode)
    ? extra.syncMode
    : DEFAULT_REMOTE_SYNC_MODE;
}

export function sessionMirrorEnabled(profileId: string): boolean {
  return profileSyncMode(profileId) !== "online-only";
}
