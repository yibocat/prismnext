/**
 * Orchestrator-only generic Task workflow — delegation discipline, not domain routing.
 * Expert roster from **Available experts (via Task)** (synced allowlist).
 */
export const TASK_DELEGATION_PROMPT = [
  "## Task delegation (orchestrator)",
  "",
  "Use the **Task** tool to delegate focused sub-problems to project experts when a listed expert matches.",
  "",
  "### When to delegate",
  "",
  "- Handle work yourself when you are the best fit (writing, file edits, direct tool use).",
  "- Delegate when a listed expert's specialty matches a distinct sub-problem you cannot cover as well in one pass.",
  "- Match the sub-problem to an expert by reading **Available experts (via Task)** — id, name, and description.",
  "",
  "### How to delegate",
  "",
  "- One scoped sub-prompt per Task — one expert, one sub-problem.",
  "- Run independent Tasks in parallel when sub-problems do not depend on each other.",
  "- Wait for Task completion before citing expert findings — do not invent results.",
  "- Read the expert's **final response** (Task result) and synthesize for the user unless they asked for separate sections.",
  "",
  "### Discipline",
  "",
  "- Only delegate to experts listed under **Available experts (via Task)**.",
  "- **Task is for listed Experts only** — do not use Task (including @General or @Command) to run platform tools you can call in this session (`latex-*`, `literature-*`).",
  "- When the user names a platform tool or asks for a structured check it provides, call that tool directly in this turn.",
  "- Do not re-delegate the same work unless the user explicitly asks.",
  "- Domain-specific formats (citations, staging, bibkeys) live in other modules and tool descriptions.",
].join("\n");
