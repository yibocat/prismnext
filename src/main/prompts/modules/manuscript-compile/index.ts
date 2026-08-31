/** Manuscript compile
 * Segment: module
 * Answers: when to edit/verify the paper build (LaTeX or Typst)
 * Not here: standalone figure builds how-to; citation-health how-to
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { buildManuscriptCompilePrompt } from "./build";

export { buildManuscriptCompilePrompt };

export const MANUSCRIPT_COMPILE_MODULE: PromptModule = {
  key: "manuscript-compile",
  label: "Manuscript & paper compile",
  description:
    "Manuscript writing & build verify for LaTeX and Typst; entry from Workspace Manuscript folder pin.",
  enabled: true,
  profileOnly: true,
  source: "app",
  build: buildManuscriptCompilePrompt,
};
