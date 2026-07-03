import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, posix } from "node:path";
import { tmpdir } from "node:os";
import { extract as extractTar } from "tar";
import type {
  GitHubInstallOrigin,
  SkillPackageOption,
  SkillSharedBundleOption,
} from "../../shared/skill-install-types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const CACHE_TTL_MS = 30 * 60 * 1000;
const SHARED_DIR_NAME = "_shared";

export interface ParsedGitHubSource {
  owner: string;
  repo: string;
  ref: string;
  subPath: string;
}

interface CachedGitHubExtract {
  extractDir: string;
  repoRoot: string;
  parsed: ParsedGitHubSource;
  createdAt: number;
}

const extractCache = new Map<string, CachedGitHubExtract>();

function parseFrontmatterField(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function readSkillMetaFromContent(content: string): {
  name: string;
  description: string;
  version: string;
} {
  const fm = content.match(FRONTMATTER_RE);
  if (!fm) return { name: "", description: "", version: "" };
  return {
    name: parseFrontmatterField(fm[1], "name"),
    description: parseFrontmatterField(fm[1], "description"),
    version: parseFrontmatterField(fm[1], "version"),
  };
}

function readSkillMeta(skillMdPath: string): {
  name: string;
  description: string;
  version: string;
} {
  try {
    return readSkillMetaFromContent(readFileSync(skillMdPath, "utf-8"));
  } catch {
    return { name: "", description: "", version: "" };
  }
}

export function parseSkillVersionFromMarkdown(content: string): string | undefined {
  const version = readSkillMetaFromContent(content).version.trim();
  return version || undefined;
}

export function githubRawSkillMdUrl(repo: string, ref: string, packagePath: string): string {
  const [owner, repoName] = repo.split("/");
  const normalizedPath = packagePath.replace(/^\.\/?/, "").replace(/\/$/, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  const encodedPath = [...segments, "SKILL.md"].map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repoName}/${encodeURIComponent(ref)}/${encodedPath}`;
}

function hasRequirementsFile(skillDir: string): boolean {
  if (existsSync(join(skillDir, "requirements.txt"))) return true;
  const mcpReq = join(skillDir, "mcp-server", "requirements.txt");
  return existsSync(mcpReq);
}

export function parseGitHubInput(input: string): ParsedGitHubSource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const atMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@([A-Za-z0-9._/-]+))?$/);
  if (atMatch && !trimmed.includes("://") && !trimmed.includes("github.com")) {
    return {
      owner: atMatch[1],
      repo: atMatch[2],
      ref: atMatch[3] || "main",
      subPath: "",
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!url.hostname.replace(/^www\./, "").includes("github.com")) return null;

  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  let ref = "main";
  let subPath = "";

  if (parts[2] === "tree" || parts[2] === "blob") {
    ref = parts[3] || "main";
    subPath = parts.slice(4).join("/");
  }

  return { owner, repo, ref, subPath: subPath === "." ? "" : subPath };
}

function githubTarballUrl(parsed: ParsedGitHubSource): string {
  return `https://codeload.github.com/${parsed.owner}/${parsed.repo}/tar.gz/${encodeURIComponent(parsed.ref)}`;
}

function findSingleExtractRoot(extractDir: string): string {
  const entries = readdirSync(extractDir, { withFileTypes: true }).filter(
    (entry) => !entry.name.startsWith("."),
  );
  if (entries.length === 1 && entries[0].isDirectory()) {
    return join(extractDir, entries[0].name);
  }
  return extractDir;
}

async function downloadAndExtract(parsed: ParsedGitHubSource): Promise<{
  extractDir: string;
  repoRoot: string;
}> {
  const extractDir = join(tmpdir(), `prism-github-skill-${randomUUID()}`);
  mkdirSync(extractDir, { recursive: true });
  const archivePath = join(extractDir, "repo.tar.gz");

  const tarballUrl = githubTarballUrl(parsed);
  const response = await fetch(tarballUrl);
  if (!response.ok) {
    rmSync(extractDir, { recursive: true, force: true });
    const { httpFetchError } = await import("./skill-install-digest");
    throw httpFetchError(
      tarballUrl,
      response.status,
      `GitHub download for ${parsed.owner}/${parsed.repo} (ref "${parsed.ref}")`,
    );
  }

  writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));

  const innerExtract = join(extractDir, "src");
  mkdirSync(innerExtract, { recursive: true });
  await extractTar({ file: archivePath, cwd: innerExtract });

  const repoRoot = findSingleExtractRoot(innerExtract);
  return { extractDir, repoRoot };
}

function pruneExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of extractCache.entries()) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      rmSync(entry.extractDir, { recursive: true, force: true });
      extractCache.delete(key);
    }
  }
}

export function scanSkillPackagesAtRoot(
  repoRoot: string,
  scanRoot: string,
): {
  packages: SkillPackageOption[];
  sharedBundle?: SkillSharedBundleOption;
} {
  const packages: SkillPackageOption[] = [];
  let sharedBundle: SkillSharedBundleOption | undefined;

  const relScan = scanRoot.startsWith(repoRoot)
    ? posix.relative(repoRoot, scanRoot).replace(/\\/g, "/")
    : "";

  if (existsSync(join(scanRoot, "SKILL.md"))) {
    const id = relScan ? posix.basename(relScan) : posix.basename(scanRoot);
    const meta = readSkillMeta(join(scanRoot, "SKILL.md"));
    packages.push({
      id,
      name: meta.name || id,
      description: meta.description || id,
      path: relScan || ".",
      hasRequirements: hasRequirementsFile(scanRoot),
    });
    return { packages, sharedBundle };
  }

  const skillsDir = join(scanRoot, "skills");
  const packageRoot = existsSync(skillsDir) ? skillsDir : scanRoot;
  const packageRootRel = posix
    .relative(repoRoot, packageRoot)
    .replace(/\\/g, "/")
    .replace(/^\.\/?/, "");

  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const skillDir = join(packageRoot, entry.name);
    const skillMd = join(skillDir, "SKILL.md");
    const relPath = packageRootRel
      ? posix.join(packageRootRel, entry.name)
      : entry.name;

    if (entry.name === SHARED_DIR_NAME && !existsSync(skillMd)) {
      sharedBundle = {
        id: SHARED_DIR_NAME,
        label: "Shared files (_shared)",
        path: relPath,
      };
      continue;
    }

    if (!existsSync(skillMd)) continue;

    const meta = readSkillMeta(skillMd);
    packages.push({
      id: entry.name,
      name: meta.name || entry.name,
      description: meta.description || entry.name,
      path: relPath,
      hasRequirements: hasRequirementsFile(skillDir),
    });
  }

  packages.sort((a, b) => a.id.localeCompare(b.id));
  return { packages, sharedBundle };
}

export function githubSourceToAnalyzeUrl(source: {
  repo?: string;
  ref?: string;
  subPath?: string;
}): string {
  const repo = source.repo ?? "";
  const ref = source.ref ?? "main";
  if (source.subPath) {
    return `https://github.com/${repo}/tree/${ref}/${source.subPath}`;
  }
  if (ref !== "main") {
    return `https://github.com/${repo}/tree/${ref}`;
  }
  return `https://github.com/${repo}`;
}

export async function scanGitHubRepository(parsed: ParsedGitHubSource): Promise<{
  packages: SkillPackageOption[];
  sharedBundle?: SkillSharedBundleOption;
}> {
  const { extractDir, repoRoot } = await downloadAndExtract(parsed);
  try {
    const scanRoot = parsed.subPath ? join(repoRoot, parsed.subPath) : repoRoot;
    if (!existsSync(scanRoot)) {
      throw new Error(`Path not found in repository: ${parsed.subPath || "(root)"}`);
    }
    const result = scanSkillPackagesAtRoot(repoRoot, scanRoot);
    if (result.packages.length === 0) {
      throw new Error("No installable skills found (directories with SKILL.md).");
    }
    return result;
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

export async function analyzeGitHubSkillSource(input: string): Promise<{
  cacheKey: string;
  parsed: ParsedGitHubSource;
  origin: GitHubInstallOrigin;
  label: string;
  packages: SkillPackageOption[];
  sharedBundle?: SkillSharedBundleOption;
  warnings: string[];
}> {
  const parsed = parseGitHubInput(input);
  if (!parsed) {
    throw new Error("Enter a GitHub repository URL (e.g. https://github.com/owner/repo).");
  }

  pruneExpiredCache();
  const { extractDir, repoRoot } = await downloadAndExtract(parsed);
  const cacheKey = createHash("sha256")
    .update(`${parsed.owner}/${parsed.repo}@${parsed.ref}:${parsed.subPath}:${Date.now()}`)
    .digest("hex")
    .slice(0, 24);

  extractCache.set(cacheKey, {
    extractDir,
    repoRoot,
    parsed,
    createdAt: Date.now(),
  });

  const scanRoot = parsed.subPath ? join(repoRoot, parsed.subPath) : repoRoot;
  if (!existsSync(scanRoot)) {
    rmSync(extractDir, { recursive: true, force: true });
    extractCache.delete(cacheKey);
    throw new Error(`Path not found in repository: ${parsed.subPath || "(root)"}`);
  }

  const { packages, sharedBundle } = scanSkillPackagesAtRoot(repoRoot, scanRoot);
  if (packages.length === 0) {
    rmSync(extractDir, { recursive: true, force: true });
    extractCache.delete(cacheKey);
    throw new Error("No installable skills found (directories with SKILL.md).");
  }

  const warnings: string[] = [];
  if (packages.some((pkg) => pkg.hasRequirements)) {
    warnings.push("Some skills list Python requirements — install deps manually if needed.");
  }

  const repo = `${parsed.owner}/${parsed.repo}`;
  const origin: GitHubInstallOrigin = {
    adapter: "github",
    repo,
    ref: parsed.ref,
    path: parsed.subPath,
  };

  return {
    cacheKey,
    parsed,
    origin,
    label: `${repo} · ${parsed.ref}`,
    packages,
    sharedBundle,
    warnings,
  };
}

export function getCachedGitHubExtract(cacheKey: string): CachedGitHubExtract | null {
  const entry = extractCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    rmSync(entry.extractDir, { recursive: true, force: true });
    extractCache.delete(cacheKey);
    return null;
  }
  return entry;
}

export function readSkillVersionFromDir(skillDir: string): string | undefined {
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) return undefined;
  const version = readSkillMeta(skillMd).version.trim();
  return version || undefined;
}

export function copyGitHubSkillPaths(
  projectRoot: string,
  skillsRel: string,
  repoRoot: string,
  paths: string[],
): string[] {
  const installedIds: string[] = [];
  for (const relPath of paths) {
    const srcDir = join(repoRoot, relPath);
    const folderName = posix.basename(relPath.replace(/\\/g, "/"));
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
      throw new Error(`Skill folder missing in cache: ${relPath}`);
    }
    const destDir = join(projectRoot, skillsRel, folderName);
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true, force: true });
    installedIds.push(folderName);
  }
  return installedIds;
}

export function clearGitHubExtractCacheForTests(): void {
  for (const entry of extractCache.values()) {
    rmSync(entry.extractDir, { recursive: true, force: true });
  }
  extractCache.clear();
}
