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
    "Build output goes to **`.prismnext/compile/`** — edit `.tex` / `.bib` in the manuscript folder,",
    "not in the compile cache.",
    "",
    "### Scope boundary",
    "",
    "- **This module** — locating the document root, editing manuscript sources, and verifying builds.",
    "- **Workspace Folder Descriptions** — what each project folder is for (manuscript vs data vs figures).",
    "- **Citation & bibliography audit** — whether `\\cite{}` keys match `.bib` and the library;",
    "  run that before a compliance report, not instead of fixing compile errors.",
    "- **Literature library** — finding papers and `[@bibkey]` in chat; manuscript `\\cite{}` still lives in `.tex`/`.bib`.",
    "",
    "### When this applies",
    "",
    "- User asks to write, restructure, or fix LaTeX in the manuscript.",
    "- User wants to compile, preview PDF, or diagnose build/log errors.",
    "- You edited `.tex` or `.bib` and need to confirm the project still builds.",
    "- Root file, engine, or bib tool is unclear before editing or compiling.",
    "",
    "### Route the request",
    "",
    "Ask in order:",
    "",
    "1. **Which file is the document root?**",
    `   - Unsure → \`${TOOL_NAMES.latexRoot}\` (respect workspace manuscript config and \`% !TEX root\` chains).`,
    "   - User @-mentions a `.tex` file → confirm it is the root or a child included by the root.",
    "2. **Edit sources vs verify build?**",
    "   - Prose/structure/macros → edit under the manuscript folder (sources only).",
    `   - Verify after substantive edits → \`${TOOL_NAMES.latexCompile}\` (see that tool for errors/logTail).`,
    "3. **Compile error vs citation integrity?**",
    "   - Missing packages, undefined refs, engine errors → fix sources, then recompile.",
    `   - Missing/unused keys, library gaps, fabrication risk → **Citation & bibliography audit** (\`${TOOL_NAMES.citationHealth}\`).`,
    `   - Need BibTeX entries from the library → \`${TOOL_NAMES.literatureExportBib}\` (Literature library module).`,
    "4. **User-triggered vs agent verification**",
    "   - User may compile via UI (Cmd+Enter) or `/compile` — same pipeline as the compile tool.",
    "   - Use the tool when *you* need structured errors before replying; do not loop compile blindly.",
    "",
    "### Soft workflow",
    "",
    `1. \`${TOOL_NAMES.latexRoot}\` when the document root or engine is unclear.`,
    "2. Edit sources under the configured manuscript folder — never the `.prismnext/compile/` cache.",
    `3. \`${TOOL_NAMES.latexCompile}\` to verify — read structured errors on failure, fix root cause, then retry.`,
    "",
    "### Judgment",
    "",
    "- Follow `% !TEX program` / workspace engine hints; do not run shell engines in bash — use the compile tool.",
    "- On compile failure, read `errorSummary` / `errors` / `logTail` before changing unrelated files.",
    "- Figures/data usually live outside the manuscript folder — check Workspace Folder Descriptions before moving assets.",
    "- A green compile does not prove citation compliance — separate concern, separate module.",
    "- When the contribution narrative is unclear, align manuscript structure with **Project brief** (`.brief.md`) before large rewrites.",
    "- Project rules may specify naming, engine preference, or when to compile — defer to them.",
  ].join("\n");
}
