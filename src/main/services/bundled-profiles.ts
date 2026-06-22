import { app } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentProfileDefinition } from "./agent-profiles";

interface BundledProfilesManifest {
  profiles?: AgentProfileDefinition[];
}

export function getBundledProfilesDir(): string {
  const devFallback = join(process.cwd(), "resources", "profiles");
  try {
    if (app.isPackaged) {
      return join(process.resourcesPath, "resources", "profiles");
    }
    const appPath = app.getAppPath();
    const resolved = join(appPath, "resources", "profiles");
    return existsSync(join(resolved, "manifest.json")) ? resolved : devFallback;
  } catch {
    return devFallback;
  }
}

export function listBundledProfileDefinitions(): AgentProfileDefinition[] {
  const manifestPath = join(getBundledProfilesDir(), "manifest.json");
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundledProfilesManifest;
    return Array.isArray(manifest.profiles) ? manifest.profiles : [];
  } catch {
    return [];
  }
}

export function readBundledProfileInstructions(profileId: string): string | null {
  const path = join(getBundledProfilesDir(), profileId, "instructions.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function readBundledProfileDefinition(profileId: string): AgentProfileDefinition | null {
  const path = join(getBundledProfilesDir(), profileId, "profile.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AgentProfileDefinition;
  } catch {
    return null;
  }
}
