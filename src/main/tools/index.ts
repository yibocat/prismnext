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
      "Use to find papers already added to the project. Does NOT search the web. " +
      "Optional collection= filters by collection name; the response always includes a `collections` roster (id, name, paperCount).",
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
      "BINDING: Paper Search MCP `search_papers` discovers identifiers only — it does NOT create " +
        "session citations. After MCP search, you MUST call `literature-stage` for every paper " +
        "you will mention before writing any reply.",
      "Do NOT use the Task tool or subagents to find, verify, or summarize external papers — " +
        "discover identifiers (Paper Search MCP `search_papers` first, then stage) yourself in this conversation.",
      "Do not draft the reply first and stage later — discover identifiers (Paper Search MCP), stage each " +
        "paper, then write one final reply using the returned refIds.",
      "For EVERY paper you mention, call this first with its exact DOI or arXiv ID, " +
        "then reference the returned `refId` as `[n]` in your text.",
      "Always use `[n]` markers (square brackets). Do NOT use markdown ordered lists " +
        "or bare numbers to refer to staged citations.",
      "Citation layout: one paper per line — `**Title** [n]` then a short summary. " +
        "Never mix list numbers with citation refs (bad: `4. [3]`; good: `**Title** [3]`).",
      "Never write the literal `[n]` placeholder — substitute the actual refId number.",
      "If `verified: false`, do NOT write `[n]`; tell the user the identifier could not be verified.",
      "Never invent DOIs — copy exact identifiers from Paper Search MCP results or the user message.",
      `Do not call ${TOOL_NAMES.literatureAdd} unless the user explicitly asks to add the paper to the library.`,
      "For topic discovery (e.g. recent papers), call Paper Search MCP `search_papers` first, extract arXiv IDs/DOIs, " +
        "stage each with `discoveredFrom: \"paper-search-mcp\"`. Use websearch only if MCP is unavailable.",
      "Reuse the same `[n]` when mentioning the same paper again in one reply.",
    ],
  },
  {
    name: TOOL_NAMES.literatureAdd,
    label: "Add Paper",
    description: "Add a paper to the library by verified DOI or arXiv ID (catalog lookup required)",
    category: "reference",
    usageHint: "Write a verified paper into the project library. Optional collection= adds the new paper to a named collection (must already exist).",
    workflowRules: [
      'Use ONLY when the user explicitly says "add to library" / "加入文献库". Never auto-invoke.',
    ],
  },
  {
    name: TOOL_NAMES.literatureDelete,
    label: "Delete Paper",
    description: "Delete a paper from the project literature library by bibkey",
    category: "reference",
    usageHint:
      "Remove a paper from `.prismnext/library/library.db` by exact bibkey. " +
      "Also cleans up its PDF cache and annotations.",
    workflowRules: [
      'Use ONLY when the user explicitly says "delete" / "remove" / "删除" a paper. Never auto-invoke.',
      "Destructive — confirm the bibkey with the user before calling if there is any ambiguity.",
      "Prefer confirming the paper via literature-read first when unsure which paper to remove.",
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
    name: TOOL_NAMES.citationHealth,
    label: "Citation Health",
    description:
      "Unified citation health audit: every \\cite key in .tex ↔ project .bib ↔ literature library.db in one call.",
    category: "reference",
    usageHint:
      "Single source of truth for citation compliance — replaces separate bib-check and library-check calls. " +
      "Scans all project .tex automatically. Returns JSON: bibCheck (missingKeys, unusedKeys, duplicateKeys, bibPath), " +
      "libraryCheck (missingKeys, unusedKeys), bibFallback (entries importable from manuscript .bib; each entry has " +
      "verified=true/false when verify=true — true means DOI/arXiv resolved in catalogs = traceable, false = unverifiable/fabricated), " +
      "bibKeysNotInLibrary. verify defaults true.",
    workflowRules: [
      "BINDING: call this tool directly in this conversation — never via the Task tool or subagents, never substitute read/glob/grep on .tex or .bib.",
      "When the user asks to check citations, bibliography, or references, invoke this tool directly — do not delegate.",
      "One call returns the full .tex ↔ .bib ↔ library picture — do not also call latex-bib-check or literature-cite-check (removed).",
      "Do not write the compliance report until this tool has returned for this turn.",
      "When verify=true, bibFallback.verified flags fabricated/untraceable references — report unverified entries as suspected fabrication, and do NOT recommend importing them unless the user confirms the identifier.",
      "Reuse the Session citation audit snapshot if present below — do not re-run unless .tex/.bib changed or the user asks for a fresh check.",
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
    name: TOOL_NAMES.researchBriefRead,
    label: "Research Brief (read)",
    description: "Read the project research design brief (.prismnext/research/brief.md)",
    category: "project",
    usageHint:
      "Returns parsed sections: research question, hypotheses, contribution, scope, assumptions, open questions, etc. " +
      "Creates the template file if missing.",
    workflowRules: [
      "Call before research-design discussions or delegating to research-design-coach.",
      "Do not use generic read on brief.md — use this tool.",
    ],
  },
  {
    name: TOOL_NAMES.researchBriefUpdate,
    label: "Research Brief (update)",
    description: "Update one section of the project research brief",
    category: "project",
    usageHint: "Patch a single canonical section by name. Use append=true to append instead of replace.",
    workflowRules: [
      "One section per call — do not rewrite the whole brief.",
      "Do not use generic edit/write on brief.md — use this tool only.",
      "research-design-coach does not write the brief — orchestrator applies updates after user confirmation.",
    ],
  },
  {
    name: TOOL_NAMES.experimentLog,
    label: "Experiment Log",
    description:
      "Experiment island CRUD + run reading (list / create / read / append_run / detect_env). " +
      "Registry: `.prismnext/experiments/<id>/` (meta.json + runs.jsonl). " +
      "Workspace lab: `<experiment-dir>/<id>/` (clean folder — agent-owned layout).",
    category: "project",
    usageHint:
      "action=create opens a new experiment (registry + workspace folder + best-effort shared `<experiment-dir>/.venv`); action=list lists experiments; " +
      "action=read returns meta + recent runs; action=append_run logs a run you describe; " +
      "action=detect_env / open ensure shared `.venv` then snapshot or focus UI. Requires a configured Experiment folder.",
    workflowRules: [
      "Do NOT use generic read/write/edit on `.prismnext/experiments/**/meta.json` or runs.jsonl — use this tool only.",
      "Do not write meta.json or runs.jsonl under the Workspace experiment folder — registry only.",
      "Before create, call research-brief-read and pass briefLinks (sections + hypothesis excerpt).",
      "Python packages: one shared `<experiment-dir>/.venv` for all islands — `uv pip install` from workspace or island cwd. " +
      "Never system Python; never create a separate `.venv` under each island.",
      "Workspace layout inside `<experiment-dir>/<id>/` is agent-owned — no prescribed scripts/results dirs.",
      "If no_experiment_folder is returned, ask the user to add an Experiment folder in Settings → Workspace.",
      "Do not delegate experiment reads/writes via Task — run this tool in the orchestrator conversation.",
    ],
  },
  {
    name: TOOL_NAMES.experimentRun,
    label: "Experiment Run",
    description:
      "Run a shell command in the experiment island cwd (ensures shared Experiment `.venv`, injects it on PATH) " +
      "and append a structured run record to the registry.",
    category: "project",
    usageHint:
      "Run a command in an existing experiment workspace. Captures stdout/stderr tail + exit code, " +
      "optionally records artifacts/notes you pass, appends one runs.jsonl line. Returns { ok, run, exitCode, stdoutTail }.",
    workflowRules: [
      "The experiment must already exist — call experiment-log action=create first.",
      "Use when you want execution plus structured logging in one step.",
      "Python: shared `<experiment-dir>/.venv` is ensured before run; install with `uv pip install` — never system pip.",
      "Pass artifacts/notes when they matter for provenance.",
    ],
  },
  {
    name: TOOL_NAMES.provenanceQuery,
    label: "Provenance Query",
    description:
      "Read-only trace of experiment runs and downloaded files from `.prismnext/provenance.jsonl` " +
      "(resolve_artifact -> the run that produced a file; resolve_run -> a run by id; list_recent -> recent events).",
    category: "project",
    usageHint:
      "Trace an artifact path back to the run that produced it (command, env, exit, chatSessionId) - useful when writing " +
      "Methods or reproducing a figure. Returns null/empty when nothing is recorded (honest, not an error).",
    workflowRules: [
      "Read-only - never writes. Use it to verify which command/env produced an output file.",
      "When writing Methods, cite the real command from provenance instead of guessing.",
      "Not finding a file in provenance usually means it was manually copied or the run predates provenance.",
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
