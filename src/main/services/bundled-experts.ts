import { app } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExpertDefinition } from "./agent-experts";

interface BundledExpertsManifest {
  experts?: ExpertDefinition[];
}

export function getBundledExpertsDir(): string {
  const devFallback = join(process.cwd(), "resources", "experts");
  try {
    if (app.isPackaged) {
      return join(process.resourcesPath, "resources", "experts");
    }
    const appPath = app.getAppPath();
    const resolved = join(appPath, "resources", "experts");
    return existsSync(join(resolved, "manifest.json")) ? resolved : devFallback;
  } catch {
    return devFallback;
  }
}

export function listBundledExpertDefinitions(): ExpertDefinition[] {
  const manifestPath = join(getBundledExpertsDir(), "manifest.json");
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundledExpertsManifest;
    return Array.isArray(manifest.experts) ? manifest.experts : [];
  } catch {
    return [];
  }
}

export function readBundledExpertInstructions(expertId: string): string | null {
  const path = join(getBundledExpertsDir(), expertId, "instructions.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function readBundledExpertDefinition(expertId: string): ExpertDefinition | null {
  const path = join(getBundledExpertsDir(), expertId, "expert.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ExpertDefinition;
  } catch {
    return null;
  }
}
