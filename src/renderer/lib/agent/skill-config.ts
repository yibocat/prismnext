/** Parse and build OpenCode-compatible SKILL.md files. */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface SkillMeta {
  name: string;
  description: string;
  license?: string;
  body: string;
}

export function isValidSkillName(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.trim());
}

function parseFrontmatterField(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

export function parseSkillMd(content: string): SkillMeta {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { name: "", description: "", body: content.trim() };
  }
  const [, fm, body] = match;
  const license = parseFrontmatterField(fm, "license");
  return {
    name: parseFrontmatterField(fm, "name"),
    description: parseFrontmatterField(fm, "description"),
    ...(license ? { license } : {}),
    body: body.trim(),
  };
}

export function buildSkillMd(meta: SkillMeta): string {
  const lines = [
    "---",
    `name: ${meta.name}`,
    `description: ${meta.description}`,
  ];
  if (meta.license) lines.push(`license: ${meta.license}`);
  lines.push("---", "", meta.body.trim(), "");
  return lines.join("\n");
}

/** Accept raw SKILL.md or body-only (requires name in form). */
export function normalizePastedSkill(
  text: string,
  fallbackName?: string,
): { meta: SkillMeta; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { meta: { name: "", description: "", body: "" }, error: "empty" };

  const parsed = parseSkillMd(trimmed);
  if (parsed.name && parsed.description) {
    return { meta: parsed };
  }

  const name = (fallbackName ?? parsed.name).trim();
  if (!isValidSkillName(name)) {
    return { meta: parsed, error: "invalid_name" };
  }
  if (!parsed.description && !trimmed.includes("description:")) {
    return { meta: parsed, error: "missing_description" };
  }

  return {
    meta: {
      name,
      description: parsed.description || "Custom project skill",
      body: parsed.body || trimmed,
    },
  };
}

export const DEFAULT_SKILL_BODY = `# Skill Instructions

Describe when to use this skill and the step-by-step workflow the agent should follow.
`;
