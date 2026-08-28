import type { PromptContext } from "../types";
import type { ManuscriptFolder } from "../../../shared/workbench/workspace-folder";
import { manuscriptMainFile } from "../../../shared/workbench/workspace-folder";
import { TOOL_NAMES } from "../../../shared/agent/tool-names";

function manuscriptFolder(ctx: PromptContext): ManuscriptFolder | null {
  for (const d of ctx.workspaceDirs ?? []) {
    if (d.function === "manuscript") return d as ManuscriptFolder;
  }
  return null;
}

/** Manuscript & paper compile — LaTeX and Typst (module key: `manuscript-compile`). */
export function buildManuscriptCompilePrompt(ctx: PromptContext): string {
  const manuscript = manuscriptFolder(ctx);
  const pin = manuscript ? manuscriptMainFile(manuscript) : undefined;

  const sourceLines = manuscript
    ? [
        pin
          ? `Manuscript sources live in **\`${manuscript.name}/\`**. Optional compile entry: \`${pin}\`.`
          : `Manuscript sources live in **\`${manuscript.name}/\`**. No main-file pin — resolve the root with \`${TOOL_NAMES.latexRoot}\` or \`${TOOL_NAMES.typstRoot}\` from the open file’s extension.`,
        "Folder roles are in **Workspace Folder Descriptions** — do not assume a fixed name like `manuscript/`.",
      ]
    : [
        "No manuscript folder is configured yet.",
        `Use **Workspace Folder Descriptions**, \`${TOOL_NAMES.latexRoot}\`, or \`${TOOL_NAMES.typstRoot}\` when you need the paper root.`,
      ];

  return [
    "## Manuscript & paper compile",
    "",
    ...sourceLines,
    "Paper build output goes to **`.workbench/compile/`** (Typst paper PDFs under **`.workbench/compile/typst/`**).",
    "Edit sources in the manuscript folder — not in the compile cache.",
    "When the user should open a file, tell them to open it in **Files**. Do not name a dedicated writing mode.",
    "",
    "### Scope boundary",
    "",
    "- **This module** — locating the paper root, editing manuscript sources, and verifying the paper build.",
    "- **Workspace Folder Descriptions** — what each project folder is for (manuscript vs data vs figures).",
    "- **Template Center / backups** — LaTeX scaffolds only (`main.tex` family). Typst manuscripts are not applied from the template catalog; scaffold `.typ` sources manually or via project rules.",
    "- **Citation & bibliography audit** — LaTeX only (`\\cite{}` vs `.bib` vs library).",
    "  Do not run citation-health on Typst manuscripts. Run that audit before a LaTeX compliance report, not instead of fixing compile errors.",
    "- **Literature library** — finding papers and `[@bibkey]` in chat; manuscript `\\cite{}` still lives in `.tex`/`.bib`.",
    "- A standalone / TikZ figure `.tex` (`\\documentclass{standalone}`) is not the paper and is not this module.",
    "- A `.typ` outside the manuscript folder compiles in place — not the paper Typst pipeline.",
    "",
    "### When this applies",
    "",
    "- User asks to write, restructure, or fix the paper (LaTeX or Typst).",
    "- User wants to compile, preview, or diagnose the **paper** PDF / paper build log.",
    "- You edited manuscript sources and need to confirm the paper still builds.",
    "- Root file or engine is unclear before editing or compiling the paper.",
    "",
    "### Route the request",
    "",
    "Ask in order:",
    "",
    "1. **Which engine and which file is the paper root?**",
    "   - `.tex` / `.ltx` → LaTeX tools. `.typ` → Typst tools. Never cross them.",
    `   - Unsure of the LaTeX root → \`${TOOL_NAMES.latexRoot}\` (workspace pin, \`% !TEX root\`).`,
    `   - Unsure of the Typst root → \`${TOOL_NAMES.typstRoot}\` (workspace pin, \`// !typst root\`).`,
    "   - User @-mentions a manuscript file → confirm it is the paper root or a child of the root.",
    "   - A standalone figure `.tex` or a `.typ` **outside** the manuscript folder is out of scope here.",
    `   - A \`.typ\` **under** the manuscript folder (including \`drafts/\`) is paper — one \`${TOOL_NAMES.typstCompile}\` call. Never also call \`${TOOL_NAMES.typstCompileStandalone}\`.`,
    "2. **Edit sources vs verify the paper build?**",
    "   - Prose/structure/macros → edit under the manuscript folder (sources only).",
    `   - Verify a LaTeX paper → \`${TOOL_NAMES.latexCompile}\`.`,
    `   - Verify a Typst paper → \`${TOOL_NAMES.typstCompile}\` once after edits. Do not loop compile/edit, and do not call both Typst compile tools.`,
    "3. **Compile error vs citation integrity?**",
    "   - Missing packages, undefined refs, engine errors → fix sources, then recompile the paper.",
    `   - LaTeX missing/unused keys, library gaps → **Citation & bibliography audit** (\`${TOOL_NAMES.citationHealth}\`).`,
    `   - Need BibTeX entries from the library → \`${TOOL_NAMES.literatureExportBib}\` (Literature library module).`,
    "4. **User-triggered vs agent verification**",
    "   - The user compiles from a Files tab (`.tex` / `.typ`) or Cmd+Enter — same engine family as the matching tool.",
    "   - Use the tool when *you* need structured errors before replying; do not loop compile blindly.",
    "   - If compile still fails, report the errors and stop. Do not keep rewriting the same file in a loop.",
    "",
    "### Soft workflow",
    "",
    `1. \`${TOOL_NAMES.latexRoot}\` or \`${TOOL_NAMES.typstRoot}\` when the paper root is unclear.`,
    "2. Edit sources under the configured manuscript folder — never the `.workbench/compile/` cache.",
    `3. \`${TOOL_NAMES.latexCompile}\` or \`${TOOL_NAMES.typstCompile}\` to verify the paper — failure handling lives on that tool.`,
    "",
    "### Judgment",
    "",
    "- Follow `% !TEX program` / workspace engine hints for LaTeX. Typst uses the bundled or Host `typst` binary.",
    "- Figures/data usually live outside the manuscript folder — check Workspace Folder Descriptions before moving assets.",
    "- Compiling a figure file is not a paper verify.",
    "- A green paper compile does not prove citation compliance — separate concern, separate module, LaTeX only.",
    "- When the contribution narrative is unclear, align manuscript structure with **Project brief** (`.brief.md`) before large rewrites.",
    "- Project rules may specify naming, engine preference, or when to compile — defer to them.",
  ].join("\n");
}
