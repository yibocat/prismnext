/**
 * Fetch and parse remote skill registry indexes (Agent Skills Discovery + OpenCode-style).
 */

export interface RegistrySkillEntry {
  name: string;
  description: string;
  type: "skill-md" | "archive" | "unknown";
  url: string;
  digest?: string;
}

interface RawIndexSkill {
  name?: string;
  description?: string;
  type?: string;
  url?: string;
  digest?: string;
  files?: string[];
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

      if (typeof skill.url === "string" && skill.url.trim()) {
        const type =
          skill.type === "archive"
            ? "archive"
            : skill.type === "skill-md"
              ? "skill-md"
              : skill.url.endsWith(".tar.gz") || skill.url.endsWith(".zip")
                ? "archive"
                : "skill-md";
        return {
          name,
          description,
          type,
          url: resolveArtifactUrl(indexUrl, skill.url.trim()),
          digest: typeof skill.digest === "string" ? skill.digest : undefined,
        };
      }

      // OpenCode-style index: files array, no url
      if (Array.isArray(skill.files) && skill.files.includes("SKILL.md")) {
        return {
          name,
          description,
          type: "skill-md",
          url: resolveArtifactUrl(indexUrl, `${name}/SKILL.md`),
        };
      }

      // Fallback: conventional path under registry base
      return {
        name,
        description,
        type: "skill-md",
        url: `${base}${name}/SKILL.md`,
      };
    })
    .filter((entry): entry is RegistrySkillEntry => entry !== null);
}

export async function fetchRegistryIndex(registryInput: string): Promise<{
  indexUrl: string;
  skills: RegistrySkillEntry[];
}> {
  const indexUrl = normalizeRegistryIndexUrl(registryInput);
  const response = await fetch(indexUrl, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Registry fetch failed (${response.status}): ${indexUrl}`);
  }
  const data = await response.json();
  const skills = parseRegistryIndex(indexUrl, data);
  return { indexUrl, skills };
}

export async function fetchSkillMarkdown(artifactUrl: string): Promise<string> {
  const response = await fetch(artifactUrl, {
    headers: { Accept: "text/markdown, text/plain, */*" },
  });
  if (!response.ok) {
    throw new Error(`Skill download failed (${response.status})`);
  }
  const text = await response.text();
  if (!text.trim()) throw new Error("Downloaded skill file is empty.");
  return text;
}

/** Folder id must match OpenCode skill directory naming. */
export function skillNameToFolderId(name: string): string {
  return name.trim().toLowerCase();
}
