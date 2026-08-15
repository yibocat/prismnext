/**
 * Fetch and parse remote skill registry indexes (Agent Skills Discovery + OpenCode-style).
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import extractZip from "extract-zip";
import { extract as extractTar } from "tar";
import { fetchOk, readResponseBytes, verifySha256Digest } from "./skill-install-digest";
import { PRISM_LOCAL_SKILLS_REL } from "./skills-sync";

export interface RegistrySkillEntry {
  name: string;
  description: string;
  type: "skill-md" | "archive" | "unknown";
  url: string;
  digest?: string;
  /** Relative paths under the skill folder when the index lists multiple files. */
  files?: string[];
}

interface RawIndexSkill {
  name?: string;
  description?: string;
  type?: string;
  url?: string;
  digest?: string;
  files?: string[];
}

function normalizeFiles(files: unknown): string[] | undefined {
  if (!Array.isArray(files)) return undefined;
  const normalized = files.filter(
    (file): file is string => typeof file === "string" && Boolean(file.trim()),
  );
  return normalized.length > 0 ? normalized : undefined;
}

/** Normalize user input to an index.json URL. */
export function normalizeRegistryIndexUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Registry URL is required.");

  let url = trimmed.replace(/\/+$/, "");
  if (url.endsWith("index.json")) return url;

  if (url.endsWith("/.well-known/agent-skills")) {
    return `${url}/index.json`;
  }
  if (url.includes("/.well-known/")) {
    return `${url}/index.json`;
  }

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${parsed.origin}/.well-known/agent-skills/index.json`;
  } catch {
    throw new Error("Invalid registry URL.");
  }
}

export function resolveArtifactUrl(indexUrl: string, artifactUrl: string): string {
  return new URL(artifactUrl, indexUrl).href;
}

function skillFolderBase(indexUrl: string, skillName: string): string {
  return resolveArtifactUrl(indexUrl, `${skillName}/`);
}

export function parseRegistryIndex(indexUrl: string, data: unknown): RegistrySkillEntry[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as { skills?: RawIndexSkill[] };
  if (!Array.isArray(obj.skills)) return [];

  const base = indexUrl.replace(/\/index\.json$/i, "/");

  return obj.skills
    .map((skill): RegistrySkillEntry | null => {
      const name = typeof skill.name === "string" ? skill.name.trim() : "";
      if (!name) return null;

      const description =
        typeof skill.description === "string" ? skill.description.trim() : "";
      const files = normalizeFiles(skill.files);

      if (typeof skill.url === "string" && skill.url.trim()) {
        const type =
          skill.type === "archive"
            ? "archive"
            : skill.type === "skill-md"
              ? "skill-md"
              : skill.url.endsWith(".tar.gz") ||
                  skill.url.endsWith(".tgz") ||
                  skill.url.endsWith(".zip")
                ? "archive"
                : "skill-md";
        return {
          name,
          description,
          type,
          url: resolveArtifactUrl(indexUrl, skill.url.trim()),
          digest: typeof skill.digest === "string" ? skill.digest : undefined,
          files,
        };
      }

      // OpenCode-style index: files array, no url
      if (files?.includes("SKILL.md")) {
        return {
          name,
          description,
          type: "skill-md",
          url: resolveArtifactUrl(indexUrl, `${name}/SKILL.md`),
          files,
        };
      }

      // Fallback: conventional path under registry base
      return {
        name,
        description,
        type: "skill-md",
        url: `${base}${name}/SKILL.md`,
        files,
      };
    })
    .filter((entry): entry is RegistrySkillEntry => entry !== null);
}

export async function fetchRegistryIndex(registryInput: string): Promise<{
  indexUrl: string;
  skills: RegistrySkillEntry[];
}> {
  const indexUrl = normalizeRegistryIndexUrl(registryInput);
  const response = await fetchOk(
    indexUrl,
    { headers: { Accept: "application/json" } },
    "Registry fetch",
  );
  const data = await response.json();
  const skills = parseRegistryIndex(indexUrl, data);
  return { indexUrl, skills };
}

/** Validate that a registry URL is reachable and returns a parseable index. */
export async function validateRegistryIndex(registryInput: string): Promise<{
  indexUrl: string;
  skillCount: number;
}> {
  const { indexUrl, skills } = await fetchRegistryIndex(registryInput);
  return { indexUrl, skillCount: skills.length };
}

export async function fetchSkillMarkdown(artifactUrl: string): Promise<string> {
  const response = await fetchOk(
    artifactUrl,
    { headers: { Accept: "text/markdown, text/plain, */*" } },
    "Skill download",
  );
  const text = await response.text();
  if (!text.trim()) throw new Error("Downloaded skill file is empty.");
  return text;
}

async function fetchRegistryTextFile(artifactUrl: string): Promise<string> {
  const response = await fetchOk(
    artifactUrl,
    { headers: { Accept: "text/markdown, text/plain, */*" } },
    "Skill file download",
  );
  return response.text();
}

function writeSkillFile(projectRoot: string, skillId: string, relPath: string, content: string): void {
  const dest = join(projectRoot, PRISM_LOCAL_SKILLS_REL, skillId, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, "utf-8");
}

function resolveExtractedSkillDir(extractDir: string): string {
  if (existsSync(join(extractDir, "SKILL.md"))) return extractDir;

  const entries = readdirSync(extractDir, { withFileTypes: true }).filter(
    (entry) => !entry.name.startsWith("."),
  );
  if (entries.length === 1 && entries[0].isDirectory()) {
    const nested = join(extractDir, entries[0].name);
    if (existsSync(join(nested, "SKILL.md"))) return nested;
  }

  throw new Error("Archive does not contain SKILL.md");
}

async function extractArchiveToDir(archiveUrl: string, archivePath: string, extractDir: string, digest?: string): Promise<void> {
  const response = await fetchOk(archiveUrl, undefined, "Archive download");
  const bytes = await readResponseBytes(response);
  verifySha256Digest(bytes, digest);
  writeFileSync(archivePath, bytes);

  if (archiveUrl.endsWith(".zip")) {
    await extractZip(archivePath, { dir: extractDir });
    return;
  }

  await extractTar({ file: archivePath, cwd: extractDir });
}

async function installArchiveSkill(
  projectRoot: string,
  entry: RegistrySkillEntry,
): Promise<void> {
  const skillId = skillNameToFolderId(entry.name);
  const tmpRoot = mkdtempSync(join(tmpdir(), "prism-skill-archive-"));
  const archivePath = join(tmpRoot, "archive.dat");
  const extractDir = join(tmpRoot, "extract");

  try {
    mkdirSync(extractDir, { recursive: true });
    await extractArchiveToDir(entry.url, archivePath, extractDir, entry.digest);

    const sourceDir = resolveExtractedSkillDir(extractDir);
    const destDir = join(projectRoot, PRISM_LOCAL_SKILLS_REL, skillId);
    mkdirSync(destDir, { recursive: true });
    cpSync(sourceDir, destDir, { recursive: true, force: true });
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function installSkillMdSkill(
  projectRoot: string,
  entry: RegistrySkillEntry,
  indexUrl: string,
): Promise<void> {
  const skillId = skillNameToFolderId(entry.name);
  const skillDir = join(projectRoot, PRISM_LOCAL_SKILLS_REL, skillId);
  mkdirSync(skillDir, { recursive: true });

  if (entry.files && entry.files.length > 0) {
    const baseUrl = skillFolderBase(indexUrl, entry.name);
    for (const relPath of entry.files) {
      const fileUrl = resolveArtifactUrl(baseUrl, relPath);
      const content = await fetchRegistryTextFile(fileUrl);
      if (relPath === "SKILL.md" || relPath.endsWith("/SKILL.md")) {
        verifySha256Digest(content, entry.digest);
      }
      writeSkillFile(projectRoot, skillId, relPath, content);
    }
    if (!existsSync(join(skillDir, "SKILL.md"))) {
      throw new Error("Installed skill package is missing SKILL.md.");
    }
    return;
  }

  const content = await fetchSkillMarkdown(entry.url);
  verifySha256Digest(content, entry.digest);
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
}

/** Install a remote registry skill into the project skills directory. */
export async function installRegistrySkill(
  projectRoot: string,
  entry: RegistrySkillEntry,
  indexUrl: string,
): Promise<void> {
  if (entry.type === "archive") {
    await installArchiveSkill(projectRoot, entry);
    return;
  }
  await installSkillMdSkill(projectRoot, entry, indexUrl);
}

/** Folder id must match OpenCode skill directory naming. */
export function skillNameToFolderId(name: string): string {
  return name.trim().toLowerCase();
}
