import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  SkillInstallRecord,
  SkillPackageInstallSelection,
  SkillSourceAnalysis,
} from "../../shared/skill-install-types";
import {
  PRISM_LOCAL_SKILLS_REL,
  readSkillsManifest,
  recordSkillInstalls,
} from "./skills-sync";
import {
  analyzeDiscoverySkillSource,
  getCachedDiscoveryIndex,
  installDiscoveryPackages,
  registryPackageId,
} from "./skill-install-discovery";
import {
  analyzeGitHubSkillSource,
  copyGitHubSkillPaths,
  getCachedGitHubExtract,
  parseGitHubInput,
  readSkillVersionFromDir,
  scanSkillPackagesAtRoot,
} from "./skill-install-github";
import { parseSha256Digest, sha256Hex } from "./skill-install-digest";
import { checkSkillUpdate, checkSkillUpdates } from "./skill-install-updates";
import { normalizeRegistryIndexUrl } from "./skills-registry";

export { checkSkillUpdate, checkSkillUpdates };
export type { SkillUpdateInfo } from "../../shared/skill-install-types";

function isLikelyRegistryInput(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.endsWith("index.json")) return true;
  if (trimmed.includes("/.well-known/")) return true;
  if (parseGitHubInput(trimmed)) return false;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return !url.hostname.replace(/^www\./, "").includes("github.com");
  } catch {
    return false;
  }
}

export async function analyzeSkillSource(input: string): Promise<SkillSourceAnalysis> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Enter a GitHub repository URL, registry hostname, or index.json link.");
  }

  if (isLikelyRegistryInput(trimmed) && !parseGitHubInput(trimmed)) {
    const discovery = await analyzeDiscoverySkillSource(trimmed);
    return {
      adapter: "discovery",
      label: discovery.label,
      cacheKey: discovery.cacheKey,
      origin: discovery.origin,
      packages: discovery.packages,
      warnings: discovery.warnings,
    };
  }

  const github = await analyzeGitHubSkillSource(trimmed);
  return {
    adapter: "github",
    label: github.label,
    cacheKey: github.cacheKey,
    origin: github.origin,
    packages: github.packages,
    sharedBundle: github.sharedBundle,
    warnings: github.warnings,
  };
}

async function installGitHubPackages(
  projectRoot: string,
  selection: SkillPackageInstallSelection,
): Promise<{
  installedIds: string[];
  extrasBySkillId: Record<string, { packagePath?: string }>;
}> {
  const cached = getCachedGitHubExtract(selection.cacheKey);
  if (!cached) {
    throw new Error("Install session expired — analyze the source again.");
  }

  const scanRoot = cached.parsed.subPath
    ? join(cached.repoRoot, cached.parsed.subPath)
    : cached.repoRoot;
  const scanned = scanSkillPackagesAtRoot(cached.repoRoot, scanRoot);

  const pathsToCopy: string[] = [];
  const extrasBySkillId: Record<string, { packagePath?: string }> = {};
  for (const packageId of selection.packageIds) {
    const pkg = scanned.packages.find((p) => p.id === packageId);
    if (!pkg) throw new Error(`Skill package not found: ${packageId}`);
    pathsToCopy.push(pkg.path);
    extrasBySkillId[packageId] = { packagePath: pkg.path };
  }

  if (selection.includeShared && scanned.sharedBundle) {
    if (!pathsToCopy.includes(scanned.sharedBundle.path)) {
      pathsToCopy.unshift(scanned.sharedBundle.path);
    }
  }

  const installedFolderIds = copyGitHubSkillPaths(
    projectRoot,
    PRISM_LOCAL_SKILLS_REL,
    cached.repoRoot,
    pathsToCopy,
  );

  return {
    installedIds: installedFolderIds.filter((id) => id !== "_shared"),
    extrasBySkillId,
  };
}

function digestInstalledSkillMd(projectRoot: string, skillId: string): string | undefined {
  const skillMd = join(projectRoot, PRISM_LOCAL_SKILLS_REL, skillId, "SKILL.md");
  if (!existsSync(skillMd)) return undefined;
  return sha256Hex(readFileSync(skillMd, "utf-8"));
}

function buildInstallRecords(
  projectRoot: string,
  skillIds: string[],
  origin: SkillPackageInstallSelection["origin"],
  extrasBySkillId: Record<string, { packagePath?: string; registryDigest?: string }> = {},
): SkillInstallRecord[] {
  return skillIds.map((skillId) => {
    const extras = extrasBySkillId[skillId] ?? {};
    return {
      skillId,
      origin,
      installedAt: new Date().toISOString(),
      contentVersion: readSkillVersionFromDir(join(projectRoot, PRISM_LOCAL_SKILLS_REL, skillId)),
      contentDigest: digestInstalledSkillMd(projectRoot, skillId),
      registryDigest: extras.registryDigest,
      packagePath: extras.packagePath,
    };
  });
}

export async function installSkillPackages(
  projectRoot: string,
  selection: SkillPackageInstallSelection,
): Promise<{ installedIds: string[] }> {
  let installedIds: string[] = [];
  const extrasBySkillId: Record<string, { packagePath?: string; registryDigest?: string }> = {};

  if (selection.origin.adapter === "github") {
    const githubResult = await installGitHubPackages(projectRoot, selection);
    installedIds = githubResult.installedIds;
    Object.assign(extrasBySkillId, githubResult.extrasBySkillId);
  } else if (selection.origin.adapter === "discovery") {
    installedIds = await installDiscoveryPackages(
      projectRoot,
      selection.cacheKey,
      selection.packageIds,
      selection.origin,
    );
    const cached = getCachedDiscoveryIndex(selection.cacheKey);
    if (cached) {
      for (const skillId of installedIds) {
        const entry = cached.skills.find((skill) => registryPackageId(skill) === skillId);
        const registryDigest = parseSha256Digest(entry?.digest) ?? undefined;
        if (registryDigest) {
          extrasBySkillId[skillId] = { registryDigest };
        }
      }
    }
  } else {
    throw new Error(`Unsupported install adapter: ${(selection.origin as { adapter: string }).adapter}`);
  }

  recordSkillInstalls(
    projectRoot,
    buildInstallRecords(projectRoot, installedIds, selection.origin, extrasBySkillId),
  );
  return { installedIds };
}

export async function reinstallSkill(
  projectRoot: string,
  skillId: string,
): Promise<{ installedIds: string[] }> {
  const manifest = readSkillsManifest(projectRoot);
  const record = (manifest.installs ?? []).find((item) => item.skillId === skillId);
  if (!record) {
    throw new Error("This skill has no recorded install source — reinstall from Install skills.");
  }

  if (record.origin.adapter === "github") {
    const githubUrl = record.origin.path
      ? `https://github.com/${record.origin.repo}/tree/${record.origin.ref}/${record.origin.path}`
      : `https://github.com/${record.origin.repo}@${record.origin.ref}`;
    const analysis = await analyzeGitHubSkillSource(githubUrl);
    const cached = getCachedGitHubExtract(analysis.cacheKey);
    if (!cached) throw new Error("Install session expired — try again.");

    const scanRoot = cached.parsed.subPath
      ? join(cached.repoRoot, cached.parsed.subPath)
      : cached.repoRoot;
    const scanned = scanSkillPackagesAtRoot(cached.repoRoot, scanRoot);
    const target = scanned.packages.find((pkg) => pkg.id === skillId);
    if (!target) {
      throw new Error(`Skill "${skillId}" was not found in the GitHub source.`);
    }

    return installSkillPackages(projectRoot, {
      cacheKey: analysis.cacheKey,
      packageIds: [skillId],
      includeShared: Boolean(scanned.sharedBundle),
      origin: analysis.origin,
    });
  }

  if (record.origin.adapter === "discovery") {
    const analysis = await analyzeDiscoverySkillSource(record.origin.indexUrl);
    if (!analysis.packages.some((pkg) => pkg.id === skillId)) {
      throw new Error(`Skill "${skillId}" is no longer listed in the registry index.`);
    }
    return installSkillPackages(projectRoot, {
      cacheKey: analysis.cacheKey,
      packageIds: [skillId],
      includeShared: false,
      origin: analysis.origin,
    });
  }

  throw new Error("Unsupported install source for reinstall.");
}

/** Resolve discovery package id from registry skill name (for tests). */
export { registryPackageId, normalizeRegistryIndexUrl };
