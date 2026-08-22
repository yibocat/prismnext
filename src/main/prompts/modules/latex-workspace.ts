import type { PromptContext } from "../types";
import type { ManuscriptFolder } from "../../../shared/workspace-folder";
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
 * LaTeX workspace — soft workflow for manuscript writing and paper compile.
 * Shell compile is blocked in main; tool how-to on latex-* tools.
 * Standalone / TikZ figures are out of scope — they are not the paper.
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
        `Use **Workspace Folder Descriptions** and \`${TOOL_NAMES.latexRoot}\` when you need the paper .tex.`,
      ];

  return [
    "## LaTeX workspace (writing & compile)",
    "",
    ...sourceLines,
    "Build output for the **paper** goes to **`.workbench/compile/`** — edit `.tex` / `.bib` in the manuscript folder,",
    "not in the compile cache.",
    "",
    "### Scope boundary",
    "",
    "- **This module** — locating the paper root, editing manuscript sources, and verifying the paper build.",
    "- **Workspace Folder Descriptions** — what each project folder is for (manuscript vs data vs figures).",
    "- **Citation & bibliography audit** — whether `\\cite{}` keys match `.bib` and the library;",
    "  run that before a compliance report, not instead of fixing compile errors.",
    "- **Literature library** — finding papers and `[@bibkey]` in chat; manuscript `\\cite{}` still lives in `.tex`/`.bib`.",
    "- A standalone / TikZ figure `.tex` (`\\documentclass{standalone}`) is not the paper and is not this module.",
    "",
    "### When this applies",
    "",
    "- User asks to write, restructure, or fix LaTeX in the manuscript.",
    "- User wants to compile, preview, or diagnose the **paper** PDF / paper build log.",
    "- You edited manuscript `.tex` or `.bib` and need to confirm the paper still builds.",
    "- Root file, engine, or bib tool is unclear before editing or compiling the paper.",
    "",
    "### Route the request",
    "",
    "Ask in order:",
    "",
    "1. **Which file is the paper root?**",
    `   - Unsure → \`${TOOL_NAMES.latexRoot}\` (respect workspace manuscript config and \`% !TEX root\` chains).`,
    "   - User @-mentions a manuscript `.tex` → confirm it is the paper root or a child included by the root.",
    "   - A standalone figure `.tex` is out of scope here.",
    "2. **Edit sources vs verify the paper build?**",
    "   - Prose/structure/macros → edit under the manuscript folder (sources only).",
    `   - Verify the paper after substantive edits → \`${TOOL_NAMES.latexCompile}\` (see that tool for errors/logTail).`,
    "3. **Compile error vs citation integrity?**",
    "   - Missing packages, undefined refs, engine errors → fix sources, then recompile the paper.",
    `   - Missing/unused keys, library gaps, fabrication risk → **Citation & bibliography audit** (\`${TOOL_NAMES.citationHealth}\`).`,
    `   - Need BibTeX entries from the library → \`${TOOL_NAMES.literatureExportBib}\` (Literature library module).`,
    "4. **User-triggered vs agent verification**",
    "   - User may compile the paper via UI (Cmd+Enter) or `/compile` — same pipeline as the paper compile tool.",
    "   - Use the tool when *you* need structured errors before replying; do not loop compile blindly.",
    "",
    "### Soft workflow",
    "",
    `1. \`${TOOL_NAMES.latexRoot}\` when the paper root or engine is unclear.`,
    "2. Edit sources under the configured manuscript folder — never the `.workbench/compile/` cache.",
    `3. \`${TOOL_NAMES.latexCompile}\` to verify the paper — failure handling lives on that tool.`,
    "",
    "### Judgment",
    "",
    "- Follow `% !TEX program` / workspace engine hints when choosing how to build the paper.",
    "- Figures/data usually live outside the manuscript folder — check Workspace Folder Descriptions before moving assets.",
    "- Compiling a figure file is not a paper verify.",
    "- A green paper compile does not prove citation compliance — separate concern, separate module.",
    "- When the contribution narrative is unclear, align manuscript structure with **Project brief** (`.brief.md`) before large rewrites.",
    "- Project rules may specify naming, engine preference, or when to compile — defer to them.",
  ].join("\n");
}
