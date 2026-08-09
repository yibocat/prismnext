/**
 * 极简 YAML frontmatter 解析（flat keys only）。
 *
 * 与 commands/registry.ts 的私有解析器同一策略：pack 内容文件
 * （SKILL.md / commands/*.md）只需要平铺的 key: value，不引入 YAML 库。
 * 值支持：裸字符串、数字、"..." / '...' 引号字符串。不支持嵌套/数组
 * （pack 内容格式不需要；复杂的结构化定义走 .json 文件）。
 */

export interface FlatFrontmatter {
  /** 平铺的 key → 字符串值 */
  fm: Record<string, string>;
  /** frontmatter 之后的正文（trim 后） */
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFlatFrontmatter(raw: string): FlatFrontmatter | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return null;

  const fm: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (!key) continue;
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  return { fm, body: match[2].trim() };
}

/** frontmatter 里的整数字段（如 order）；非法值回退 fallback */
export function fmInt(fm: Record<string, string>, key: string, fallback: number): number {
  const raw = fm[key];
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** frontmatter 里的可选字符串字段；空串视为缺省 */
export function fmString(fm: Record<string, string>, key: string): string | undefined {
  const raw = fm[key]?.trim();
  return raw ? raw : undefined;
}
