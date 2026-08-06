import { app } from "electron";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PRISM_SKILLS_REL } from "./skills-sync";

export type BundledSkillCategory = "academic" | "general";

export interface BundledSkillInfo {
  id: string;
  name: string;
  description: string;
  category: BundledSkillCategory;
  license?: string;
}

interface BundledSkillsManifest {
  skills?: BundledSkillInfo[];
}

/** Resolve bundled skills directory (dev + packaged). */
export function getBundledSkillsDir(): string {
  // `app` is undefined outside the Electron runtime (e.g. vitest) — fall back
  // to the repo layout so pure-node callers keep working.
  if (!app) return join(process.cwd(), "resources", "skills");
  return app.isPackaged
    ? join(process.resourcesPath, "resources", "skills")
    : join(app.getAppPath(), "resources", "skills");
}

export function listBundledSkills(): BundledSkillInfo[] {
  const manifestPath = join(getBundledSkillsDir(), "manifest.json");
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundledSkillsManifest;
    return Array.isArray(manifest.skills) ? manifest.skills : [];
  } catch {
    return [];
  }
}

export function readBundledSkillMd(skillId: string): string | null {
  const skillPath = join(getBundledSkillsDir(), skillId, "SKILL.md");
  if (!existsSync(skillPath)) return null;
  return readFileSync(skillPath, "utf-8");
}

/** Copy bundled skill folder into the project skills directory. */
export function copyBundledSkillToProject(projectRoot: string, skillId: string): void {
  const srcDir = join(getBundledSkillsDir(), skillId);
  const skillMd = join(srcDir, "SKILL.md");
  if (!existsSync(skillMd)) {
    throw new Error(`Bundled skill not found: ${skillId}`);
  }
  const destDir = join(projectRoot, PRISM_SKILLS_REL, skillId);
  mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true, force: true });
}
