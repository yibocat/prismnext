/** Infer OpenCode tool name from call input when ACP omits tool_name. */
export function inferToolNameFromInput(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const keys = Object.keys(input);
  const has = (k: string) => keys.includes(k);
  const obj = input as Record<string, unknown>;

  // experiment-run input is {id, command, artifacts?, notes?} - has `command`
  // like bash, but also `id` (the experiment slug). Distinguish BEFORE bash, or
  // the live tool-call display mislabels experiment-run as "bash" (the persisted
  // tool_name is correct, so reload shows the right name -> "live=bash /
  // reloaded=experiment-run" bug). bash has no `id` field.
  if (has("command") && has("id")) return "experiment-run";
  if (has("command")) return "bash";
  if (has("url")) return "webfetch";
  if (has("bibkey") && !has("file_path") && !has("filePath")) {
    if (has("pages") || has("force") || has("source")) return "literature-read-pdf";
    return "literature-read";
  }

  // DOI/arXiv without bibkey: prefer the safer literature-stage (no library write)
  // as the fallback inference. literature-add is reserved for explicit user intent
  // ("add to library") and is normally delivered via ACP tool_name directly.
  if ((has("doi") || has("arxivId") || has("arxiv_id")) && !has("bibkey") && !has("query")) {
    return "literature-stage";
  }

  if (has("query") && !has("pattern")) {
  if (has("max_results") || has("maxResults")) return "websearch";
  if (has("limit")) return "literature-search";
  // websearch is the most common tool with a bare `query` parameter.
  // literature-search typically also sends `limit`; without it, default to
  // websearch to avoid mislabeling as "task" via KIND_TO_TOOL["other"].
  return "websearch";
  }

  if (has("todos")) return "todowrite";
  if (has("question")) return "question";
  if (has("prompt") && (has("subagent_type") || has("subagentType") || has("agent"))) return "task";
  if (has("name") && keys.length <= 2) return "skill";

  if (has("file_path") || has("filePath")) {
    if (has("old_string") || has("new_string") || has("oldString") || has("newString")) return "edit";
    if (has("content") && !has("old_string") && !has("oldString")) return "write";
    if (has("description") && !has("offset") && !has("limit")) return "delete";
    if (!has("content") && !has("old_string") && !has("oldString")) return "read";
  }

  if (has("source_path") || has("sourcePath") || has("destination_path") || has("destinationPath")) {
    return "move";
  }

  if (has("pattern")) {
    if (has("include") || has("type") || has("glob")) return "grep";
    if (keys.every((k) => k === "pattern" || k === "path")) return "glob";
    return "grep";
  }

  if ((has("path") || has("directory")) && keys.length <= 2) return "glob";
  if (has("patch")) return "apply_patch";
  if (has("prompt") && keys.length <= 2) return "task";

  if (has("uri") || has("position") || has("symbol")) {
    if (has("references") || keys.some((k) => k.includes("reference"))) return "lsp_find_references";
    if (has("definition") || keys.some((k) => k.includes("definition"))) return "lsp_goto_definition";
    return "lsp";
  }

  return null;
}

function parseToolPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function unwrapToolOutput(payload: Record<string, unknown>): Record<string, unknown> {
  if (typeof payload.output === "string") {
    const inner = parseToolPayload(payload.output);
    if (inner) return inner;
  }
  return payload;
}

/** Correct mis-labeled websearch when output is clearly from literature-search. */
export function inferToolNameFromOutput(raw: unknown): string | null {
  const payload = parseToolPayload(raw);
  if (!payload) return null;

  const data = unwrapToolOutput(payload);
  const results = data.results;
  if (!Array.isArray(results) || results.length === 0) return null;

  const first = results[0];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const row = first as Record<string, unknown>;
    if (typeof row.bibkey === "string" || typeof row.bibKey === "string") {
      return "literature-search";
    }
  }
  return null;
}

export function resolveLiteratureToolTitle(title: string): string | null {
  const lower = title.toLowerCase();
  const match = lower.match(/^literature-(read-pdf|read|search|cite|add|stage)$/);
  return match ? lower : null;
}

/**
 * All Prism custom tool names — used to recover the tool name from the ACP
 * `title` field when `kind` is "other" (the default for custom tools). Without
 * this, custom tools like `citation-health` fall through to
 * `KIND_TO_TOOL["other"] = "task"` and render as task@general during LIVE
 * streaming. The persisted JSONL keeps the real name, so the bug only shows
 * live and disappears on reload/project-switch.
 */
const PRISM_TOOL_NAMES = new Set([
  "question", "bash", "delete", "move",
  "literature-search", "literature-stage", "literature-add",
  "literature-read", "literature-read-pdf", "literature-export-bib",
  "literature-delete", "citation-health", "latex-root", "latex-compile",
]);

export function resolvePrismToolTitle(title: string): string | null {
  const lower = title.toLowerCase().trim();
  return PRISM_TOOL_NAMES.has(lower) ? lower : null;
}

/**
 * OpenCode MCP tools are titled `{serverId}_{toolName}`
 * (e.g. `paper-search-mcp_search_arxiv`). Prefer this over input-shape
 * inference: paper-search MCP also sends `query` / `max_results`, which
 * would otherwise be mislabeled as `websearch` during live streaming.
 */
export function resolveMcpToolTitle(title: string): string | null {
  const lower = title.toLowerCase().trim();
  if (!lower) return null;
  // server slug (alnum/hyphen) + `_` + tool slug (alnum/underscore/hyphen)
  if (!/^[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9_-]*$/.test(lower)) return null;
  return lower;
}
