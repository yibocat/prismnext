/**
 * Load host team skills into Pi Skill objects.
 * Does not scan ~/.pi or write OpenCode config.
 */

import { loadSkillsFromDir, type Skill } from "@earendil-works/pi-coding-agent";

export interface HostSkillDir {
  dir: string;
  source: string;
}

export function loadPiSkillsFromDirs(dirs: readonly HostSkillDir[]): Skill[] {
  const skills: Skill[] = [];
  const seen = new Set<string>();
  for (const item of dirs) {
    const dir = item.dir.trim();
    if (!dir) continue;
    const loaded = loadSkillsFromDir({
      dir,
      source: item.source.trim() || dir,
    });
    for (const skill of loaded.skills) {
      const key = skill.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      skills.push(skill);
    }
  }
  return skills;
}
