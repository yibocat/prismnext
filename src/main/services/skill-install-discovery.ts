import { createHash, randomUUID } from "node:crypto";
import type {
  DiscoveryInstallOrigin,
  SkillPackageOption,
} from "../../shared/skill-install-types";
import {
  fetchRegistryIndex,
  installRegistrySkill,
  normalizeRegistryIndexUrl,
  skillNameToFolderId,
  type RegistrySkillEntry,
} from "./skills-registry";
import { libraryCardForRegistryUrl } from "../../shared/skill-libraries";

const CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedDiscoveryIndex {
  indexUrl: string;
  skills: RegistrySkillEntry[];
  createdAt: number;
}

const discoveryCache = new Map<string, CachedDiscoveryIndex>();

function pruneExpiredDiscoveryCache(): void {
  const now = Date.now();
  for (const [key, entry] of discoveryCache.entries()) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      discoveryCache.delete(key);
    }
  }
}

export function getCachedDiscoveryIndex(cacheKey: string): CachedDiscoveryIndex | null {
  const entry = discoveryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    discoveryCache.delete(cacheKey);
    return null;
  }
  return entry;
}

export function registryPackageId(entry: RegistrySkillEntry): string {
  return skillNameToFolderId(entry.name);
}

function packagesFromRegistry(indexUrl: string, skills: RegistrySkillEntry[]): SkillPackageOption[] {
  return skills
    .map((skill) => ({
      id: registryPackageId(skill),
      name: skill.name,
      description: skill.description || skill.name,
      path: skill.name,
      hasRequirements: false,
      artifactUrl: skill.url,
      artifactType: skill.type,
      artifactFiles: skill.files,
      indexUrl,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function analyzeDiscoverySkillSource(input: string): Promise<{
  cacheKey: string;
  origin: DiscoveryInstallOrigin;
  label: string;
  packages: SkillPackageOption[];
  warnings: string[];
}> {
  pruneExpiredDiscoveryCache();
  const { indexUrl, skills } = await fetchRegistryIndex(input);
  if (skills.length === 0) {
    throw new Error("Registry index contains no installable skills.");
  }

  const cacheKey = createHash("sha256")
    .update(`${indexUrl}:${Date.now()}:${randomUUID()}`)
    .digest("hex")
    .slice(0, 24);

  discoveryCache.set(cacheKey, { indexUrl, skills, createdAt: Date.now() });

  const card = libraryCardForRegistryUrl(indexUrl);
  const warnings: string[] = [];
  if (skills.some((skill) => skill.type === "archive")) {
    warnings.push("Archive skills install as full packages (tar/zip).");
  }

  return {
    cacheKey,
    origin: { adapter: "discovery", indexUrl },
    label: card.name,
    packages: packagesFromRegistry(indexUrl, skills),
    warnings,
  };
}

export async function installDiscoveryPackages(
  projectRoot: string,
  cacheKey: string,
  packageIds: string[],
  origin: DiscoveryInstallOrigin,
): Promise<string[]> {
  const cached = getCachedDiscoveryIndex(cacheKey);
  if (!cached || cached.indexUrl !== origin.indexUrl) {
    throw new Error("Install session expired — analyze the source again.");
  }

  const installedIds: string[] = [];
  for (const packageId of packageIds) {
    const entry = cached.skills.find((skill) => registryPackageId(skill) === packageId);
    if (!entry) throw new Error(`Skill package not found: ${packageId}`);
    await installRegistrySkill(projectRoot, entry, cached.indexUrl);
    installedIds.push(packageId);
  }
  return installedIds;
}

export function clearDiscoveryCacheForTests(): void {
  discoveryCache.clear();
}
