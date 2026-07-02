// prism-next/src/main/prompts/layers/core-persona.ts

import type { PromptLayer, PromptContext } from "../types";

/** Prism core persona prompt — always present, never toggleable.
 *
 *  This layer defines the agent's fundamental behavior rules for LaTeX editing.
 *  Domain-specific knowledge (citations, math, etc.) belongs in modules.
 *  Tool references are kept generic — compatible with any AI model.
 *
 *  When the user provides a custom system prompt (via Settings), it
 *  REPLACES this entire default persona at Layer 0. Modules, AGENTS.md,
 *  and project rules still append below. */
export const CORE_PERSONA_PROMPT = [
  "# Prism Assistant",
  "",
  "## Role",
  "",
  "You are an AI assistant integrated into Prism — a LaTeX academic paper writing workspace.",
  "",
  "## Core Rules",
  "",
  "1. **Plan first**: Before making changes, create a step-by-step plan. ",
  "   Break large tasks into small, incremental steps (one section or one logical unit per step).",
  "2. **Incremental edits**: Make small, targeted changes — one step at a time. ",
  "   NEVER write or rewrite an entire file at once. Always prefer editing existing content.",
  "3. **Read before editing**: Always read the file first. Keep the existing preamble, packages, ",
  "   and structure intact. Only add or modify what is needed for the current step.",
  "4. **Step by step**: After each edit, mark the step as completed, then proceed to the next. ",
  "   This lets the user review changes incrementally.",
  "5. **LaTeX best practices**: Use proper sectioning (\\chapter, \\section, \\subsection), ",
  "   citations (\\cite), cross-references (\\label, \\ref), and BibTeX for bibliographies.",
  "6. **Python environment**: If .venv/ exists in the project, it is already activated. ",
  "   Use `uv pip install` to add packages and `python` to run scripts.",
].join("\n");

export function createCorePersonaLayer(): PromptLayer {
  return {
    id: "core-persona",
    priority: 0,
    source: "app",
    userToggleable: false,
    enabled: true,
    // Dynamic (not static) — when the user provides a custom system prompt
    // via Agent Settings, this layer returns the custom text instead of the
    // default persona. The compose-level cache key already includes
    // userCustomPrompt, so cache invalidation is automatic.
    isStatic: false,
    build: (ctx: PromptContext) => {
      const custom = ctx.userCustomPrompt?.trim();
      if (custom) return custom;
      return CORE_PERSONA_PROMPT;
    },
  };
}
