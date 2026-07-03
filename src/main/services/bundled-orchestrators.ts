import { app } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OrchestratorDefinition } from "./agent-experts";

interface BundledOrchestratorsManifest {
  orchestrators?: OrchestratorDefinition[];
}

export function getBundledOrchestratorsDir(): string {
  const devFallback = join(process.cwd(), "resources", "orchestrators");
  try {
    if (app.isPackaged) {
      return join(process.resourcesPath, "resources", "orchestrators");
    }
    const appPath = app.getAppPath();
    const resolved = join(appPath, "resources", "orchestrators");
    return existsSync(join(resolved, "manifest.json")) ? resolved : devFallback;
  } catch {
    return devFallback;
  }
}

export function listBundledOrchestratorDefinitions(): OrchestratorDefinition[] {
  const manifestPath = join(getBundledOrchestratorsDir(), "manifest.json");
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundledOrchestratorsManifest;
    return Array.isArray(manifest.orchestrators) ? manifest.orchestrators : [];
  } catch {
    return [];
  }
}

export function readBundledOrchestratorInstructions(orchestratorId: string): string | null {
  const path = join(getBundledOrchestratorsDir(), orchestratorId, "instructions.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function readBundledOrchestratorDefinition(
  orchestratorId: string,
): OrchestratorDefinition | null {
  const path = join(getBundledOrchestratorsDir(), orchestratorId, "orchestrator.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as OrchestratorDefinition;
  } catch {
    return null;
  }
}
