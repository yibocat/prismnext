export type SkillCategory = "academic" | "general";

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  academic: "Academic",
  general: "General",
};

export interface BundledSkillInfo {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  license?: string;
}
