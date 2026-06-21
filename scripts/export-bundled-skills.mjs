/**
 * Export bundled skills to resources/skills/
 * Run: node scripts/export-bundled-skills.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function buildSkillMd({ name, description, license, body }) {
  const lines = ["---", `name: ${name}`, `description: ${description}`];
  if (license) lines.push(`license: ${license}`);
  lines.push("---", "", body);
  return lines.join("\n");
}

const skills = [
  {
    id: "academic-citations",
    name: "academic-citations",
    description: "BibTeX/biblatex citation keys, \\cite commands, and bibliography hygiene",
    category: "academic",
    license: "MIT",
    body: `# Academic Citations

## When to use
- Adding or fixing citations and bibliography entries
- Choosing \\citep vs \\citet (natbib) or biblatex equivalents
- Resolving duplicate keys, missing entries, or wrong entry types

## Workflow
1. Locate the .bib file(s) and citation style (natbib/biblatex + biber/bibtex).
2. Prefer consistent cite keys: AuthorYearKeyword (e.g. Smith2020GNSS).
3. Use the project's existing \\cite macro style; do not mix natbib and biblatex syntax.
4. After edits, note if a recompile + biber/bibtex pass is required.`,
  },
  {
    id: "latex-figures-tables",
    name: "latex-figures-tables",
    description: "Figures, tables, subfloats, captions, and cross-references in LaTeX",
    category: "academic",
    license: "MIT",
    body: `# LaTeX Figures & Tables

## When to use
- Creating or refactoring figure/table environments
- Fixing float placement, captions, labels, or \\ref links

## Conventions
- Use \\label{fig:...} / \\label{tab:...} immediately after \\caption.
- Reference with \\ref{} or \\autoref{} consistently with the project preamble.
- Prefer booktabs for tables; avoid vertical rules unless the venue requires them.
- For subfigures, match the package already loaded (subcaption vs subfig).`,
  },
  {
    id: "math-equations",
    name: "math-equations",
    description: "Display math, align environments, notation, and equation referencing",
    category: "academic",
    license: "MIT",
    body: `# Math & Equations

## When to use
- Writing or cleaning up equations and mathematical notation
- Fixing align/align* numbering, split equations, or symbol macros

## Guidelines
- Use align or equation* for multi-line derivations; number only equations that are referenced.
- Define reusable symbols in the preamble or a macros file if the project has one.
- Keep notation consistent with earlier sections (vectors bold, operators upright, etc.).`,
  },
  {
    id: "paper-structure",
    name: "paper-structure",
    description: "IMRaD and venue-specific paper section structure and flow",
    category: "academic",
    license: "MIT",
    body: `# Paper Structure

## When to use
- Outlining or reorganizing sections for a journal/conference paper
- Improving narrative flow between Introduction, Methods, Results, Discussion

## Approach
1. State the contribution clearly in the Introduction (1 short paragraph).
2. Methods: reproducible steps, notation table if symbols are dense.
3. Results: lead with findings, then evidence (figures/tables).
4. Discussion: interpret results, limitations, future work — avoid repeating Results verbatim.`,
  },
  {
    id: "literature-review",
    name: "literature-review",
    description: "Synthesize prior work, compare methods, and write Related Work sections",
    category: "academic",
    license: "MIT",
    body: `# Literature Review

## When to use
- Drafting Related Work / Literature Review sections
- Comparing methods, datasets, or evaluation metrics across papers

## Method
- Group by theme or methodology, not chronology alone.
- For each theme: what was done, limitations, gap your work addresses.
- Use neutral, evidence-based comparisons; cite primary sources.`,
  },
  {
    id: "peer-review-response",
    name: "peer-review-response",
    description: "Structure rebuttal letters and point-by-point reviewer responses",
    category: "academic",
    license: "MIT",
    body: `# Peer Review Response

## When to use
- Writing rebuttals or revision cover letters
- Mapping reviewer comments to changes in the manuscript

## Format
- Quote or paraphrase each reviewer point.
- Response: thank → answer → cite manuscript change (section/line) → quote short diff if helpful.
- Mark major changes in the manuscript if the venue expects a marked-up version.`,
  },
  {
    id: "grant-proposal",
    name: "grant-proposal",
    description: "NSF/NIH-style proposals: aims, significance, innovation, approach",
    category: "academic",
    license: "MIT",
    body: `# Grant Proposal

## When to use
- Drafting specific aims, project summaries, or broader impacts

## Structure
- **Significance**: problem + why it matters now.
- **Innovation**: what is new vs state of the art.
- **Approach**: aims as testable milestones; risks + alternatives.
- Use active voice; define acronyms once; align budget/effort with aims.`,
  },
  {
    id: "thesis-dissertation",
    name: "thesis-dissertation",
    description: "Thesis chapter planning, front matter, and long-document LaTeX conventions",
    category: "academic",
    license: "MIT",
    body: `# Thesis & Dissertation

## When to use
- Organizing multi-chapter theses
- Front matter (abstract, acknowledgments), appendices, compilation order

## Notes
- Follow university template class/files if present in the project.
- Keep chapter labels consistent for \\ref across chapters.
- Separate publication-ready chapters from thesis-only commentary when required.`,
  },
  {
    id: "academic-english",
    name: "academic-english",
    description: "Formal academic tone, clarity, and common ESL fixes for STEM writing",
    category: "academic",
    license: "MIT",
    body: `# Academic English

## When to use
- Polishing prose for journals or conferences
- Reducing wordiness while keeping precision

## Rules
- Prefer active voice where the agent performed an action; passive for methods sometimes.
- One main idea per sentence in Abstract and Introduction.
- Avoid hype words ("novel", "groundbreaking") unless substantiated.
- Keep tense consistent within sections (past for experiments, present for facts).`,
  },
  {
    id: "data-analysis-report",
    name: "data-analysis-report",
    description: "Describe experiments, statistics, reproducibility, and results reporting",
    category: "academic",
    license: "MIT",
    body: `# Data Analysis Report

## When to use
- Documenting analysis pipelines, metrics, ablations, or statistical tests

## Checklist
- Data source, preprocessing, train/val/test splits.
- Metrics with definitions; confidence intervals or seeds when applicable.
- Figures: axes labels, units, sample sizes.
- State limitations and negative results honestly.`,
  },
  {
    id: "git-commit-messages",
    name: "git-commit-messages",
    description: "Write clear conventional commit messages from diffs or summaries",
    category: "general",
    license: "MIT",
    body: `# Git Commit Messages

## Format
\`\`\`
type(scope): short imperative summary

Optional body explaining why, not what.
\`\`\`

Types: feat, fix, docs, refactor, test, chore.
Keep subject ≤ 72 chars; body wrap at ~72.`,
  },
  {
    id: "code-review",
    name: "code-review",
    description: "Structured code review: correctness, edge cases, tests, maintainability",
    category: "general",
    license: "MIT",
    body: `# Code Review

## Order
1. Correctness and edge cases
2. API/design fit with existing code
3. Tests and error handling
4. Naming, readability, docs

Be specific: file/line, suggested fix, severity (blocker / nit).`,
  },
  {
    id: "debug-systematic",
    name: "debug-systematic",
    description: "Systematic debugging: reproduce, isolate, hypothesize, verify",
    category: "general",
    license: "MIT",
    body: `# Systematic Debugging

1. Reproduce reliably (minimal steps).
2. Read error messages and stack traces fully.
3. Bisect: last known good, narrow scope.
4. One hypothesis at a time; verify with logs/tests.
5. Fix root cause; add regression test when possible.`,
  },
  {
    id: "technical-writing",
    name: "technical-writing",
    description: "README, API docs, and user-facing technical explanations",
    category: "general",
    license: "MIT",
    body: `# Technical Writing

- Start with what it does and who it's for.
- Quick start before deep configuration.
- Code examples that run copy-paste.
- Document defaults, env vars, and failure modes.`,
  },
  {
    id: "api-design",
    name: "api-design",
    description: "REST/IPC API naming, versioning, errors, and consistency",
    category: "general",
    license: "MIT",
    body: `# API Design

- Nouns for resources; verbs for actions.
- Consistent error shape { code, message, details }.
- Version breaking changes; deprecate with timeline.
- Idempotent mutations where appropriate.`,
  },
  {
    id: "meeting-notes",
    name: "meeting-notes",
    description: "Turn messy notes into decisions, action items, and owners",
    category: "general",
    license: "MIT",
    body: `# Meeting Notes

## Output
- **Date / attendees**
- **Decisions** (bullet, past tense)
- **Action items** (owner, due date)
- **Open questions**`,
  },
];

const skillsDir = join(root, "resources", "skills");
mkdirSync(skillsDir, { recursive: true });

const manifest = {
  skills: skills.map(({ id, name, description, category, license }) => ({
    id,
    name,
    description,
    category,
    license,
  })),
};

writeFileSync(join(skillsDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

for (const skill of skills) {
  const dir = join(skillsDir, skill.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    buildSkillMd(skill),
    "utf-8",
  );
}

console.log(`Exported ${skills.length} skills to resources/skills/`);
