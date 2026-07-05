import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { TOOL_NAMES } from "../../shared/tool-names";

/**
 * # prism‑next Built‑in Custom Tools Registry
 *
 * ## Architecture
 *
 * prism-next keeps built-in OpenCode tools in the app-level config directory:
 *   `$XDG_CONFIG_HOME/opencode/tools/`
 *
 * `AcpService` sets `XDG_CONFIG_HOME` to `<userData>/opencode-server/config/`,
 * so tools placed at `<userData>/opencode-server/config/opencode/tools/`
 * are discovered by OpenCode without creating project-level `.opencode/`.
 *
 * `AcpService.syncBuiltinTools()` copies the files defined in `src/main/tools/`
 * into that directory every time the app starts.
 *
 * ## Adding a new prism‑next built‑in tool
 *
 * ### Step 1 — Define the tool (OpenCode side)
 *
 * Create `src/main/tools/<tool-name>.ts`:
 *
 * ```typescript
 * import { tool } from "@opencode-ai/plugin"
 *
 * export default tool({
 *   description: "One-line description — the LLM uses this to decide whether to call the tool",
 *   args: {
 *     // Use tool.schema (Zod under the hood) to define typed params:
 *     engine: tool.schema
 *       .string()
 *       .describe("LaTeX engine to use")
 *       .optional(),
 *   },
 *   async execute(args, context) {
 *     // args          → typed params from the schema above
 *     // context.directory  → project working directory
 *     // context.sessionID  → current OpenCode session ID
 *     // context.agent      → agent name ("build", "plan", etc.)
 *     // context.abort      → AbortSignal for cancellation
 *     // context.worktree   → git worktree root (if applicable)
 *
 *     // Do the actual work here — full Node.js capabilities.
 *     // Return whatever the LLM should see as the tool result.
 *     return { success: true, message: "done" }
 *   },
 * })
 * ```
 *
 * **The file name (minus `.ts`) IS the tool name.**
 * To override an OpenCode built-in tool, name the file the same (e.g. `bash.ts`).
 *
 * **Self-contained only:** synced tool files run in OpenCode's Bun runtime.
 * Do not import from `../services/` or other Electron main-process modules.
 *
 * ### Step 2 — Register metadata
 *
 * Add an entry to `BUILTIN_TOOLS` below (including `usageHint` / `workflowRules`
 * for prompt generation). Also add to `src/shared/tool-names.ts`.
 *
 * ### Step 3 — Create the Widget (renderer side)
 *
 * Create `src/renderer/components/modules/chat/tools/<tool-name>-widget.tsx`
 * following the existing Widget pattern. Then register it in the
 * `CUSTOM_TOOL_WIDGETS` map in that directory's `index.tsx`.
 *
 * ### Step 4 — Register permission rules (if gated)
 *
 * Add an entry to `src/main/services/tool-permission-registry.ts`.
 *
 * ### Step 5 — Enable in OpenCode config (automatic)
 *
 * Add metadata to `BUILTIN_TOOLS` below. `AcpService.applyBuiltinToolsConfig()`
 * force-enables every `BUILTIN_TOOLS` entry on startup — the model will see the
 * tool without manual opencode.json edits.
 */

// ─── Tool metadata (used by renderer for Widget display) ────────────

export interface BuiltinToolMeta {
  /** Tool name (matches the file name without .ts extension) */
  name: string;
  /** Human-readable display label */
  label: string;
  /** Short description shown in tool Widget header */
  description: string;
  /** Category for grouping in UI and prompt guide */
  category: "compile" | "reference" | "project" | "utility";
  /** When to use and what it returns (OpenCode tool description) */
  usageHint?: string;
  /** Prohibitions and best practices (OpenCode tool description) */
  workflowRules?: string[];
}

/**
 * Registry of all prism‑next built-in custom tools.
 *
 * Add new tools here as they are created. The renderer uses this list
 * to look up metadata when rendering tool Widgets. OpenCode tool descriptions
 * are built from this registry via `buildOpencodeToolDescription()`.
 */
export const BUILTIN_TOOLS: BuiltinToolMeta[] = [
  {
    name: TOOL_NAMES.question,
    label: "Question",
    description: "Ask the user a question and pause until they respond (replaces built-in question tool)",
    category: "utility",
    usageHint: "Use when you need a user decision or clarification before continuing.",
  },
  {
    name: TOOL_NAMES.bash,
    label: "Shell",
    description: "Execute shell commands via Prism terminal bridge (pty mode)",
    category: "utility",
    usageHint: "Run shell commands in the project directory when file tools are insufficient.",
    workflowRules: [
      "Prefer dedicated file tools (move, delete) over bash for single-file operations.",
    ],
  },
  {
    name: TOOL_NAMES.delete,
    label: "Delete",
    description: "Delete a file (Prism custom tool — replaces bash rm for single files)",
    category: "utility",
    usageHint: "Delete a single file by path.",
    workflowRules: ["Do not use bash rm when this tool applies."],
  },
  {
    name: TOOL_NAMES.move,
    label: "Move",
    description: "Move or rename a file (Prism custom tool — replaces bash mv for single files)",
    category: "utility",
    usageHint: "Move or rename a single file.",
    workflowRules: ["Do not use bash mv when this tool applies."],
  },
  {
    name: TOOL_NAMES.literatureSearch,
    label: "Search Literature",
    description: "Search papers in the project literature library",
    category: "reference",
    usageHint:
      "Full-text search only within the local library (`.prismnext/library/library.db`). " +
      "Use to find papers already added to the project. Does NOT search the web.",
  },
  {
    name: TOOL_NAMES.literatureStage,
    label: "Stage Citation",
    description: "Verify DOI/arXiv via catalogs and stage as a session citation (no library write)",
    category: "reference",
    usageHint:
      "Verify a known DOI or arXiv ID via external catalogs (Crossref/arXiv/OpenAlex/…) " +
      "and stage a session citation. Returns metadata + a `refId`. No library write. " +
      "This is the DEFAULT for any paper you cite.",
    workflowRules: [
      "BINDING: Do not write any `[n]` markers or a paper recommendation list in text until " +
        "every `literature-stage` call for this turn has returned a verified refId.",
      "Do NOT use the Task tool or subagents to find, verify, or summarize external papers — " +
        "call `websearch` and `literature-stage` yourself in this conversation.",
      "Do not draft the reply first and stage later — websearch/discover identifiers, stage each " +
        "paper, then write one final reply using the returned refIds.",
      "For EVERY paper you mention, call this first with its exact DOI or arXiv ID, " +
        "then reference the returned `refId` as `[n]` in your text.",
      "Always use `[n]` markers (square brackets). Do NOT use markdown ordered lists " +
        "or bare numbers to refer to staged citations.",
      "Citation layout: one paper per line — `**Title** [n]` then a short summary. " +
        "Never mix list numbers with citation refs (bad: `4. [3]`; good: `**Title** [3]`).",
      "Never write the literal `[n]` placeholder — substitute the actual refId number.",
      "If `verified: false`, do NOT write `[n]`; tell the user the identifier could not be verified.",
      "Never invent DOIs — copy exact identifiers from websearch or the user message.",
      `Do not call ${TOOL_NAMES.literatureAdd} unless the user explicitly asks to add the paper to the library.`,
      "For topic discovery (e.g. recent papers), use websearch first, extract arXiv IDs/DOIs, " +
        "then stage each one. Do not list a paper with `[n]` unless staging succeeded.",
      "Reuse the same `[n]` when mentioning the same paper again in one reply.",
    ],
  },
  {
    name: TOOL_NAMES.literatureAdd,
    label: "Add Paper",
    description: "Add a paper to the library by verified DOI or arXiv ID (catalog lookup required)",
    category: "reference",
    usageHint: "Write a verified paper into the project library.",
    workflowRules: [
      'Use ONLY when the user explicitly says "add to library" / "加入文献库". Never auto-invoke.',
    ],
  },
  {
    name: TOOL_NAMES.literatureRead,
    label: "Read Paper",
    description: "Read library metadata, abstract, highlights, and PDF path (not PDF text) by bibkey",
    category: "reference",
    usageHint:
      "Lookup by exact bibkey (Cite key in Literature panel). " +
      "Returns metadata, abstract, publication_details, highlights, PDF path.",
    workflowRules: [
      "Do NOT substitute `task`, `websearch`, or `read` on library.db.",
      "When the user @-mentions a library paper, metadata is already in the prompt — " +
        "use this tool for highlights/annotations.",
      `Do NOT use ${TOOL_NAMES.literatureReadPdf} unless the paper is in the intensive reading list.`,
    ],
  },
  {
    name: TOOL_NAMES.literatureReadPdf,
    label: "Read Paper PDF",
    description: "Read extracted PDF body text from library cache (MinerU/pdfjs/HTML)",
    category: "reference",
    usageHint:
      "Read extracted PDF body text for a library paper by bibkey. " +
      "Returns Markdown from `.prismnext/library/extract/`. Supports `pages=` and `query=`. " +
      "Use ONLY for papers in the intensive reading list (see \"Intensive reading papers\" section).",
    workflowRules: [
      "If not extracted yet, call with `force=true` to start background extraction.",
      "When quoting PDF content in chat, cite as `[@bibkey]` (exact cite key) plus page numbers as `p.X`.",
      "Reserved for intensive reading mode — costs tokens to extract.",
    ],
  },
  {
    name: TOOL_NAMES.literatureCite,
    label: "Cite Paper",
    description: "Add a library paper to the project .bib bibliography",
    category: "reference",
    usageHint: "Append a library paper's BibTeX entry to the project `.bib` file.",
  },
  {
    name: TOOL_NAMES.literatureCiteCheck,
    label: "Library Cite Check",
    description:
      "Structured audit: every \\cite key in project .tex vs literature library.db bibkeys.",
    category: "reference",
    usageHint:
      "Prefer this over read/glob/grep on .tex or .bib when checking citation compliance, missing papers, " +
      "or whether cited keys exist in the library. Scans all project .tex automatically (no args). " +
      "Returns JSON: citeKeysInTex, missingKeys, unusedKeys, bibFallback (entries importable from manuscript .bib).",
    workflowRules: [
      "BINDING: Do not report .tex ↔ library citation compliance from read/glob/grep — call this tool and use its JSON.",
      "Do NOT use the Task tool or subagents to run this audit — call this tool in the current conversation.",
      "When the user asks to check citations or names this tool, invoke it directly — do not delegate.",
      "One call replaces manually listing \\cite keys and cross-checking library.db.",
      "For .tex vs references.bib file alignment, also call latex-bib-check before writing your audit summary.",
      "Do not write the compliance report until this tool and latex-bib-check have returned for this turn.",
    ],
  },
  {
    name: TOOL_NAMES.literatureExportBib,
    label: "Export Library to .bib",
    description: "Append literature library BibTeX entries into project references.bib",
    category: "reference",
    usageHint:
      "Default: append library entries for keys cited in .tex (skip keys already in .bib). " +
      "Use `all=true` for entire library; or pass explicit `bibkeys`.",
    workflowRules: [
      "Skips bibkeys already present in the project .bib by default.",
    ],
  },
  {
    name: TOOL_NAMES.latexRoot,
    label: "LaTeX Root",
    description: "Resolve LaTeX main file, engine, bib tool, and build directory",
    category: "compile",
    usageHint:
      "Call before editing or compiling when unsure which .tex is the document root. " +
      "Returns mainFile, engine, bibTool, buildDir (`.prismnext/compile`).",
    workflowRules: [
      "Prefer the workspace-configured manuscript folder and mainTex when present.",
      "Follow `% !TEX root` chains on disk — do not guess paths.",
    ],
  },
  {
    name: TOOL_NAMES.latexCompile,
    label: "LaTeX Compile",
    description: "Compile the project LaTeX document and return structured errors",
    category: "compile",
    usageHint:
      "Compile after substantive .tex or .bib edits. Returns success, pdfPath under `.prismnext/compile/`, " +
      "errorSummary, structured errors, and logTail — not raw PDF bytes.",
    workflowRules: [
      "Run `latex-root` first when main file is unknown.",
      "On failure, read errors/logTail before retrying — fix root cause, do not loop blindly.",
      "User can also compile via UI (Cmd+Enter) or `/compile` — this tool is for agent verification.",
    ],
  },
  {
    name: TOOL_NAMES.latexBibCheck,
    label: "Bib Check",
    description:
      "Structured audit: \\cite keys in .tex vs project .bib (and library.db when includeLibraryCheck).",
    category: "compile",
    usageHint:
      "Prefer this over read/glob on main.tex and references.bib when checking bibliography consistency, " +
      "missing or duplicate bibkeys, or reference format issues. Auto-detects main .tex and .bib paths. " +
      "Returns JSON: missingKeys, unusedKeys, duplicateKeys, bibPath, libraryCheck.",
    workflowRules: [
      "BINDING: Do not report .tex ↔ .bib alignment from read/glob/grep — call this tool and use its JSON.",
      "Do NOT use the Task tool or subagents to run this audit — call this tool in the current conversation.",
      "When the user asks to check bibliography or names this tool, invoke it directly — do not delegate.",
      "includeLibraryCheck defaults to true.",
      "One call replaces manually diffing .tex cites against the .bib file.",
      "For library.db-only gaps, also call literature-cite-check before writing your audit summary.",
      "Do not write the compliance report until this tool and literature-cite-check have returned for this turn.",
    ],
  },
];

// ─── Tool file loading (used by AcpService.syncBuiltinTools) ──────

export interface ToolFile {
  name: string;
  content: string;
}

/** Dev: `src/main/tools/`; packaged: `main/tools/` under app path. */
export function getToolsSourceDir(): string {
  return app.isPackaged
    ? join(app.getAppPath(), "main", "tools")
    : join(app.getAppPath(), "src", "main", "tools");
}

/** Shared helper copied alongside tools — not an OpenCode tool itself. */
export function readBridgePathsSource(): string | null {
  const path = join(getToolsSourceDir(), "bridge-paths.ts");
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Collect all built-in tool files from the source directory.
 *
 * In development mode, reads directly from `src/main/tools/` on disk.
 * In production (packaged), tools are bundled into the asar archive and
 * read via `app.getAppPath()`.
 *
 * Tool files are identified by the `.ts` extension. Each file's name
 * (without extension) becomes the tool name.
 */
export function getBuiltinToolFiles(): ToolFile[] {
  const toolsDir = getToolsSourceDir();

  if (!existsSync(toolsDir)) {
    return [];
  }

  const result: ToolFile[] = [];
  try {
    const entries = readdirSync(toolsDir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip the registry file itself and non-TypeScript files
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.startsWith("_")) continue;
      if (entry.name === "index.ts") continue;
      if (entry.name === "tool-description.ts") continue;
      if (entry.name === "bridge-paths.ts") continue;

      const name = entry.name.replace(/\.ts$/, "");
      const filePath = join(toolsDir, entry.name);
      try {
        const content = readFileSync(filePath, "utf-8");
        result.push({ name, content });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Directory listing failed — return empty
  }
  return result;
}
