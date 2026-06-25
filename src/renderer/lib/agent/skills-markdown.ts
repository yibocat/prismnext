import {
  buildSkillMd,
  DEFAULT_SKILL_BODY,
  isValidSkillName,
  parseSkillMd,
} from "./skill-config";

export function defaultNewSkillMarkdown(): string {
  return buildSkillMd({
    name: "my-skill",
    description: "When to use this skill",
    body: DEFAULT_SKILL_BODY,
  });
}

export function validateSkillMarkdown(
  content: string,
  expectedId?: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "SKILL.md cannot be empty." };

  const parsed = parseSkillMd(trimmed);
  const name = parsed.name.trim();
  if (!name) return { ok: false, error: "Frontmatter must include name:." };
  if (!isValidSkillName(name)) {
    return { ok: false, error: "name must be lowercase letters, numbers, and hyphens." };
  }
  if (!parsed.description.trim()) {
    return { ok: false, error: "Frontmatter must include description:." };
  }
  if (expectedId && name !== expectedId) {
    return { ok: false, error: `name must stay "${expectedId}" (matches the skill folder).` };
  }
  return { ok: true, name };
}
