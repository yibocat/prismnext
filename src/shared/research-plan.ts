import { projectResearchPlansRel } from "./workbench-paths";

/** Project-relative directory for session research plans (not brief.md). */
export const RESEARCH_PLANS_DIR_REL = projectResearchPlansRel();

/** Per-session living drafts (one file per chat session). */
export const RESEARCH_PLAN_DRAFTS_DIR_REL = `${RESEARCH_PLANS_DIR_REL}/drafts`;

/**
 * @deprecated Project-global draft — migrated to per-session drafts under `drafts/`.
 * Still recognized for read/claim/discard migration.
 */
export const LEGACY_DRAFT_PLAN_FILENAME = "current-draft.md";

/** @deprecated Use {@link sessionDraftPlanRel}. */
export const DRAFT_PLAN_FILENAME = LEGACY_DRAFT_PLAN_FILENAME;

/** @deprecated Use {@link sessionDraftPlanRel}. */
export const LEGACY_DRAFT_PLAN_REL = `${RESEARCH_PLANS_DIR_REL}/${LEGACY_DRAFT_PLAN_FILENAME}`;

/** @deprecated Use {@link sessionDraftPlanRel}. */
export const DRAFT_PLAN_REL = LEGACY_DRAFT_PLAN_REL;

/** Safe filename segment from an OpenCode session id. */
export function sanitizeSessionIdForPath(sessionId: string): string {
  const cleaned = sessionId.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return (cleaned || "session").slice(0, 120);
}

/** Project-relative living draft for one chat session. */
export function sessionDraftPlanRel(sessionId: string): string {
  return `${RESEARCH_PLAN_DRAFTS_DIR_REL}/${sanitizeSessionIdForPath(sessionId)}.md`;
}

/**
 * Sanitized session key from a per-session draft path (`drafts/<key>.md`).
 * Returns null for legacy `current-draft.md` or non-draft paths.
 */
export function sessionKeyFromDraftPlanPath(
  filePath: string | null | undefined,
): string | null {
  if (!filePath?.trim()) return null;
  const normalized = filePath.replace(/\\/g, "/");
  const m = normalized.match(/\/drafts\/([^/]+)\.md$/i);
  return m?.[1] ?? null;
}

/** True when `filePath` is this session's per-session draft (`drafts/<sid>.md`). */
export function draftPlanPathBelongsToSession(
  filePath: string | null | undefined,
  sessionId: string | null | undefined,
): boolean {
  if (!filePath?.trim() || !sessionId?.trim()) return false;
  const key = sessionKeyFromDraftPlanPath(filePath);
  if (!key) return false; // legacy current-draft — ownership is frontmatter, not path
  return key === sanitizeSessionIdForPath(sessionId);
}

/**
 * True when `filePath` is exactly this session's canonical living draft
 * (relative or absolute under projectRoot). Used for hard Plan write allowlisting.
 */
export function isCanonicalSessionDraftPath(
  filePath: string | null | undefined,
  sessionId: string | null | undefined,
  projectRoot?: string | null,
): boolean {
  if (!filePath?.trim() || !sessionId?.trim()) return false;
  if (draftPlanPathBelongsToSession(filePath, sessionId)) return true;
  const canonical = sessionDraftPlanRel(sessionId);
  const normalized = filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (normalized === canonical || normalized.endsWith(`/${canonical}`)) return true;
  if (projectRoot?.trim()) {
    const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const abs = `${root}/${canonical}`;
    if (
      normalized === abs
      || normalized.toLowerCase() === abs.toLowerCase()
    ) {
      return true;
    }
  }
  return false;
}

/** Required top-level sections in a Prism plan-of-record body (order fixed). */
export const PLAN_DOC_REQUIRED_SECTIONS = ["Analysis", "Plan", "Checklist"] as const;

/**
 * Compact structure contract for Plan-mode prompts (English, matches other turn appendices).
 * Checklist is mandatory in the file; todowrite is NOT required until Approve & Execute.
 *
 * Checklist / todowrite track **top-level Plan units** (Phase or top-level Step),
 * not a flattened dump of every micro-task inside those units.
 */
export const PLAN_DOC_STRUCTURE_HINTS = [
  "Frontmatter must include `title` and `description` (YAML).",
  "`description`: one short sentence (≤ ~160 chars) summarizing what this plan will do — UI confirm panel copy; not a heading, not a pasted Analysis paragraph.",
  "Required sections (in order): ## Analysis, ## Plan, ## Checklist.",
  "Analysis: brief background and constraints — not a long essay.",
  "Plan: nesting depth ≤ 2 (Phase → Step, or a flat list of Steps). No deeper nesting.",
  "Plan detail: each Phase/Step must be concrete enough to execute without improvising — name files, commands, metrics, acceptance checks where relevant. Prefer a short paragraph or 2–4 specific bullets per Step; avoid one-line slogans.",
  "Checklist: step-execution checks only — exactly one `- [ ]` per top-level Plan unit (each Phase, or each top-level Step if the Plan has no Phases). N Phases ⇒ N checklist items. Do NOT expand inner Step bullets into separate checklist rows.",
  "Chat is commentary/summary; the plan file is the plan of record.",
  "Do not call todowrite while still drafting — that comes after the user Approves & Executes.",
].join(" ");

export type PlanChecklistItem = {
  text: string;
  checked: boolean;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const CHECKLIST_LINE_RE = /^[-*]\s+\[([ xX])\]\s+(.+)$/;

/**
 * Parse `- [ ]` / `- [x]` items from plan markdown.
 * Prefers a `## Checklist` section when present; otherwise scans the whole body.
 */
export function parsePlanChecklist(markdown: string): PlanChecklistItem[] {
  const withoutFrontmatter = markdown.replace(FRONTMATTER_RE, "$2");
  const section = extractSection(withoutFrontmatter, "Checklist");
  const source = section ?? withoutFrontmatter;
  const items: PlanChecklistItem[] = [];
  for (const line of source.split(/\r?\n/)) {
    const m = line.trim().match(CHECKLIST_LINE_RE);
    if (!m) continue;
    const text = m[2]!.trim();
    if (!text) continue;
    items.push({
      text,
      checked: m[1]!.toLowerCase() === "x",
    });
  }
  return items;
}

/** Strip YAML frontmatter from a plan file for prompt injection. */
export function stripPlanFrontmatter(markdown: string): string {
  return markdown.replace(FRONTMATTER_RE, "$2").trim();
}

/** Silent Deny kick — hidden in UI (skipUserMessage + hydrate strip). */
export const PLAN_REJECT_ACK_PROMPT =
  "The user rejected the plan draft and discarded it. Briefly acknowledge — do not execute the plan. Wait for their next instruction.";

/** True for Approve/Deny control prompts that must not appear as user bubbles. */
export function isPlanControlUserText(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return (
    t.startsWith("The user approved the research plan.")
    || t.startsWith("The user rejected the plan draft and discarded it.")
  );
}

/**
 * Hard binding shown to the model whenever Plan mode is active or just accepted.
 * Chat text is never the plan of record — only this session draft path is.
 */
export function buildPlanDraftWriteBinding(sessionId: string): string {
  const draftPath = sessionDraftPlanRel(sessionId);
  return (
    `BINDING — Plan mode: the plan of record is ONLY \`${draftPath}\`. `
    + `Your FIRST action must be write or edit on exactly that path with `
    + `## Analysis / ## Plan / ## Checklist (plus frontmatter title + description). `
    + `Chat text is NOT the plan — do not paste a full plan only in the assistant reply. `
    + `Approve & Build reads the file, not chat.`
  );
}

/** Next-turn / auto-kick note when a Plan turn ended without updating the draft file. */
export function planDraftMissingRedirectNote(sessionId: string): string {
  return (
    `BINDING VIOLATION — ${buildPlanDraftWriteBinding(sessionId)} `
    + `You put the plan in chat (or never wrote the file). `
    + `Immediately write the full plan body to that path now. `
    + `Structure: ${PLAN_DOC_STRUCTURE_HINTS}`
  );
}

/** OpenCode todowrite item shape (UI + agent). */
export type PlanTodoSeed = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

/** Map plan Checklist lines → todowrite todos (1:1 wording). */
export function checklistToTodoSeeds(
  items: readonly PlanChecklistItem[],
): PlanTodoSeed[] {
  return items.map((item) => ({
    content: item.text,
    status: item.checked ? "completed" : "pending",
  }));
}

/**
 * Compact agent prompt after Approve & Execute.
 * Does **not** embed the plan body — the agent must `read` the plan file.
 * When `todos` are provided, FIRST tool call must be todowrite with that exact list.
 */
export function buildApprovedPlanExecutePrompt(args: {
  relativePath: string;
  title?: string | null;
  todos?: readonly PlanTodoSeed[];
}): string {
  const lines = [
    "The user approved the research plan. Continue execution in Build mode.",
    "",
    `Plan of record (read this file — do not rely on chat history for the plan body): \`${args.relativePath}\``,
  ];
  if (args.title?.trim()) {
    lines.push(`Title: ${args.title.trim()}`);
  }

  const todos = args.todos?.filter((t) => t.content.trim()) ?? [];
  if (todos.length > 0) {
    lines.push(
      "",
      "BINDING — your **FIRST** tool call this turn must be `todowrite` with **exactly** these todos (same content strings and order; do not invent extras):",
      "```json",
      JSON.stringify({ todos }, null, 2),
      "```",
      "Prism already showed this Task Plan in the UI — still call `todowrite` so OpenCode stays in sync.",
    );
  }

  lines.push(
    "",
    "Execution rules:",
    "1. Call `todowrite` first (exact list above), then `read` the plan file.",
    "2. Work one Checklist/todo unit at a time using the ## Plan section detail; do not add extra todos for inner bullets.",
    "3. After finishing a unit: update todowrite AND edit the plan file to mark that `- [ ]` as `- [x]`.",
    "4. If unsure of progress, read the plan file again before continuing.",
    "5. Do not claim the plan is fully done while any Checklist item remains unchecked.",
  );

  return lines.join("\n");
}

/** Short chat bubble text for Approve (UI only — not the agent prompt body). */
export function buildApprovedPlanExecuteDisplayText(args: {
  relativePath: string;
  title?: string | null;
}): string {
  const title = args.title?.trim();
  if (title) return `Approved & Execute — ${title}`;
  return `Approved & Execute — ${args.relativePath}`;
}

/**
 * Plan confirm panel copy — only the dedicated frontmatter `description` field.
 * Does not scrape ## Analysis or body prose.
 */
export function extractPlanFrontmatterDescription(
  markdown: string,
  maxChars = 200,
): string {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) return "";
  const raw = parseFrontmatterFields(match[1] ?? "").description?.trim() ?? "";
  if (!raw) return "";
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * True when `filePath` targets a Plan *draft* (per-session under drafts/, or legacy
 * current-draft.md). Approved dated plans are not drafts.
 */
export function isResearchPlanDraftPath(
  filePath: string | null | undefined,
  projectRoot?: string | null,
): boolean {
  if (!filePath?.trim()) return false;
  const normalized = filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
  const draftsDir = RESEARCH_PLAN_DRAFTS_DIR_REL.replace(/\\/g, "/");
  const legacyRel = LEGACY_DRAFT_PLAN_REL.replace(/\\/g, "/");

  const isLegacy =
    normalized === legacyRel
    || normalized.endsWith(`/${legacyRel}`)
    || normalized.endsWith(`/${LEGACY_DRAFT_PLAN_FILENAME}`);

  const underDrafts =
    normalized.includes(`/${draftsDir}/`)
    || normalized.startsWith(`${draftsDir}/`)
    || /\/drafts\/[^/]+\.md$/i.test(normalized);

  if (!isLegacy && !underDrafts) {
    if (projectRoot?.trim()) {
      const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
      const absLegacy = `${root}/${legacyRel}`;
      const absDrafts = `${root}/${draftsDir}/`;
      if (
        normalized === absLegacy
        || normalized.toLowerCase() === absLegacy.toLowerCase()
        || normalized.startsWith(absDrafts)
        || normalized.toLowerCase().startsWith(absDrafts.toLowerCase())
      ) {
        return true;
      }
    }
    return false;
  }

  return true;
}

export type ResearchPlanStatus = "draft" | "approved" | "snapshot";

export interface ResearchPlanMeta {
  id: string;
  status: ResearchPlanStatus;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  /** One-line summary for the Plan confirm panel (not body excerpt). */
  description?: string;
}

export interface ResearchPlanStep {
  text: string;
  status?: string;
}

export interface ResearchPlanDoc {
  meta: ResearchPlanMeta;
  /**
   * Primary plan markdown (usually the assistant’s plan reply).
   * When set, this is the file body — not shredded into Steps/Conclusions.
   */
  body?: string;
  goal?: string;
  /** Structured checklist from OpenCode `plan.updated` only (optional appendix). */
  steps: ResearchPlanStep[];
  /** @deprecated Prefer `body` for the full plan narrative. */
  conclusions?: string;
  nextActions?: string;
}

const VALID_STATUSES = new Set<ResearchPlanStatus>(["draft", "approved", "snapshot"]);

function parseFrontmatterFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    if (!key) continue;
    const value = trimmed
      .slice(colon + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    fields[key] = value;
  }
  return fields;
}

/** Quote YAML scalars that would break simple `key: value` parsing. */
function yamlScalar(value: string): string {
  const v = value.trim();
  if (!v) return '""';
  if (/[:#\[\]{},\n"'\\]/.test(v) || /\s/.test(v)) {
    return JSON.stringify(v);
  }
  return v;
}

function serializeFrontmatter(meta: ResearchPlanMeta): string {
  const lines = ["---"];
  lines.push(`id: ${meta.id}`);
  lines.push(`status: ${meta.status}`);
  if (meta.sessionId) lines.push(`sessionId: ${meta.sessionId}`);
  if (meta.title) lines.push(`title: ${yamlScalar(meta.title)}`);
  if (meta.description?.trim()) {
    lines.push(`description: ${yamlScalar(meta.description.trim())}`);
  }
  lines.push(`createdAt: ${meta.createdAt}`);
  lines.push(`updatedAt: ${meta.updatedAt}`);
  lines.push("---");
  return lines.join("\n");
}

function extractSection(body: string, heading: string): string | undefined {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "im");
  const lines = body.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (re.test(lines[i]!.trim())) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return undefined;

  const buffer: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i]!)) break;
    buffer.push(lines[i]!);
  }
  const text = buffer.join("\n").trim();
  return text || undefined;
}

function parseStepsSection(body: string): ResearchPlanStep[] {
  const raw = extractSection(body, "Steps");
  if (!raw) return [];

  const steps: ResearchPlanStep[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    const content = numbered?.[1] ?? bullet?.[1];
    if (!content) continue;

    const statusMatch = content.match(/^(.+?)\s+\*\(([^)]+)\)\*$/);
    if (statusMatch) {
      steps.push({ text: statusMatch[1]!.trim(), status: statusMatch[2]!.trim() });
      continue;
    }
    steps.push({ text: content.trim() });
  }
  return steps;
}

function extractTitle(body: string, metaTitle?: string): string | undefined {
  if (metaTitle?.trim()) return metaTitle.trim();
  const match = body.match(/^#\s+(.+?)\s*$/m);
  return match?.[1]?.trim() || undefined;
}

/** Dated filename for approved/snapshot plans, e.g. `2026-07-18-a3f2.md`. */
export function researchPlanFileName(meta: Pick<ResearchPlanMeta, "id" | "createdAt">): string {
  const date = meta.createdAt.slice(0, 10);
  return `${date}-${meta.id}.md`;
}

function ensureLeadingTitle(markdown: string, title: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return `# ${title}`;
  if (/^#\s+/m.test(trimmed)) return trimmed;
  return `# ${title}\n\n${trimmed}`;
}

function serializeStepsList(steps: ResearchPlanStep[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    const statusSuffix = step.status?.trim() ? ` *(${step.status.trim()})*` : "";
    lines.push(`${i + 1}. ${step.text.trim()}${statusSuffix}`);
  }
  return lines;
}

export function serializeResearchPlan(doc: ResearchPlanDoc): string {
  const title = doc.meta.title?.trim() || "Research Plan";
  const parts: string[] = [serializeFrontmatter(doc.meta), ""];

  // Preferred: keep the assistant plan markdown intact as the file body.
  if (doc.body?.trim()) {
    parts.push(ensureLeadingTitle(doc.body, title), "");
    return parts.join("\n").trimEnd() + "\n";
  }

  // Legacy / draft checklist-only (e.g. live `plan.updated` → current-draft.md)
  parts.push(`# ${title}`, "");

  if (doc.goal?.trim()) {
    parts.push("## Goal", "", doc.goal.trim(), "");
  }

  parts.push("## Steps", "");
  if (doc.steps.length === 0) {
    parts.push("_No steps yet._", "");
  } else {
    parts.push(...serializeStepsList(doc.steps), "");
  }

  if (doc.conclusions?.trim()) {
    parts.push("## Conclusions", "", doc.conclusions.trim(), "");
  }

  if (doc.nextActions?.trim()) {
    parts.push("## Next actions", "", doc.nextActions.trim(), "");
  }

  return parts.join("\n").trimEnd() + "\n";
}

/** Defensively parse a research plan markdown file. Returns null when invalid. */
export function parseResearchPlan(markdown: string): ResearchPlanDoc | null {
  if (!markdown.trim()) return null;

  const match = markdown.match(FRONTMATTER_RE);
  if (!match) return null;

  const fields = parseFrontmatterFields(match[1] ?? "");
  const body = match[2] ?? "";

  const id = fields.id?.trim();
  const statusRaw = fields.status?.trim() as ResearchPlanStatus | undefined;
  const createdAt = fields.createdAt?.trim();
  const updatedAt = fields.updatedAt?.trim();

  if (!id || !statusRaw || !VALID_STATUSES.has(statusRaw) || !createdAt || !updatedAt) {
    return null;
  }

  const title = extractTitle(body, fields.title);
  const description = fields.description?.trim() || undefined;
  const sessionId = fields.sessionId?.trim() || undefined;
  const goal = extractSection(body, "Goal");
  const steps = parseStepsSection(body);
  const conclusions = extractSection(body, "Conclusions");
  const nextActions = extractSection(body, "Next actions");

  // Freeform plan body: markdown without the legacy Goal/Steps/Conclusions scaffold.
  const hasLegacyScaffold = goal != null || steps.length > 0 || conclusions != null || nextActions != null;
  const planBody = hasLegacyScaffold ? undefined : body.trim() || undefined;

  return {
    meta: {
      id,
      status: statusRaw,
      sessionId,
      createdAt,
      updatedAt,
      title,
      description,
    },
    body: planBody,
    goal,
    steps,
    conclusions,
    nextActions,
  };
}
