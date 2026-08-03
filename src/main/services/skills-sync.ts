import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { countPromptTokens } from "../lib/token-estimate";
import { libraryCardForRegistryUrl, PRISM_CURATED_LIBRARY } from "../../shared/skill-libraries";
import type { SkillInstallRecord } from "../../shared/skill-install-types";
import { parseGitHubInput, scanGitHubRepository } from "./skill-install-github";
import { validateRegistryIndex } from "./skills-registry";

export const PRISM_SKILLS_REL = ".prismnext/agent/skills";
export const SKILLS_MANIFEST_REL = ".prismnext/agent/skills-manifest.json";
/**
 * OpenCode `skills.paths` entry (relative to session cwd).
 * Must be the parent of a `skills/` folder (OpenCode globs skill folders beneath it).
 */
export const PRISM_OPENCODE_SKILLS_SCAN_REL = ".prismnext/agent";

/** OpenCode built-in skills we keep enabled in core but hide from the agent. */
export const OPENCODE_HIDDEN_SKILLS = ["customize-opencode"] as const;

/**
 * Project-root artifacts OpenCode may create when cwd is the project.
 * prismnext never stores skills or OpenCode packages here — config lives in app userData.
 */
const PROJECT_OPENCODE_ARTIFACT_DIRS = [
  ".opencode",
  ".agents",
  ".prismnext/.opencode",
  ".prismnext/opencode",
] as const;

const OPENCODE_GITIGNORE_LINES = [".opencode/", ".agents/"];

export function normalizeProjectRoot(projectRoot: string): string {
  return basename(projectRoot) === ".prismnext" ? dirname(projectRoot) : projectRoot;
}

/** Absolute paths in OpenCode JSON config — forward slashes on all OSes. */
export function normalizeOpencodeConfigPath(absPath: string): string {
  return absPath.replace(/\\/g, "/");
}

/** Project root when path is under `.prismnext/agent/`. */
export function projectRootFromAgentPath(absPath: string): string | null {
  const normalized = normalizeOpencodeConfigPath(absPath);
  const marker = "/.prismnext/agent/";
  const idx = normalized.toLowerCase().indexOf(marker);
  if (idx === -1) return null;
  return normalized.slice(0, idx);
}

/** Whether a filesystem change should trigger skills OpenCode sync. */
export function isSkillsIntegrationPath(absPath: string, projectRoot: string): boolean {
  const root = normalizeOpencodeConfigPath(normalizeProjectRoot(projectRoot)).replace(/\/$/, "");
  const normalized = normalizeOpencodeConfigPath(absPath);
  const rootLower = root.toLowerCase();
  const normLower = normalized.toLowerCase();
  if (!normLower.startsWith(rootLower + "/") && normLower !== rootLower) return false;

  const rel = normalized.slice(root.length).replace(/^\//, "");
  const manifestRel = SKILLS_MANIFEST_REL.replace(/\\/g, "/");
  const skillsRel = PRISM_SKILLS_REL.replace(/\\/g, "/");
  if (rel === manifestRel || rel.startsWith(`${manifestRel}/`)) return true;
  if (rel === skillsRel || rel.startsWith(`${skillsRel}/`)) return true;
  return false;
}

/** True when the path is the project's skills manifest (not a skill folder). */
export function isSkillsManifestPath(absPath: string, projectRoot: string): boolean {
  const root = normalizeOpencodeConfigPath(normalizeProjectRoot(projectRoot)).replace(/\/$/, "");
  const normalized = normalizeOpencodeConfigPath(absPath);
  const rootLower = root.toLowerCase();
  const normLower = normalized.toLowerCase();
  if (!normLower.startsWith(rootLower + "/") && normLower !== rootLower) return false;
  const rel = normalized.slice(root.length).replace(/^\//, "");
  return rel === SKILLS_MANIFEST_REL.replace(/\\/g, "/");
}

export const PRISM_CURATED_SOURCE_ID = "prism-curated";

export type SkillLibrarySourceKind = "bundled" | "remote" | "github";

export interface SkillLibrarySource {
  id: string;
  kind: SkillLibrarySourceKind;
  /** Normalized index.json URL for registry (`remote`) sources. */
  url?: string;
  /** GitHub `owner/repo` for `github` sources. */
  repo?: string;
  ref?: string;
  subPath?: string;
  /** When true, skills from this source appear in Skill library UI. */
  connected: boolean;
}

export interface SkillsManifest {
  disabled?: string[];
  /** @deprecated migrated to `sources` on read */
  registryUrls?: string[];
  sources?: SkillLibrarySource[];
  installs?: SkillInstallRecord[];
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
  /** o200k_base BPE estimate of SKILL.md body */
  tokenCount: number;
  installOrigin?: import("../../shared/skill-install-types").SkillInstallOrigin;
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
    return { disabled: [], sources: defaultLibrarySources(), installs: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as SkillsManifest;
    return {
      disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [],
      sources: normalizeLibrarySources(parsed),
      installs: Array.isArray(parsed.installs) ? parsed.installs : [],
    };
  } catch {
    return { disabled: [], sources: defaultLibrarySources(), installs: [] };
  }
}

function defaultLibrarySources(): SkillLibrarySource[] {
  return [{ id: PRISM_CURATED_SOURCE_ID, kind: "bundled", connected: true }];
}

function sourceIdForUrl(url: string): string {
  return `remote:${url}`;
}

function sourceIdForGitHub(repo: string, ref: string): string {
  return `github:${repo}@${ref}`;
}

function displayNameForSource(source: SkillLibrarySource): { name: string; description: string } {
  if (source.kind === "bundled") {
    return {
      name: PRISM_CURATED_LIBRARY.name,
      description: PRISM_CURATED_LIBRARY.description,
    };
  }
  if (source.kind === "github") {
    const repo = source.repo ?? "GitHub";
    const ref = source.ref ?? "main";
    return {
      name: repo.split("/").pop() ?? repo,
      description: `GitHub · ${repo} · ${ref}`,
    };
  }
  const card = libraryCardForRegistryUrl(source.url ?? "");
  return { name: card.name, description: card.description };
}

export function normalizeLibrarySources(manifest: SkillsManifest): SkillLibrarySource[] {
  let sources: SkillLibrarySource[] = [];

  if (Array.isArray(manifest.sources) && manifest.sources.length > 0) {
    sources = manifest.sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      url: s.url,
      repo: s.repo,
      ref: s.ref,
      subPath: s.subPath,
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
    installs: manifest.installs ?? [],
  });
}

export function recordSkillInstalls(projectRoot: string, entries: SkillInstallRecord[]): void {
  const manifest = readSkillsManifest(projectRoot);
  const installs = [...(manifest.installs ?? [])];
  for (const entry of entries) {
    const index = installs.findIndex((item) => item.skillId === entry.skillId);
    if (index >= 0) installs[index] = entry;
    else installs.push(entry);
  }
  writeSkillsManifest(projectRoot, { ...manifest, installs });
}

export function removeSkillInstallRecord(projectRoot: string, skillId: string): void {
  const manifest = readSkillsManifest(projectRoot);
  const installs = (manifest.installs ?? []).filter((item) => item.skillId !== skillId);
  writeSkillsManifest(projectRoot, { ...manifest, installs });
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
  const installBySkillId = new Map(
    (manifest.installs ?? []).map((item) => [item.skillId, item.origin]),
  );
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
      tokenCount: countPromptTokens(content).tokenCount,
      installOrigin: installBySkillId.get(id),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Compute which skills should be denied in OpenCode config.
 *
 * Only the project's `skills-manifest.json` `disabled` list denies skills.
 * A profile's `skills` field is a *recommendation / ensure-enabled* list —
 * it does NOT deny other skills. (Previous behavior denied every skill
 * outside the profile whitelist, which blocked the whole skill toolbox.)
 */
export function computeProfileSkillDisabled(
  projectRoot: string,
  _profileSkillAllowlist?: string[],
): string[] {
  const manifest = readSkillsManifest(projectRoot);
  return Array.from(new Set((manifest.disabled ?? []).filter(Boolean)));
}

export function buildSkillPermissions(disabled: string[]): Record<string, string> {
  const skill: Record<string, string> = { "*": "allow" };
  for (const name of OPENCODE_HIDDEN_SKILLS) {
    skill[name] = "deny";
  }
  for (const name of disabled) {
    if (name.trim()) skill[name.trim()] = "deny";
  }
  return skill;
}

/**
 * Merge skill permission maps for OpenCode config.
 * Never spread a string into an object — that produces {"0":"a",...} and crashes OpenCode.
 *
 * The result is authoritative: only `patch` (prismnext's computed allow/deny map)
 * plus the inherited `*` wildcard survive. Stale deny entries from previous
 * profile whitelists are dropped so skills don't stay blocked forever after
 * the user switches profiles.
 */
export function sanitizeSkillPermissionMap(
  existing: unknown,
  patch: Record<string, string>,
): Record<string, string> {
  const base: Record<string, string> = {};
  if (typeof existing === "string" && existing.trim()) {
    base["*"] = existing.trim();
  } else if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [key, value] of Object.entries(existing as Record<string, unknown>)) {
      if (/^\d+$/.test(key)) continue;
      if (typeof value === "string" && value.trim()) base[key] = value.trim();
    }
  }
  // Preserve only the wildcard from the inherited map; per-skill entries are
  // recomputed from `patch` so stale denies don't linger across profile switches.
  const wildcard = base["*"] ?? "allow";
  return { "*": wildcard, ...patch };
}

/** True when legacy bugs left numeric keys from spreading `"allow"` into an object. */
export function skillPermissionNeedsRepair(existing: unknown): boolean {
  if (typeof existing === "string") return false;
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return false;
  return Object.keys(existing as Record<string, unknown>).some((k) => /^\d+$/.test(k));
}

/** Remove OpenCode runtime dirs from the project tree (never prismnext's storage location). */
export function cleanupProjectOpenCodeArtifacts(projectRoot: string): void {
  const root = normalizeProjectRoot(projectRoot);
  for (const rel of PROJECT_OPENCODE_ARTIFACT_DIRS) {
    const path = join(root, rel);
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
    }
  }
}

/** Keep accidental OpenCode init artifacts out of git when the project uses git. */
export function ensureOpencodeArtifactsGitignored(projectRoot: string): void {
  const root = normalizeProjectRoot(projectRoot);
  // Only touch root .gitignore after the user has initialized git.
  if (!existsSync(join(root, ".git"))) return;
  const gitignorePath = join(root, ".gitignore");
  let content = "";
  if (existsSync(gitignorePath)) {
    try {
      content = readFileSync(gitignorePath, "utf-8");
    } catch {
      return;
    }
  }
  const missing = OPENCODE_GITIGNORE_LINES.filter((line) => !content.includes(line));
  if (missing.length === 0) return;

  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const block =
    "\n# OpenCode runtime artifacts (managed by prismnext, not project source)\n" +
    missing.join("\n") +
    "\n";
  writeFileSync(gitignorePath, content + prefix + block, "utf-8");
}

export interface ProjectSkillsOpencodePatch {
  skillsPaths: string[];
  skillPermissions: Record<string, string>;
}

/**
 * Prepare project skills state for OpenCode. Skill files live only in
 * `.prismnext/agent/skills/`. OpenCode config is written to app userData
 * via `AcpService.applyProjectSkillsIntegration` — never project-root `.opencode/`.
 */
export function syncProjectSkillsIntegration(
  projectRoot: string,
  options?: { profileSkillAllowlist?: string[] },
): {
  skillsCount: number;
  skillsPaths: string[];
  skillPermissions: Record<string, string>;
  registryUrls: string[];
} {
  const root = normalizeProjectRoot(projectRoot);
  cleanupProjectOpenCodeArtifacts(root);
  ensureOpencodeArtifactsGitignored(root);

  const skillsRoot = join(root, PRISM_SKILLS_REL);
  if (!existsSync(skillsRoot)) {
    mkdirSync(skillsRoot, { recursive: true });
  }

  const disabled = computeProfileSkillDisabled(root, options?.profileSkillAllowlist);

  return {
    skillsCount: listProjectSkills(root).length,
    skillsPaths: [PRISM_OPENCODE_SKILLS_SCAN_REL],
    skillPermissions: buildSkillPermissions(disabled),
    registryUrls: [] as string[],
  };
}

export async function addSkillLibrarySource(
  projectRoot: string,
  input: string,
): Promise<{
  sources: SkillLibrarySourceInfo[];
  sourceKind: "github" | "registry";
  packageCount: number;
  indexUrl?: string;
}> {
  return addLibrarySourceFromInput(projectRoot, input);
}

export async function addLibrarySourceFromInput(
  projectRoot: string,
  input: string,
): Promise<{
  sources: SkillLibrarySourceInfo[];
  sourceKind: "github" | "registry";
  packageCount: number;
  indexUrl?: string;
}> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Enter a GitHub repository URL or registry hostname.");
  }

  const parsed = parseGitHubInput(trimmed);
  if (parsed) {
    const repo = `${parsed.owner}/${parsed.repo}`;
    const ref = parsed.ref || "main";
    const { packages } = await scanGitHubRepository(parsed);
    const manifest = readSkillsManifest(projectRoot);
    const sources = [...(manifest.sources ?? defaultLibrarySources())];
    const id = sourceIdForGitHub(repo, ref);
    const existing = sources.find((s) => s.id === id);
    if (existing) {
      existing.connected = true;
      existing.repo = repo;
      existing.ref = ref;
      existing.subPath = parsed.subPath;
      existing.kind = "github";
    } else {
      sources.push({
        id,
        kind: "github",
        repo,
        ref,
        subPath: parsed.subPath,
        connected: true,
      });
    }
    persistSources(projectRoot, manifest, sources);
    syncProjectSkillsIntegration(projectRoot);
    return {
      sources: listLibrarySources(projectRoot),
      sourceKind: "github",
      packageCount: packages.length,
    };
  }

  const validation = await validateRegistryIndex(trimmed);
  const manifest = readSkillsManifest(projectRoot);
  const sources = [...(manifest.sources ?? defaultLibrarySources())];
  const url = validation.indexUrl;
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
  return {
    sources: listLibrarySources(projectRoot),
    sourceKind: "registry",
    packageCount: validation.skillCount,
    indexUrl: url,
  };
}

export function removeSkillLibrarySource(projectRoot: string, sourceId: string): SkillLibrarySourceInfo[] {
  if (sourceId === PRISM_CURATED_SOURCE_ID) {
    throw new Error("The built-in prismnext Curated library cannot be removed.");
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
export async function connectSkillRegistry(projectRoot: string, registryUrl: string): Promise<string[]> {
  const result = await addSkillLibrarySource(projectRoot, registryUrl);
  return activeRemoteRegistryUrls(
    result.sources.map(({ id, kind, url, connected }) => ({
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
