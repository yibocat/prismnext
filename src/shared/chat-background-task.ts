/**
 * OpenCode background Task shapes (experimental flag).
 * Sync Task (omit `background`) is unchanged — terminal tool_result ≈ child done.
 * Background: early tool_result is "started"; real done arrives via inject / child settle.
 */

export type BackgroundTaskInjectState = "running" | "completed" | "error";

export type BackgroundTaskInject = {
  sessionId: string;
  state: BackgroundTaskInjectState;
  summary?: string;
  body?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

/** Prefer metadata.background; also accept rawInput.background === true. */
export function hasBackgroundTaskFlag(opts: {
  metadata?: unknown;
  rawInput?: unknown;
}): boolean {
  const meta = asRecord(opts.metadata);
  if (meta?.background === true) return true;
  const input = asRecord(opts.rawInput);
  if (input?.background === true) return true;
  return false;
}

/**
 * Early Timeline-A return for `Task(..., background: true)`.
 * Must NOT be treated as subagent completion.
 */
export function isBackgroundTaskStartedResult(opts: {
  metadata?: unknown;
  rawInput?: unknown;
  content?: unknown;
}): boolean {
  const text = contentToString(opts.content);
  const flagged = hasBackgroundTaskFlag(opts);
  const meta = asRecord(opts.metadata);
  if (meta?.background === true) {
    // Explicit metadata — still require not-already-completed inject shape.
    if (isBackgroundTaskJoinInject(text)) return false;
    return true;
  }
  if (flagged && /(?:state|status)\s*=\s*["']running["']/i.test(text)) return true;
  if (
    /(?:state|status)\s*=\s*["']running["']/i.test(text)
    && /Background task started/i.test(text)
  ) {
    return true;
  }
  if (/The task is working in the background/i.test(text)) return true;
  return false;
}

/** Child / job id from early background result metadata or `<task id="…">`. */
export function extractBackgroundTaskSessionId(opts: {
  metadata?: unknown;
  content?: unknown;
}): string | null {
  const meta = asRecord(opts.metadata);
  for (const key of ["sessionId", "sessionID", "jobId", "jobID"] as const) {
    const v = meta?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const parsed = parseBackgroundTaskMarkup(contentToString(opts.content));
  return parsed?.sessionId ?? null;
}

/** Wrapped form: `<task id state|status>…</task>` (docs + many live injects). */
const TASK_WRAP_RE = /<task\b([^>]*)>([\s\S]*?)<\/task>/gi;
/**
 * Alternate live inject: standalone
 * `<task_result id="ses_…" status="completed">…</task_result>`
 * (seen in session transcript after reopen — no wrapping `<task>`).
 */
const TASK_RESULT_STANDALONE_RE =
  /<task_result\b([^>]*)>([\s\S]*?)<\/task_result>/gi;
const TASK_ERROR_STANDALONE_RE =
  /<task_error\b([^>]*)>([\s\S]*?)<\/task_error>/gi;

function parseAttrs(attrChunk: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrChunk))) {
    out[m[1]!.toLowerCase()] = m[2]!;
  }
  return out;
}

function normalizeInjectState(raw: string): BackgroundTaskInjectState | null {
  const stateRaw = raw.toLowerCase();
  if (stateRaw === "running") return "running";
  if (
    stateRaw === "completed"
    || stateRaw === "complete"
    || stateRaw === "done"
    || stateRaw === "success"
    || stateRaw === "finished"
  ) {
    return "completed";
  }
  if (
    stateRaw === "error"
    || stateRaw === "failed"
    || stateRaw === "cancelled"
    || stateRaw === "canceled"
  ) {
    return "error";
  }
  return null;
}

function pushParsedTag(
  out: BackgroundTaskInject[],
  attrChunk: string,
  inner: string,
  fallbackState: BackgroundTaskInjectState | null,
): void {
  const attrs = parseAttrs(attrChunk || "");
  const id = (attrs.id || attrs.sessionid || attrs.session_id || "").trim();
  // Live OpenCode inject uses `status="completed"`; spike docs said `state=`.
  const state =
    normalizeInjectState(attrs.state || attrs.status || "") || fallbackState;
  if (!id || !state) return;
  const summary =
    inner.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.trim() || undefined;
  const nestedBody =
    inner.match(/<task_result>([\s\S]*?)<\/task_result>/i)?.[1]?.trim()
    || inner.match(/<task_error>([\s\S]*?)<\/task_error>/i)?.[1]?.trim();
  // Standalone task_result/error: body is the tag inner (minus summary).
  const body =
    nestedBody
    || (fallbackState
      ? inner.replace(/<summary>[\s\S]*?<\/summary>/i, "").trim() || undefined
      : undefined);
  out.push({ sessionId: id, state, summary, body });
}

/** Parse all OpenCode `<task …>` / standalone `<task_result id …>` inject tags. */
export function parseAllBackgroundTaskMarkup(text: string): BackgroundTaskInject[] {
  if (!text?.trim()) return [];
  const out: BackgroundTaskInject[] = [];
  const seen = new Set<string>();

  TASK_WRAP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TASK_WRAP_RE.exec(text))) {
    const before = out.length;
    pushParsedTag(out, match[1] || "", match[2] || "", null);
    if (out.length > before) {
      const last = out[out.length - 1]!;
      seen.add(`${last.sessionId}:${last.state}`);
    }
  }

  // Standalone result/error — skip if already captured inside a wrapping <task>.
  for (const [re, fallback] of [
    [TASK_RESULT_STANDALONE_RE, "completed" as const],
    [TASK_ERROR_STANDALONE_RE, "error" as const],
  ] as const) {
    re.lastIndex = 0;
    while ((match = re.exec(text))) {
      const attrs = parseAttrs(match[1] || "");
      const id = (attrs.id || attrs.sessionid || attrs.session_id || "").trim();
      // Nested `<task_result>body</task_result>` inside wrap has no id — skip.
      if (!id) continue;
      const keyHint = `${id}:${normalizeInjectState(attrs.state || attrs.status || "") || fallback}`;
      if (seen.has(keyHint)) continue;
      const before = out.length;
      pushParsedTag(out, match[1] || "", match[2] || "", fallback);
      if (out.length > before) {
        const last = out[out.length - 1]!;
        seen.add(`${last.sessionId}:${last.state}`);
      }
    }
  }

  return out;
}

/** Parse OpenCode `<task id="…" state|status="…">` (last tag). */
export function parseBackgroundTaskMarkup(text: string): BackgroundTaskInject | null {
  const all = parseAllBackgroundTaskMarkup(text);
  return all.length ? all[all.length - 1]! : null;
}

/** True when text is a join inject (child finished), not the early started stub. */
export function isBackgroundTaskJoinInject(text: string): boolean {
  return parseAllBackgroundTaskMarkup(text).some(
    (p) => p.state === "completed" || p.state === "error",
  );
}

/** Completed/error injects only (Timeline B). */
export function listBackgroundTaskJoins(text: string): BackgroundTaskInject[] {
  return parseAllBackgroundTaskMarkup(text).filter(
    (p) => p.state === "completed" || p.state === "error",
  );
}

/**
 * True when a message body is (only) OpenCode background-task inject markup —
 * hide from the transcript; it is runtime chrome, not user/assistant prose.
 */
export function isBackgroundTaskInjectMessageText(text: string): boolean {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return false;
  if (!isBackgroundTaskJoinInject(trimmed) && !isBackgroundTaskStartedResult({ content: trimmed })) {
    return false;
  }
  // Whole message is essentially one or more inject tags (+ whitespace).
  const withoutTasks = trimmed
    .replace(/<task\b[^>]*>[\s\S]*?<\/task>/gi, "")
    .replace(/<task_result\b[^>]*>[\s\S]*?<\/task_result>/gi, "")
    .replace(/<task_error\b[^>]*>[\s\S]*?<\/task_error>/gi, "")
    .trim();
  return withoutTasks.length === 0 || withoutTasks.length < 24;
}
