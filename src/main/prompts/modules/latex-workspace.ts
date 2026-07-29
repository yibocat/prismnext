import type { PromptContext } from "../types";
import type { ManuscriptFolder } from "../../../renderer/types/workspace";
import { TOOL_NAMES } from "../../../shared/tool-names";

function manuscriptFolder(ctx: PromptContext): ManuscriptFolder | null {
  for (const d of ctx.workspaceDirs ?? []) {
    if (d.function === "manuscript" && "mainTex" in d && d.mainTex) {
      return d as ManuscriptFolder;
    }
  }
  return null;
}

/**
 * LaTeX workspace — soft workflow for writing and compile verification.
 * Shell compile is blocked in main (bash permission bridge); tool how-to on latex-* tools.
 */
export function buildLatexWorkspacePrompt(ctx: PromptContext): string {
  const manuscript = manuscriptFolder(ctx);

  const sourceLines = manuscript
    ? [
        `Manuscript sources live in **\`${manuscript.name}/\`** (main: \`${manuscript.mainTex}\`).`,
        "Folder roles are in **Workspace Folder Descriptions** — do not assume a fixed name like `manuscript/`.",
      ]
    : [
        "No manuscript folder is configured yet.",
        `Use **Workspace Folder Descriptions** and \`${TOOL_NAMES.latexRoot}\` when you need the main .tex.`,
      ];

  return [
    "## LaTeX workspace (writing & compile)",
    "",
    ...sourceLines,
    "Build output goes to **`.prismnext/compile/`** — edit `.tex` / `.bib` in the manuscript folder, not in the compile cache.",
    "",
    "### Soft workflow",
    "",
    `1. \`${TOOL_NAMES.latexRoot}\` when the document root or engine is unclear.`,
    "2. Edit sources under the configured manuscript folder.",
    `3. \`${TOOL_NAMES.latexCompile}\` to verify the build — read structured errors on failure, then fix and retry.`,
    "",
    "### Judgment",
    "",
    "- The UI (Cmd+Enter, `/compile`) and agent tools share the same compile pipeline.",
    `- Citation integrity: \`${TOOL_NAMES.citationHealth}\`; library → .bib sync: \`${TOOL_NAMES.literatureExportBib}\`.`,
    "- Project rules may specify naming, engine preference, or when to compile — defer to them.",
  ].join("\n");
}
