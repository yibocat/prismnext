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

/** Manuscript writing & build verify — LaTeX and Typst (module key: `manuscript-compile`). */
export function buildManuscriptCompilePrompt(ctx: PromptContext): string {
  const manuscript = manuscriptFolder(ctx);
  const pin = manuscript ? manuscriptMainFile(manuscript) : undefined;

  const sourceLines = manuscript
    ? [
        pin
          ? `Manuscript sources live in **\`${manuscript.name}/\`**. Workspace compile entry: **\`${pin}\`** (from Settings → Workspace).`
          : `Manuscript sources live in **\`${manuscript.name}/\`**. No compile entry pin — use the file the user @-mentions or infer from context; otherwise read the Manuscript folder.`,
        "Folder roles and pins are in **Workspace Folder Descriptions** — do not invent a fixed folder name like `manuscript/`.",
      ]
    : [
        "No Manuscript folder is configured yet.",
        "When the user works on a paper, check **Workspace Folder Descriptions** for the Manuscript folder and its optional compile entry pin.",
      ];

  return [
    "## Manuscript (LaTeX & Typst)",
    "",
    ...sourceLines,
    "Edit sources in the Manuscript folder — not in `.workbench/compile/latex/` or `.workbench/compile/typst/` (build cache).",
    "When the user should open a file, tell them to open it in **Files**.",
    "",
    "### Where the manuscript entry is",
    "",
    "- **Truth source:** the functional **Manuscript** workspace folder + its optional **compile entry** pin (`.tex` or `.typ`).",
    "- **No root-resolve tool** — read **Workspace Folder Descriptions**; use `@`-mentioned paths or `read` / `ls` / `grep` for other `.tex` / `.typ` files (figures, drafts).",
    "- Magic comments (`% !TEX root`, `// !typst root`) may exist on disk but the workspace pin wins when set.",
    "",
    "### Scope boundary",
    "",
    "- **This module** — editing manuscript sources and verifying the paper build after your edits.",
    "- **Workspace Folder Descriptions** — which folder is Manuscript vs figures/data.",
    "- **Template Center** — LaTeX scaffolds only. Typst manuscripts are scaffolded manually or via project rules.",
    `- **Citation & bibliography audit** — manuscript cite keys vs \`.bib\` vs library (\`${TOOL_NAMES.citationHealth}\`; scans both LaTeX and Typst sources).`,
    "- **Literature library** — project papers and chat `[@bibkey]`; export to `.bib` via Literature tools when needed.",
    "- **Non-manuscript `.tex` / `.typ`** — slides, templates, one-off drafts, or figure sources **outside** the paper build: `read` the path; use standalone build tools when a PDF is needed; figure skills (TikZ / CeTZ) are one common case, not the only one.",
    "",
    "### When this applies",
    "",
    "- User asks to write, optimize, restructure, or fix the **paper** (LaTeX or Typst).",
    "- You edited manuscript sources and need to verify the build before replying.",
    "- Engine or entry file is unclear — re-read Workspace Folder Descriptions and the Manuscript folder first.",
    "",
    "### Route the request",
    "",
    "1. **Which engine?** `.tex` / `.ltx` → LaTeX tools. `.typ` → Typst tools. Never cross them.",
    "2. **Manuscript vs other file?**",
    "   - Paper entry → Manuscript folder pin (or user @-mention) + manuscript build tool below.",
    "   - Other `.tex` / `.typ` (not the paper entry) → `read` the path; standalone build tool if they need a PDF; no special locate tool.",
    "3. **Edit vs verify?**",
    "   - Prose/structure → `edit` / `write` under the Manuscript folder.",
    `   - Verify LaTeX manuscript → \`${TOOL_NAMES.latexCompile}\` (once after edits).`,
    `   - Verify Typst manuscript → \`${TOOL_NAMES.typstCompile}\` (once after edits; use returned errors).`,
    "4. **Build error vs citation integrity?**",
    "   - Engine/syntax/ref errors → fix sources, rebuild once.",
    `   - Missing/unused cite keys → \`${TOOL_NAMES.citationHealth}\` (Citation & bibliography audit module).`,
    "",
    "### Soft workflow",
    "",
    "1. Read **Workspace Folder Descriptions** for Manuscript folder + compile entry.",
    "2. `read` / `edit` manuscript sources (and included files as needed).",
    `3. \`${TOOL_NAMES.latexCompile}\` or \`${TOOL_NAMES.typstCompile}\` to verify — stop on failure; do not loop blindly.`,
    "",
    "### Judgment",
    "",
    "- User compiles from Files (Cmd+Enter) — same engines; you use build tools when *you* need structured errors in chat.",
    `- A green manuscript build does not prove citation compliance — use \`${TOOL_NAMES.citationHealth}\` when that is the question.`,
    "- Project rules may specify engine preference or when to verify — defer to them.",
  ].join("\n");
}
