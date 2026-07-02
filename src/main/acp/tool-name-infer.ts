/** Infer OpenCode tool name from call input when ACP omits tool_name. */
export function inferToolNameFromInput(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const keys = Object.keys(input);
  const has = (k: string) => keys.includes(k);
  const obj = input as Record<string, unknown>;

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
