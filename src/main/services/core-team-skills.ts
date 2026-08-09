/**
 * core-pack-skills.ts —— core pack 技能的目录级读取（替代已删除的 bundled-skills.ts）。
 *
 * 引用模型下 core pack 技能天然可用（无需「安装进项目」）：
 * - 列表/元数据（category/license）读 pack 目录里的 skills/manifest.json
 *   + 目录扫描兜底；
 * - 「安装 bundled 技能」语义 = 确保该技能启用（清 disabledContent）；
 * - 内容读取直接命中 pack 目录，零拷贝。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CORE_TEAM_ID } from "../../shared/teams/types";
import { parseFlatFrontmatter, fmString } from "../../shared/teams/frontmatter";
import { getTeam } from "./team-catalog";
import { createLogger } from "./logger";

const log = createLogger("core-pack-skills");

export type CoreSkillCategory = "academic" | "general";

export interface CoreSkillInfo {
  id: string;
  name: string;
  description: string;
  category: CoreSkillCategory;
  license?: string;
}

interface CoreSkillsManifest {
  skills?: CoreSkillInfo[];
}

function corePackDir(): string | null {
  return getTeam(CORE_TEAM_ID)?.dir ?? null;
}

/**
 * core pack 技能列表。优先读 skills/manifest.json（带 category/license
 * 元数据，供 Skill Library 展示）；manifest 缺失/损坏时退化为目录扫描
 * （category 归 "general"），保证列表永远与磁盘一致。
 */
export function listCorePackSkills(): CoreSkillInfo[] {
  const dir = corePackDir();
  if (!dir) return [];
  const skillsRoot = join(dir, "skills");
  if (!existsSync(skillsRoot)) return [];

  const manifestPath = join(skillsRoot, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as CoreSkillsManifest;
      if (Array.isArray(manifest.skills)) {
        // 以磁盘实际存在为准过滤（manifest 是展示元数据，不是真相来源）
        return manifest.skills.filter((s) => existsSync(join(skillsRoot, s.id, "SKILL.md")));
      }
    } catch (err) {
      log.warn("core skills manifest.json 解析失败，退化为目录扫描", { error: String(err) });
    }
  }

  const out: CoreSkillInfo[] = [];
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = join(skillsRoot, entry.name, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    let name = entry.name;
    let description = "";
    try {
      const parsed = parseFlatFrontmatter(readFileSync(skillMd, "utf-8"));
      if (parsed) {
        name = fmString(parsed.fm, "name") ?? entry.name;
        description = fmString(parsed.fm, "description") ?? "";
      }
    } catch {
      // 按裸目录处理
    }
    out.push({ id: entry.name, name, description, category: "general" });
  }
  return out;
}

export function readCoreSkillMd(skillId: string): string | null {
  const dir = corePackDir();
  if (!dir) return null;
  const skillMd = join(dir, "skills", skillId, "SKILL.md");
  if (!existsSync(skillMd)) return null;
  return readFileSync(skillMd, "utf-8");
}
