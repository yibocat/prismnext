/** Project-relative path to the living research design brief. */
export const RESEARCH_BRIEF_REL = ".prismnext/research/brief.md";

/** Canonical ## section titles (fixed template — tools patch by these names). */
export const RESEARCH_BRIEF_SECTIONS = [
  "Research question",
  "Background & motivation",
  "Hypotheses / claims",
  "Contribution & novelty",
  "Scope",
  "Assumptions",
  "Open questions",
  "Risks & limitations",
  "Related work gaps",
] as const;

export type ResearchBriefSection = (typeof RESEARCH_BRIEF_SECTIONS)[number];

export const RESEARCH_BRIEF_TEMPLATE = `# Research Brief

> Living design doc for this project. Agents: use \`research-brief-read\` / \`research-brief-update\` — not generic edit on this file.

## Research question
<!-- One clear question. FINER: Feasible, Interesting, Novel, Ethical, Relevant -->

## Background & motivation
<!-- Why this problem matters -->

## Hypotheses / claims
<!-- Falsifiable where possible -->

## Contribution & novelty
<!-- What's new vs baseline / prior work -->

## Scope
### In scope

### Out of scope

## Assumptions
<!-- What the design rests on — research-design-coach should pressure-test these -->

## Open questions
<!-- Unresolved decisions -->

## Risks & limitations
<!-- What could invalidate the approach -->

## Related work gaps
<!-- Themes to cover in lit review — optional [@bibkey] refs -->
`;

/** Normalize user/agent section input to a canonical section title. */
export function resolveResearchBriefSection(raw: string): ResearchBriefSection | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  for (const name of RESEARCH_BRIEF_SECTIONS) {
    if (name.toLowerCase() === lower) return name;
  }
  return null;
}
