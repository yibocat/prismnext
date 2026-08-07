/**
 * Regenerate resources/skills/manifest.json from the skill folders.
 * Run: node scripts/export-bundled-skills.mjs
 *
 * `resources/skills/<id>/` is the single source of truth. A skill is a whole
 * folder: SKILL.md (entry, loaded on invoke) plus optional references/,
 * templates/, scripts/, assets/ (read on demand — progressive disclosure).
 * This script only derives the manifest from each folder's SKILL.md
 * frontmatter, so manifest and files can never drift.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "resources", "skills");

/** skill-id → manifest category (renderer union: "academic" | "general"). */
const CATEGORIES = {
  "critical-review": "academic",
  "experiment-design-matrix": "academic",
  "experiment-to-methods": "academic",
  "figure-interaction": "academic",
  "figure-matplotlib": "academic",
  "figure-observable-plot": "academic",
  "figure-pipeline": "academic",
  "figure-tikz": "academic",
  "hypothesis-design": "academic",
  "idea-lab": "academic",
  "intensive-reading-notes": "academic",
  "management-science-empirical": "academic",
  "manuscript-preflight": "academic",
  "math-lattice": "academic",
  "math-manifold": "academic",
  "math-numeric": "academic",
  "ml-research-protocol": "academic",
  "prisma-systematic-review": "academic",
  "rebuttal-letter": "academic",
  "skill-creator": "general",
  "statistical-rigor": "academic",
  "symbolic-math": "academic",
  "writing-conclusion": "academic",
  "writing-design": "academic",
  "writing-introduction": "academic",
  "writing-methods": "academic",
  "writing-preliminaries": "academic",
  "writing-related-work": "academic",
  "writing-results": "academic",
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

function frontmatterField(block, key) {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

const skills = [];
for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
  const skillMdPath = join(skillsDir, entry.name, "SKILL.md");
  if (!existsSync(skillMdPath)) continue;

  const content = readFileSync(skillMdPath, "utf-8");
  const fm = content.match(FRONTMATTER_RE);
  if (!fm) throw new Error(`${entry.name}: SKILL.md has no frontmatter`);
  const name = frontmatterField(fm[1], "name");
  const description = frontmatterField(fm[1], "description");
  const license = frontmatterField(fm[1], "license") || "MIT";
  if (!name || !description) {
    throw new Error(`${entry.name}: frontmatter needs name + description`);
  }
  if (name !== entry.name) {
    throw new Error(`${entry.name}: folder name must match frontmatter name "${name}"`);
  }

  skills.push({
    id: entry.name,
    name,
    description,
    category: CATEGORIES[entry.name] ?? "academic",
    license,
  });
}

skills.sort((a, b) => a.id.localeCompare(b.id));

const manifestPath = join(skillsDir, "manifest.json");
mkdirSync(skillsDir, { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify({ skills }, null, 2)}\n`);
console.log(`manifest.json: ${skills.length} skills`);
