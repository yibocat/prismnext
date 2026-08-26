import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sanitizeHostModelKeyMap, type SshProfile } from "../../shared/remote";
import { resolveWorkbenchHome } from "../workbench/home";

export type RemoteModelKeysMode = "gateway" | "remote";

type OverrideRow = { modelKeys?: RemoteModelKeysMode };

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
      if (modelKeys === "remote" || modelKeys === "gateway") {
        out[id] = { modelKeys };
      }
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

export function readDesktopModelSeed(): {
  aiApiKeys: Record<string, string>;
  aiBaseUrls: Record<string, string>;
  extraBaseUrls: string[];
  wrapKey: string;
} {
  try {
    const settingsMod = require("../app/settings") as typeof import("../app/settings");
    const settings = settingsMod.getSettings() as {
      aiApiKeys?: Record<string, string>;
      aiBaseUrls?: Record<string, string>;
    };
    const aiApiKeys = sanitizeHostModelKeyMap(settings.aiApiKeys);
    const aiBaseUrls = Object.fromEntries(
      Object.entries(settings.aiBaseUrls ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0,
      ),
    );
    return {
      aiApiKeys,
      aiBaseUrls,
      extraBaseUrls: Object.values(aiBaseUrls),
      wrapKey: settingsMod.getOrCreateRemoteHostWrapKey(),
    };
  } catch {
    return { aiApiKeys: {}, aiBaseUrls: {}, extraBaseUrls: [], wrapKey: "" };
  }
}
