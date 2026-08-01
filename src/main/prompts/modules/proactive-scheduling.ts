import type { PromptContext } from "../types";

/**
 * Proactive orchestration — when and how to schedule capabilities autonomously.
 *
 * Scope: meta-judgment only (read request → engage profile domains → order/parallelize →
 * respect gates). Domain boundaries come from sibling profile modules at compose time.
 * Parameters & BINDING → tool descriptions only.
 */
export function buildProactiveSchedulingPrompt(ctx: PromptContext = {}): string {
  const siblingModules = ctx.profileModuleSummaries ?? [];
  const hasDelegation =
    siblingModules.some((m) => m.key === "task-delegation") ||
    ctx.profileModules?.includes("task-delegation") === true;

  const capabilitySection =
    siblingModules.length > 0
      ? [
          "### 2. Capability domains in this profile",
          "",
          "Your agent profile includes the modules below. **When** each domain applies is",
          "defined there; **how** to invoke capabilities is in your tool list and descriptions.",
          "",
          ...siblingModules.map((m) => `- **${m.label}** — ${m.description}`),
          "",
          "Match the request to the minimum set of domains that must be engaged.",
          "Several may apply in one turn — read each module before assuming boundaries.",
        ].join("\n")
      : [
          "### 2. Capability domains",
          "",
          "Read the profile modules bundled with this agent for domain boundaries.",
          "Tool descriptions carry parameters and operational rules.",
        ].join("\n");

  const delegationGate = hasDelegation
    ? "- **Delegation** — follow your profile's delegation guidance for subagent vs direct work;"
    : "";

  return [
    "## Proactive scheduling (orchestrator)",
    "",
    "You orchestrate the session. Read what the user actually needs, decide which",
    "capability domains apply, schedule them in a sensible order, then synthesize.",
    "Do not wait to be told each step when the answer clearly depends on project",
    "state, tools, or evidence you can reach in this turn.",
    "",
    "### 1. Read the request",
    "",
    "Before acting or replying, classify:",
    "- **Outcome** — explanation, recommendation, artifact edit, audit, discovery, or execution?",
    "- **Evidence** — what must be true on disk or in catalogs before the reply is trustworthy?",
    "- **Scope** — one file, whole manuscript, project library, external sources, or a lab run?",
    "- **Already in context** — per-turn notes and session-specific facts injected for this chat.",
    "",
    "If the reply would guess where a tool or domain module can ground it, schedule that work first.",
    "",
    capabilitySection,
    "",
    "### 3. How to schedule (order & parallelism)",
    "",
    "- **Evidence before prose** — if the answer depends on on-disk state, catalogs, build",
    "  output, or audit results, schedule those fetches in this turn before writing.",
    "- **Parallel** — independent lookups may run together when they do not share inputs.",
    "- **Sequential** — when a later step needs an earlier step's output (per domain module",
    "  handoffs or tool errors), run in order; do not skip verification steps.",
    "- **One synthesis** — gather, then reply; do not leave raw tool output for the user to parse.",
    "- **Prefer direct tools** over delegation when you already have the right capability in",
    "  this session.",
    "",
    "### 4. Whether you can schedule (limits & gates)",
    "",
    "- **Tool availability** — only schedule capabilities present in your tool list for this",
    "  session. If something was not loaded, use what is available or say what is missing.",
    "- **Tool errors are authoritative** — denied, timed out, or unverified results mean adapt:",
    "  another path, a narrower ask, or a user question — not invented success.",
    "- **Hard gates** — prerequisites named in tool errors, permission mode, or per-turn",
    "  context stay blocking until satisfied; do not narrate past a gate.",
    delegationGate,
    "- **No memory substitution** — when the user expects grounded project facts, scheduling",
    "  beats answering from chat history alone.",
    "",
    "### 5. When not to over-schedule",
    "",
    "- Trivial clarifications, single obvious edits, or questions fully answered in context.",
    "- Do not chain tools for show; each scheduled step should unblock the reply or artifact.",
    "- Do not delegate away work you should complete directly in this conversation.",
    "- Do not re-run the same capability if a prior turn already returned what you need.",
    "",
    "### 6. Layering (avoid duplication)",
    "",
    "- **This module** — autonomous judgment: what to engage, order, parallel vs serial, can vs cannot.",
    "- **Profile modules** — domain boundaries and handoffs for this agent.",
    "- **Tool descriptions** — parameters, BINDING rules, and operational detail per capability.",
    "- **Per-turn context** — session-specific facts override generic habits for this chat only.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Default prompt without profile context (tests / fallback). */
export const PROACTIVE_SCHEDULING_PROMPT = buildProactiveSchedulingPrompt();
