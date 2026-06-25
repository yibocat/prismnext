/** YAML frontmatter block at the start of markdown documents. */
export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface MarkdownFrontmatterSplit {
  hasFrontmatter: boolean;
  rawFrontmatter: string;
  fields: Record<string, string>;
  body: string;
}

/** Parse simple `key: value` frontmatter lines (OpenCode SKILL.md, Hugo, etc.). */
export function parseFrontmatterFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    if (!key) continue;
    const value = trimmed
      .slice(colon + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    fields[key] = value;
  }
  return fields;
}

export function splitMarkdownFrontmatter(content: string): MarkdownFrontmatterSplit {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return {
      hasFrontmatter: false,
      rawFrontmatter: "",
      fields: {},
      body: content,
    };
  }
  const [, rawFrontmatter, body] = match;
  return {
    hasFrontmatter: true,
    rawFrontmatter,
    fields: parseFrontmatterFields(rawFrontmatter),
    body: body ?? "",
  };
}
