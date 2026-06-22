import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export const PRISM_SKILLS_REL = ".prismnext/agent/skills";
export const SKILLS_MANIFEST_REL = ".prismnext/agent/skills-manifest.json";

const LEGACY_OPENCODE_ARTIFACTS = [
  ".opencode",
  ".prismnext/.opencode",
  ".prismnext/opencode",
] as const;

function normalizeProjectRoot(projectRoot: string): string {
  return basename(projectRoot) === ".prismnext" ? dirname(projectRoot) : projectRoot;
}

export const PRISM_CURATED_SOURCE_ID = "prism-curated";

export type SkillLibrarySourceKind = "bundled" | "remote";

export interface SkillLibrarySource {
  id: string;
  kind: SkillLibrarySourceKind;
  /** Normalized index.json URL for remote sources. */
  url?: string;
  /** When true, skills from this source appear in Skill library UI. */
  connected: boolean;
}

export interface SkillsManifest {
  disabled?: string[];
  /** @deprecated migrated to `sources` on read */
  registryUrls?: string[];
  sources?: SkillLibrarySource[];
}

export interface SkillLibrarySourceInfo extends SkillLibrarySource {
  name: string;
  description: string;
  removable: boolean;
}

export interface InstalledSkillInfo {
  id: string;
  name: string;
  description: string;
  skillDirRel: string;
  enabled: boolean;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

function parseFrontmatterField(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function parseSkillMd(content: string): { name: string; description: string } {
  const fm = content.match(FRONTMATTER_RE);
  if (!fm) return { name: "", description: "" };
  return {
    name: parseFrontmatterField(fm[1], "name"),
    description: parseFrontmatterField(fm[1], "description"),
  };
}

export function readSkillsManifest(projectRoot: string): SkillsManifest {
  const path = join(projectRoot, SKILLS_MANIFEST_REL);
  if (!existsSync(path)) {
    return { disabled: [], sources: defaultLibrarySources() };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as SkillsManifest;
    return {
      disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [],
      sources: normalizeLibrarySources(parsed),
    };
  } catch {
    return { disabled: [], sources: defaultLibrarySources() };
  }
}

function defaultLibrarySources(): SkillLibrarySource[] {
  return [{ id: PRISM_CURATED_SOURCE_ID, kind: "bundled", connected: true }];
}

function sourceIdForUrl(url: string): string {
  return `remote:${url}`;
}

function displayNameForSource(source: SkillLibrarySource): { name: string; description: string } {
  if (source.kind === "bundled") {
    return {
      name: "Prism Curated",
      description: "Skills bundled with the app — install copies into your project",
    };
  }
  const url = source.url ?? "";
  try {
    const hostname = new URL(url).hostname;
    return { name: hostname, description: "Remote skill registry" };
  } catch {
    return { name: url || "Remote registry", description: "Remote skill registry" };
  }
}

export function normalizeLibrarySources(manifest: SkillsManifest): SkillLibrarySource[] {
  let sources: SkillLibrarySource[] = [];

  if (Array.isArray(manifest.sources) && manifest.sources.length > 0) {
    sources = manifest.sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      url: s.url,
      connected: s.connected !== false,
    }));
  } else if (Array.isArray(manifest.registryUrls)) {
    sources = manifest.registryUrls
      .filter((u) => typeof u === "string" && u.trim())
      .map((url) => ({
        id: sourceIdForUrl(url.trim()),
        kind: "remote" as const,
        url: url.trim(),
        connected: true,
      }));
  }

  if (!sources.some((s) => s.id === PRISM_CURATED_SOURCE_ID)) {
    sources.unshift({ id: PRISM_CURATED_SOURCE_ID, kind: "bundled", connected: true });
  }

  return sources;
}

export function activeRemoteRegistryUrls(sources: SkillLibrarySource[]): string[] {
  return sources
    .filter((s) => s.kind === "remote" && s.connected && s.url?.trim())
    .map((s) => s.url!.trim());
}

export function isBundledLibraryConnected(sources: SkillLibrarySource[]): boolean {
  const bundled = sources.find((s) => s.id === PRISM_CURATED_SOURCE_ID);
  return bundled?.connected !== false;
}

export function listLibrarySources(projectRoot: string): SkillLibrarySourceInfo[] {
  const sources = readSkillsManifest(projectRoot).sources ?? defaultLibrarySources();
  return sources.map((source) => {
    const { name, description } = displayNameForSource(source);
    return {
      ...source,
      name,
      description,
      removable: source.kind !== "bundled",
    };
  });
}

function persistSources(projectRoot: string, manifest: SkillsManifest, sources: SkillLibrarySource[]): void {
  writeSkillsManifest(projectRoot, {
    disabled: manifest.disabled ?? [],
    sources,
  });
}

export function writeSkillsManifest(projectRoot: string, manifest: SkillsManifest): void {
  const path = join(projectRoot, SKILLS_MANIFEST_REL);
  mkdirSync(join(projectRoot, ".prismnext", "agent"), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2), "utf-8");
}

export function listProjectSkills(projectRoot: string): InstalledSkillInfo[] {
  const skillsRoot = join(projectRoot, PRISM_SKILLS_REL);
  if (!existsSync(skillsRoot)) return [];

  const manifest = readSkillsManifest(projectRoot);
  const disabled = new Set(manifest.disabled ?? []);
  const results: InstalledSkillInfo[] = [];

  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const skillMdPath = join(skillsRoot, entry.name, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    let content = "";
    try {
      content = readFileSync(skillMdPath, "utf-8");
    } catch {
      continue;
    }

    const meta = parseSkillMd(content);
    const id = entry.name;
    results.push({
      id,
      name: meta.name || id,
      description: meta.description || "",
      skillDirRel: `${PRISM_SKILLS_REL}/${id}`,
      enabled: !disabled.has(id),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/** Merge global disabled skills with profile allowlist (deny skills outside allowlist). */
export function computeProfileSkillDisabled(
  projectRoot: string,
  profileSkillAllowlist?: string[],
): string[] {
  const manifest = readSkillsManifest(projectRoot);
  const disabled = new Set((manifest.disabled ?? []).filter(Boolean));
  if (!profileSkillAllowlist?.length) {
    return Array.from(disabled);
  }
  const allow = new Set(profileSkillAllowlist);
  for (const skill of listProjectSkills(projectRoot)) {
    if (!allow.has(skill.id) && !allow.has(skill.name)) {
      disabled.add(skill.id);
      disabled.add(skill.name);
    }
  }
  return Array.from(disabled);
}

/** Remove legacy OpenCode project artifacts. Prism-owned agent config lives in `.prismnext/agent/`. */
export function cleanupProjectOpenCodeArtifacts(projectRoot: string): void {
  const root = normalizeProjectRoot(projectRoot);
  for (const rel of LEGACY_OPENCODE_ARTIFACTS) {
    const path = join(root, rel);
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
    }
  }
}

/**
 * Ensure Prism project skills directory exists.
 *
 * OpenCode project config used to be written to `.opencode/opencode.json`.
 * That leaked OpenCode implementation details into user projects and could
 * create `<project>/.prismnext/.opencode/` if the wrong root was passed.
 * Runtime discovery now goes through ACP `additionalDirectories`.
 */
export function syncProjectSkillsIntegration(
  projectRoot: string,
  options?: { profileSkillAllowlist?: string[] },
): {
  skillsCount: number;
  configPath: string;
} {
  const root = normalizeProjectRoot(projectRoot);
  cleanupProjectOpenCodeArtifacts(root);

  const skillsRoot = join(root, PRISM_SKILLS_REL);
  if (!existsSync(skillsRoot)) {
    mkdirSync(skillsRoot, { recursive: true });
  }

  // Keep this computation for callers that sync after profile/skill changes:
  // it validates manifests and preserves the current API shape without writing
  // OpenCode project config.
  computeProfileSkillDisabled(root, options?.profileSkillAllowlist);

  return {
    skillsCount: listProjectSkills(root).length,
    configPath: "",
    registryUrls: [] as string[],
  };
}

export function addSkillLibrarySource(projectRoot: string, registryUrl: string): SkillLibrarySourceInfo[] {
  const manifest = readSkillsManifest(projectRoot);
  const sources = [...(manifest.sources ?? defaultLibrarySources())];
  const url = registryUrl.trim();
  const existing = sources.find((s) => s.kind === "remote" && s.url === url);
  if (existing) {
    existing.connected = true;
  } else {
    sources.push({
      id: sourceIdForUrl(url),
      kind: "remote",
      url,
      connected: true,
    });
  }
  persistSources(projectRoot, manifest, sources);
  syncProjectSkillsIntegration(projectRoot);
  return listLibrarySources(projectRoot);
}

export function removeSkillLibrarySource(projectRoot: string, sourceId: string): SkillLibrarySourceInfo[] {
  if (sourceId === PRISM_CURATED_SOURCE_ID) {
    throw new Error("The built-in Prism Curated library cannot be removed.");
  }
  const manifest = readSkillsManifest(projectRoot);
  const sources = (manifest.sources ?? defaultLibrarySources()).filter((s) => s.id !== sourceId);
  persistSources(projectRoot, manifest, sources);
  syncProjectSkillsIntegration(projectRoot);
  return listLibrarySources(projectRoot);
}

export function setSkillLibrarySourceConnected(
  projectRoot: string,
  sourceId: string,
  connected: boolean,
): SkillLibrarySourceInfo[] {
  const manifest = readSkillsManifest(projectRoot);
  const sources = [...(manifest.sources ?? defaultLibrarySources())];
  const target = sources.find((s) => s.id === sourceId);
  if (!target) {
    throw new Error(`Skill library source not found: ${sourceId}`);
  }
  target.connected = connected;
  persistSources(projectRoot, manifest, sources);
  syncProjectSkillsIntegration(projectRoot);
  return listLibrarySources(projectRoot);
}

/** @deprecated use addSkillLibrarySource */
export function connectSkillRegistry(projectRoot: string, registryUrl: string): string[] {
  return activeRemoteRegistryUrls(
    addSkillLibrarySource(projectRoot, registryUrl).map(({ id, kind, url, connected }) => ({
      id,
      kind,
      url,
      connected,
    })),
  );
}

/** @deprecated use setSkillLibrarySourceConnected(..., false) */
export function disconnectSkillRegistry(projectRoot: string, registryUrl: string): string[] {
  const manifest = readSkillsManifest(projectRoot);
  const sources = manifest.sources ?? defaultLibrarySources();
  const target = sources.find((s) => s.kind === "remote" && s.url === registryUrl.trim());
  if (target) {
    return activeRemoteRegistryUrls(
      setSkillLibrarySourceConnected(projectRoot, target.id, false).map(
        ({ id, kind, url, connected }) => ({ id, kind, url, connected }),
      ),
    );
  }
  return activeRemoteRegistryUrls(sources);
}

/** @deprecated use listLibrarySources */
export function listConnectedRegistries(projectRoot: string): string[] {
  const sources = readSkillsManifest(projectRoot).sources ?? defaultLibrarySources();
  return activeRemoteRegistryUrls(sources);
}
