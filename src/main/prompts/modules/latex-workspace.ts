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
 * LaTeX workspace — build dir, compile chain, agent tool discipline.
 * Paths come from Workspace settings (functional folders), not hardcoded defaults.
 */
export function buildLatexWorkspacePrompt(ctx: PromptContext): string {
  const manuscript = manuscriptFolder(ctx);

  const sourceLines = manuscript
    ? [
        `LaTeX manuscript sources are in the configured folder **` +
          `\`${manuscript.name}/\`** (main file: \`${manuscript.mainTex}\`).`,
        "Folder roles and any custom descriptions are in **Workspace Folder Descriptions** — " +
          "do not assume a fixed directory name like `manuscript/`.",
      ]
    : [
        "This project has no manuscript folder in Workspace settings yet.",
        "Use **Workspace Folder Descriptions** for configured folders; call `" +
          `${TOOL_NAMES.latexRoot}\` to resolve the main .tex when writing.`,
      ];

  return [
    "## LaTeX workspace (writing & compile)",
    "",
    ...sourceLines,
    "Compilation output goes to **`.prismnext/compile/`** — sources are synced there before build; " +
      "edit `.tex` / `.bib` in the manuscript folder, not in the compile folder.",
    "",
    "### Agent compile chain (binding)",
    "",
    `- Run \`${TOOL_NAMES.latexRoot}\` and \`${TOOL_NAMES.latexCompile}\` **in this conversation** — do **not** wrap them in Task or sub-agents.`,
    `1. \`${TOOL_NAMES.latexRoot}\` — resolve main .tex, engine, bib tool, and manuscript folder when unsure.`,
    `2. Edit .tex / .bib under the configured manuscript folder with read/write/edit tools.`,
    `3. \`${TOOL_NAMES.latexCompile}\` — verify the document builds; read structured errors on failure.`,
    "",
    "### Notes",
    "",
    "- User can compile via UI (Cmd+Enter) or `/compile` — agent tools mirror that pipeline for verification.",
    `- \`${TOOL_NAMES.literatureExportBib}\` writes **library** papers into the project .bib; \`${TOOL_NAMES.citationHealth}\` validates **manuscript** .tex ↔ .bib ↔ library.`,
    "- Do not delete `.prismnext/compile/` manually — it is the incremental build cache.",
  ].join("\n");
}
