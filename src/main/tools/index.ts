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
    description: "Execute shell commands via prismnext terminal bridge (pty mode)",
    category: "utility",
    usageHint: "Run shell commands in the project directory when file tools are insufficient.",
    workflowRules: [
      "Prefer dedicated file tools (move, delete) over bash for single-file operations.",
    ],
  },
  {
    name: TOOL_NAMES.delete,
    label: "Delete",
    description: "Delete a file (prismnext custom tool — replaces bash rm for single files)",
    category: "utility",
    usageHint: "Delete a single file by path.",
    workflowRules: ["Do not use bash rm when this tool applies."],
  },
  {
    name: TOOL_NAMES.move,
    label: "Move",
    description: "Move or rename a file (prismnext custom tool — replaces bash mv for single files)",
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
      "Metadata search within the local library (`.prismnext/library/library.db`): title, abstract, authors, bibkey, tags, AI summary — NOT full text (use literature-read-pdf for PDF content). " +
      "Does NOT search the web or external catalogs. " +
      "Optional collection= filters by collection name; the response always includes a `collections` roster (id, name, paperCount).",
    workflowRules: [
      "BINDING: External topic / literature recommendations / papers not yet in the library → use literature-discover, NOT this tool.",
      "Use this tool only when the user asks about papers already in the project library, tags, or collections.",
    ],
  },
  {
    name: TOOL_NAMES.literatureDiscover,
    label: "Discover Literature",
    description: "Search external academic catalogs by topic (not the project library)",
    category: "reference",
    usageHint:
      "Keyword search across arXiv, Crossref, OpenAlex, Semantic Scholar, PubMed. " +
      "Returns candidate DOI/arXiv IDs. Does NOT search the local library and does NOT cite. " +
      "After choosing papers, call literature-stage for each DOI/arXiv before writing [n].",
    workflowRules: [
      "BINDING: Topic / external discovery uses literature-discover — not literature-search.",
      "BINDING: Never write [n] from discover hits alone — literature-stage each paper first (discoveredFrom: \"literature-discover\").",
      "Prefer focused queries; default sources are enough unless the user names a venue/server.",
    ],
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
      "BINDING: No `[n]` / paper list in reply until every stage call this turn returned a verified refId — `verified: false` means do not cite.",
      "BINDING: literature-discover only discovers IDs — stage each paper you will mention, then one reply with `[n]`. Do not bash/rg tool-output spills.",
      "Exact DOI/arXiv only — never invent. Do not delegate discovery/staging to a subagent when you can run it in this conversation.",
      "Layout: `**Title** [n]` + short summary per line; reuse `[n]` for the same paper; no markdown ordered-list citations.",
      `Do not call ${TOOL_NAMES.literatureAdd} unless the user explicitly asks to add to the library.`,
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
      "When figure paths appear in tool output, you may embed them with `![caption](path)` or `[@bibkey|images/fig-0.png]` if it helps the explanation — optional.",
      "Reserved for intensive reading mode — costs tokens to extract.",
      `If intensiveReadingRequired, call ${TOOL_NAMES.literatureIntensiveReading} action=add first — do not ask the user to @-toggle unless they refuse.`,
    ],
  },
  {
    name: TOOL_NAMES.literatureIntensiveReading,
    label: "Intensive Reading",
    description:
      "Add/remove/list papers on this chat's intensive-reading list (gate for literature-read-pdf)",
    category: "reference",
    usageHint:
      "action=add|remove|list by exact library bibkey. Enables literature-read-pdf for that paper in this chat session. " +
      "Prefer adding yourself when PDF body is needed.",
    workflowRules: [
      "Call action=add before literature-read-pdf when the paper is not yet intensive.",
      "Do not ask the user to manually @-toggle Intensive reading unless they refuse agent control.",
      "Only library papers (existing bibkeys) — discover/add to library first if missing.",
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
      "libraryCheck, bibFallback (importable entries; verified=false = unverifiable/suspected fabrication), bibKeysNotInLibrary. " +
      "verify defaults true.",
    workflowRules: [
      "BINDING: call this tool directly in this conversation — never via the Task tool or subagents, never substitute read/glob/grep on .tex or .bib.",
      "Do not write the compliance report until this tool has returned for this turn.",
      "bibFallback.verified=false → report as suspected fabrication; do NOT recommend importing unless the user confirms the identifier.",
      "Reuse the Session citation audit snapshot if present — do not re-run unless .tex/.bib changed or the user asks for a fresh check.",
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
      "Shell engines (pdflatex, xelatex, lualatex, latexmk, tectonic) are blocked in bash — use this tool only.",
    ],
  },
  {
    name: TOOL_NAMES.researchBriefRead,
    label: "Research Brief (read)",
    description: "Read the project research brief (`.brief.md` at project root — intellectual spine)",
    category: "project",
    usageHint:
      "Returns parsed markdown and any recognized `##` sections. " +
      "Creates the template file if missing. Sections are optional — the file may be free-form.",
    workflowRules: [
      "Call when project intent / through-line should ground the turn — not as session memory.",
      "Do not use generic read on .brief.md — use this tool.",
    ],
  },
  {
    name: TOOL_NAMES.researchBriefUpdate,
    label: "Research Brief (update)",
    description: "Update one section of the project research brief (when a matching ## heading exists)",
    category: "project",
    usageHint:
      "Patch a single section by canonical name when that `##` heading exists. " +
      "Use append=true to append. For wholesale rewrites, the user may edit in Files.",
    workflowRules: [
      "One section per call — do not rewrite the whole brief unless the user asked.",
      "Write section content in first person (I / we) — the researcher's voice, not third-person about the project.",
      "Do not use generic edit/write on .brief.md — use this tool only.",
      "research-design-coach does not write the brief — orchestrator applies updates after user confirmation.",
    ],
  },
  {
    name: TOOL_NAMES.projectRuleWrite,
    label: "Project Rule (write)",
    description: "Create or update a project rule under .prismnext/agent/rules/",
    category: "project",
    usageHint:
      "Persist stable user preferences (citation style, formatting, standing constraints). " +
      "Explicit remember → write; heuristic → AskQuestion first. apply=always only.",
    workflowRules: [
      "One concern per rule — prefer append to an existing related rule over many tiny rules.",
      "Do not store secrets, API keys, or one-off turn instructions.",
      "Do not use generic edit/write on RULE.md — use this tool only.",
      "Style/format preferences → project rule; project workflow narrative → AGENTS.md.",
    ],
  },
  {
    name: TOOL_NAMES.suggestPlan,
    label: "Suggest Plan",
    description:
      "Pause and show a 15s Enter Plan consent strip (timeout ≡ stay in Build)",
    category: "utility",
    usageHint:
      "You decide after thinking — research workspace, not an engineering IDE. " +
      "Call when work is multi-step / multi-phase: experiment design, hypotheses & factor matrices, " +
      "protocols, literature pipelines, staged analyses, etc. " +
      "CRITICAL: Plan is also for the design phase itself — not only later execution. " +
      "“Think through / discuss design” does NOT mean skip this tool and dump a long chat essay. " +
      "If phasing would help, call suggest-plan first (user can dismiss). " +
      "Skip only trivial one-shots (compile, typo, yes/no). Do not wait for the user to say “enter Plan”.",
    workflowRules: [
      "Do not invent “Plan = execution only” — design / hypotheses / factor matrices qualify.",
      "Do not claim Plan mode unless status is accepted.",
      "On accepted: follow `instruction` / write `draftPath` immediately — chat is not the plan of record.",
      "Do not use Task or prose markers for this — call suggest-plan.",
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
      "action=create opens a new experiment (registry + workspace folder + best-effort shared `.prismnext/.venv`); " +
      "action=list; action=read returns meta + lean recent runs plus oldestRun/latestRun; " +
      "action=append_run logs a run you describe; action=detect_env / open. " +
      "Requires a configured Experiment folder.",
    workflowRules: [
      "Do NOT use generic read/write/edit on registry files (meta.json / runs.jsonl) — use this tool only; the `<experiment-dir>/<id>/` layout is agent-owned.",
      "On create, briefLinks (sections + hypothesis excerpt) are optional but useful when `.brief.md` has a clear claim — not a completion gate.",
      "Python: one shared `.prismnext/.venv` for all islands — `uv pip install`. Never system Python / bare pip / per-island `.venv`.",
      "Do not delegate experiment reads/writes via Task — run this tool in the orchestrator conversation. no_experiment_folder → ask the user to add an Experiment folder in Settings.",
      "For “第一次 / 最新一次” use oldestRun / latestRun — runs[0] of a short window is not the first-ever run. includeOutput=true only when you truly need stdout/stderr tails.",
    ],
  },
  {
    name: TOOL_NAMES.experimentRun,
    label: "Experiment Run",
    description:
      "Run a shell command in the experiment island cwd (ensures shared `.prismnext/.venv`, injects it on PATH) " +
      "and append a structured run record to the registry.",
    category: "project",
    usageHint:
      "Run a command in an existing experiment workspace. Captures stdout/stderr tail + exit code, " +
      "optionally records artifacts/notes/kind you pass, appends one runs.jsonl line. " +
      "Long output spills to logs/<runId>.log (logPath on the run). Returns { ok, run, exitCode, stdoutTail }.",
    workflowRules: [
      "The experiment must already exist — call experiment-log action=create first.",
      "Use when you want execution plus structured logging in one step.",
      "Python: shared `.prismnext/.venv` is ensured before run; install with `uv pip install` — never system pip / bare pip.",
      "Non-Python runtimes: use a project-local toolchain when the user has one; still run via this tool so the run is logged.",
      "Pass artifacts/notes/kind when they matter for provenance — list every important result path (any file kind), not only images.",
      "After long runs, check run.logPath for the full log under the lab folder.",
      "When showing historical run figures, prefer run.artifactSnapshots (frozen images) over mutable working paths.",
    ],
  },
  {
    name: TOOL_NAMES.resultsSnapshot,
    label: "Results Snapshot",
    description:
      "Read-only scan of an experiment lab for figures, CSV tables, and JSON metrics. " +
      "Returns a compact textSummary plus structured lists (unparsed files listed for follow-up read).",
    category: "project",
    usageHint:
      "Call after experiment-run when summarizing results or picking figures for the paper. " +
      "Does not write meta/runs. Prefer results-snapshot for lab outputs; experiment-log read for run history.",
    workflowRules: [
      "Read-only — never writes the registry or lab.",
      "Complementary to experiment-log action=read (runs.jsonl) — use both for Methods.",
      "If a file is listed under unparsed, read it yourself with the generic read tool.",
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
  {
    name: TOOL_NAMES.interactionList,
    label: "Interaction List",
    description:
      "List Interaction objects in `.prismnext/interactions/` (summaries: id, title, kind, compute, revision).",
    category: "project",
    usageHint:
      "Discover which figures/plots exist before read/update, or when the user asks what Interactions are in the project.",
    workflowRules: [
      "Read-only — never writes spec.json.",
      "Do not grep the repo for interaction ids — use this tool or interaction-read.",
    ],
  },
  {
    name: TOOL_NAMES.interactionRead,
    label: "Interaction Read",
    description:
      "Read one Interaction spec from `.prismnext/interactions/<id>/spec.json` (full JSON + fenceMarkdown for Chat embed).",
    category: "project",
    usageHint: "Before updating an object, or to re-embed a card in chat after changes.",
    workflowRules: [
      "Read-only — use interaction-write to mutate.",
      "Do not use generic read on `.prismnext/interactions/**/spec.json` — use this tool.",
    ],
  },
  {
    name: TOOL_NAMES.interactionWrite,
    label: "Interaction Write",
    description:
      "Create or update an Interaction (figure.static or plot.line|plot.series|plot.scatter). Persists to `.prismnext/interactions/<id>/spec.json`. " +
      "figure.static needs an existing image path; plot.* needs an existing CSV + params.x/y. Returns fenceMarkdown — embed it in your assistant reply after success.",
    category: "project",
    usageHint:
      "When the user needs a saved figure or CSV chart in the RightArea panel (after savefig / experiment metrics CSV).",
    workflowRules: [
      "Allowed kinds: figure.static, plot.line, plot.series, plot.scatter — no invented numeric series.",
      "Write the image/CSV file to disk first; interaction-write rejects missing paths.",
      "Do NOT use ```artifact for Interaction objects — use interaction-write then ```interaction fence in your reply.",
      "Do NOT edit spec.json with generic write/edit — use this tool only.",
      "After ok:true, embed fenceMarkdown in the assistant message (not only in tool output).",
    ],
  },
  {
    name: TOOL_NAMES.interactionOpen,
    label: "Interaction Open",
    description:
      "Open an Interaction object in the RightArea panel (focus the tab).",
    category: "project",
    usageHint: "When the user asks to open/show the figure or plot in the side panel.",
    workflowRules: [
      "Does not write disk — use interaction-write to create or update.",
      "Still prefer embedding fenceMarkdown in chat so the user has a card entry.",
    ],
  },
  {
    name: TOOL_NAMES.imageDescribe,
    label: "Image Describe",
    description:
      "Describe an image file with the configured multimodal helper model",
    category: "utility",
    usageHint:
      "Use when you need to understand the contents of an image file (figure, chart, screenshot, diagram) " +
      "and you cannot view images directly. path may be absolute or project-relative and must stay inside " +
      "the project; png/jpg/jpeg/webp/gif up to 5 MB. Pass question to focus the description. " +
      "Returns the helper's text description — reason from it; the image itself is not shown to you.",
    workflowRules: [
      "On the not-configured error, ask the user to set a Multimodal helper in Settings → Models, then retry.",
      "Do not guess absolute paths outside the project root — the bridge rejects them.",
    ],
  },
];

// ─── Tool file loading (used by AcpService.syncBuiltinTools) ──────

export interface ToolFile {
  name: string;
  content: string;
}

/**
 * OpenCode tool `.ts` sources live under `src/main/tools/` in the repo.
 * Packaged asars also keep that path (electron-builder includes `src/`);
 * there is no `main/tools/` rewrite step in the current build.
 */
export function getToolsSourceDir(): string {
  const candidates = [
    join(app.getAppPath(), "src", "main", "tools"),
    // Legacy / mistaken packaged layout (never shipped correctly) — keep as fallback
    join(app.getAppPath(), "main", "tools"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0];
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

export function readPermissionBridgePollSource(): string | null {
  const path = join(getToolsSourceDir(), "permission-bridge-poll.ts");
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
      if (entry.name === "permission-bridge-poll.ts") continue;

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
