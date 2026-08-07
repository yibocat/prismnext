import type { LibraryCatalogItem } from "../../shared/skill-library-types";
import { copyBundledSkillToProject, listBundledSkills } from "./bundled-skills";
import {
  analyzeGitHubSkillSource,
  githubSourceToAnalyzeUrl,
  parseGitHubInput,
  scanGitHubRepository,
} from "./skill-install-github";
import { fetchRegistryIndex, installRegistrySkill, type RegistrySkillEntry } from "./skills-registry";
import { installSkillPackages } from "./skill-install";
import {
  deleteProjectSkill,
  listLibrarySources,
  listProjectSkills,
  type SkillLibrarySourceInfo,
} from "./skills-sync";

function findSource(projectRoot: string, sourceId: string): SkillLibrarySourceInfo {
  const source = listLibrarySources(projectRoot).find((item) => item.id === sourceId);
  if (!source) {
    throw new Error(`Skill library source not found: ${sourceId}`);
  }
  return source;
}

export async function fetchLibraryCatalogForSource(
  projectRoot: string,
  source: SkillLibrarySourceInfo,
): Promise<LibraryCatalogItem[]> {
  if (source.kind === "bundled") {
    const bundled = listBundledSkills();
    return bundled.map((skill) => ({
      key: `bundled:${skill.id}`,
      skillId: skill.id,
      name: skill.name,
      description: skill.description,
      sourceId: source.id,
      sourceLabel: source.name,
      sourceKind: "bundled",
      category: skill.category,
    }));
  }

  if (source.kind === "github") {
    const parsed = parseGitHubInput(githubSourceToAnalyzeUrl(source));
    if (!parsed) {
      throw new Error("Invalid GitHub source configuration.");
    }
    const { packages } = await scanGitHubRepository(parsed);
    return packages.map((pkg) => ({
      key: `github:${source.id}:${pkg.id}`,
      skillId: pkg.id,
      name: pkg.name,
      description: pkg.description,
      sourceId: source.id,
      sourceLabel: source.name,
      sourceKind: "github",
      githubPackageId: pkg.id,
    }));
  }

  if (!source.url) {
    throw new Error("Registry source is missing a URL.");
  }

  const { skills, indexUrl } = await fetchRegistryIndex(source.url);
  return skills.map((skill) => ({
    key: `registry:${source.id}:${skill.name}`,
    skillId: skill.name.trim().toLowerCase(),
    name: skill.name,
    description: skill.description || skill.name,
    sourceId: source.id,
    sourceLabel: source.name,
    sourceKind: "remote",
    registrySkillName: skill.name,
    artifactUrl: skill.url,
    artifactType: skill.type,
    artifactFiles: skill.files,
    indexUrl,
  }));
}

export async function installLibraryCatalogItem(
  projectRoot: string,
  item: LibraryCatalogItem,
): Promise<{ installedIds: string[] }> {
  if (item.sourceKind === "bundled") {
    copyBundledSkillToProject(projectRoot, item.skillId);
    return { installedIds: [item.skillId] };
  }

  if (item.sourceKind === "github") {
    const source = findSource(projectRoot, item.sourceId);
    const analysis = await analyzeGitHubSkillSource(githubSourceToAnalyzeUrl(source));
    const packageId = item.githubPackageId ?? item.skillId;
    return installSkillPackages(projectRoot, {
      cacheKey: analysis.cacheKey,
      packageIds: [packageId],
      includeShared: Boolean(analysis.sharedBundle),
      origin: analysis.origin,
    });
  }

  if (!item.registrySkillName || !item.artifactUrl || !item.indexUrl) {
    throw new Error("Registry skill metadata is incomplete.");
  }
  const entry: RegistrySkillEntry = {
    name: item.registrySkillName,
    description: item.description,
    type: item.artifactType ?? "skill-md",
    url: item.artifactUrl,
    files: item.artifactFiles,
  };
  await installRegistrySkill(projectRoot, entry, item.indexUrl);
  return { installedIds: [item.skillId] };
}

export async function installAllFromLibrarySource(
  projectRoot: string,
  sourceId: string,
): Promise<{ installedIds: string[] }> {
  const source = findSource(projectRoot, sourceId);

  if (source.kind === "bundled") {
    const installedIds: string[] = [];
    for (const skill of listBundledSkills()) {
      copyBundledSkillToProject(projectRoot, skill.id);
      installedIds.push(skill.id);
    }
    return { installedIds };
  }

  if (source.kind !== "github") {
    throw new Error("Install all is only supported for built-in and GitHub sources.");
  }

  const analysis = await analyzeGitHubSkillSource(githubSourceToAnalyzeUrl(source));
  return installSkillPackages(projectRoot, {
    cacheKey: analysis.cacheKey,
    packageIds: analysis.packages.map((pkg) => pkg.id),
    includeShared: Boolean(analysis.sharedBundle),
    origin: analysis.origin,
  });
}

export async function uninstallAllFromLibrarySource(
  projectRoot: string,
  sourceId: string,
): Promise<{ removedIds: string[] }> {
  const source = findSource(projectRoot, sourceId);

  if (source.kind === "bundled") {
    const bundledIds = new Set(listBundledSkills().map((skill) => skill.id));
    const removedIds: string[] = [];
    for (const skill of listProjectSkills(projectRoot)) {
      if (!bundledIds.has(skill.id)) continue;
      deleteProjectSkill(projectRoot, skill.id);
      removedIds.push(skill.id);
    }
    return { removedIds };
  }

  throw new Error("Uninstall all is only supported for built-in skills.");
}

export async function fetchLibraryCatalog(
  projectRoot: string,
  sourceId: string,
): Promise<LibraryCatalogItem[]> {
  const source = findSource(projectRoot, sourceId);
  if (!source.connected) {
    return [];
  }
  return fetchLibraryCatalogForSource(projectRoot, source);
}
