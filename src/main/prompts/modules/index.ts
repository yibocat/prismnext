// prism-next/src/main/prompts/modules/index.ts

import type { PromptModule, PromptContext } from "../types";
import { ACADEMIC_WRITING_PROMPT } from "./academic-writing";
import { CITATIONS_PROMPT } from "./citations";
import { FIGURES_TABLES_PROMPT } from "./figures-tables";
import { MATH_EQUATIONS_PROMPT } from "./math-equations";
import { buildWorkspacePrompt } from "./workspace-folders";

/** All available prompt modules.
 *
 *  `workspace-folders` is the only module enabled by default — it generates
 *  functional folder descriptions from the project's workspace config.
 *
 *  The other four modules are EXAMPLE templates that users can enable
 *  globally via Settings → Agent → Prompt Modules. They are NOT injected
 *  unless the user explicitly turns them on.
 */
export const ALL_MODULES: PromptModule[] = [
  {
    key: "workspace-folders",
    label: "Workspace Folder Descriptions",
    description:
      "Auto-generated from project workspace configuration. " +
      "Tells the agent about each functional folder and its purpose.",
    enabled: true,
    source: "project",
    build: (ctx: PromptContext) =>
      ctx.workspaceDirs ? buildWorkspacePrompt(ctx.workspaceDirs) : "",
  },
  {
    key: "academic-writing",
    label: "Academic Writing",
    description: "Sectioning, abstracts, cross-references, footnotes, hyperref.",
    enabled: false,
    source: "app",
    prompt: ACADEMIC_WRITING_PROMPT,
  },
  {
    key: "citations",
    label: "Citations & Bibliography",
    description: "BibTeX, BibLaTeX, cite commands, bibliography management.",
    enabled: false,
    source: "app",
    prompt: CITATIONS_PROMPT,
  },
  {
    key: "figures-tables",
    label: "Figures & Tables",
    description: "Floats, captions, booktabs, subcaption, graphicx.",
    enabled: false,
    source: "app",
    prompt: FIGURES_TABLES_PROMPT,
  },
  {
    key: "math-equations",
    label: "Math & Equations",
    description: "AMS packages, align, matrices, theorem environments.",
    enabled: false,
    source: "app",
    prompt: MATH_EQUATIONS_PROMPT,
  },
];
