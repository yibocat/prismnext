import {
  buildPermissionRulesForMode,
  getToolPermissionEntry,
} from "../main/services/tool-permission-registry";
import { LEGACY_RESEARCH_BRIEF_REL, RESEARCH_BRIEF_REL } from "./research-brief";
import {
  isCanonicalSessionDraftPath,
  isResearchPlanDraftPath,
  LEGACY_DRAFT_PLAN_REL,
  RESEARCH_PLANS_DIR_REL,
  sessionDraftPlanRel,
} from "./research-plan";
import { projectRulesRel } from "./workbench-paths";

/** OpenCode primary agent identity for a chat tab. */
export type SessionAgent = "build" | "plan";

/** Chat permission modes (mirrors permission-modes.ts). */
export type PermissionMode = "ask" | "edit_auto" | "auto" | "readonly";

export type PermissionRule = "allow" | "ask" | "deny";

export function resolveSessionAgent(value?: string | null): SessionAgent {
  return value === "plan" ? "plan" : "build";
}

/**
 * Align with OpenCode built-in `plan` agent (packages/opencode/src/agent/agent.ts):
 * - defaults: `"*": "allow"` (so bash/read/glob work)
 * - edit: deny everything except plan markdown paths
 *
 * Prism ACP only mirrors the edit gate for our draft path. Bash is NOT Plan-denied —
 * it follows Permission Mode (Auto → allow). Earlier hard-deny of bash was wrong.
 */
const PLAN_EDIT_TOOLS = new Set(["edit", "write", "apply_patch"]);

/** Still blocked under Plan even when Permission Mode is Auto (execution, not planning). */
const PLAN_EXECUTION_DENY = new Set([
  "delete",
  "move",
  "latex-compile",
  "latex-compile-standalone",
  "experiment-run",
  "experiment-log",
]);

const PLAN_ASK_TOOLS = new Set([
  "research-brief-update",
  "literature-add",
  "literature-delete",
  "literature-export-bib",
]);

export type PlanPermissionContext = {
  filePath?: string | null;
  projectRoot?: string | null;
  /** Owning chat session — hard-binds Plan draft writes to drafts/<sessionId>.md */
  sessionId?: string | null;
  /** Set by main process when a non-empty draft awaits Approve & Build. */
  planDraftPending?: boolean;
  /** @deprecated unused — kept so call sites compile; bash follows Permission Mode */
  bashCommand?: string | null;
};

/** Note injected after denying a non-canonical Plan draft write. */
export function planDraftPathRedirectNote(sessionId: string): string {
  const path = sessionDraftPlanRel(sessionId);
  return (
    `Plan draft path is fixed by Prism for this chat session. `
    + `Write/update only \`${path}\` — do not invent another filename under drafts/.`
  );
}

function matchesBriefRel(
  normalized: string,
  briefRel: string,
  projectRoot?: string | null,
): boolean {
  const brief = briefRel.replace(/\\/g, "/");
  if (normalized === brief || normalized.endsWith(`/${brief}`)) return true;
  if (projectRoot?.trim()) {
    const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const abs = `${root}/${brief}`;
    if (normalized === abs || normalized.toLowerCase() === abs.toLowerCase()) {
      return true;
    }
  }
  return false;
}

/** True when path is the living research brief (relative or under projectRoot). */
export function isResearchBriefPath(
  filePath: string | null | undefined,
  projectRoot?: string | null,
): boolean {
  if (!filePath?.trim()) return false;
  const normalized = filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
  return (
    matchesBriefRel(normalized, RESEARCH_BRIEF_REL, projectRoot)
    || matchesBriefRel(normalized, LEGACY_RESEARCH_BRIEF_REL, projectRoot)
  );
}

export function researchBriefEditRedirectNote(): string {
  return (
    `Do not use generic edit/write on \`${RESEARCH_BRIEF_REL}\`. `
    + `Use research-brief-read / research-brief-update only.`
  );
}

export const PRISM_RULES_REL = projectRulesRel();
const PROJECT_RULE_FILE = "RULE.md";

/** True when path is a project RULE.md under `.workbench/agent/rules/`. */
export function isProjectRulePath(
  filePath: string | null | undefined,
  projectRoot?: string | null,
): boolean {
  if (!filePath?.trim()) return false;
  const normalized = filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
  const relSuffix = `/${PRISM_RULES_REL}/`;
  const endsWithRule = normalized.endsWith(`/${PROJECT_RULE_FILE}`);
  if (!endsWithRule) return false;
  if (normalized.includes(relSuffix)) return true;
  if (projectRoot?.trim()) {
    const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const rulesRoot = `${root}/${PRISM_RULES_REL}/`;
    if (normalized.startsWith(rulesRoot)) return true;
  }
  return false;
}

export function projectRuleEditRedirectNote(): string {
  return (
    `Do not use generic edit/write on \`${PRISM_RULES_REL}/*/RULE.md\`. `
    + `Use project-rule-write only.`
  );
}

/** Draft on disk is ready — user must Approve & Build; block further Plan-turn tools. */
function planDraftAwaitingApproval(ctx?: PlanPermissionContext): boolean {
  return ctx?.planDraftPending === true;
}

/** Absolute Plan overrides; undefined → fall through to Permission Mode. */
export function getPlanPermissionOverride(
  toolName: string,
  ctx?: PlanPermissionContext,
): PermissionRule | undefined {
  const key = toolName.toLowerCase();
  const draftAwaiting = planDraftAwaitingApproval(ctx);

  if (PLAN_EDIT_TOOLS.has(key)) {
    // Path unknown yet → ask (do not hard-deny; OpenCode also gates by path).
    if (!ctx?.filePath?.trim()) return "ask";
    const sid = ctx.sessionId?.trim();
    if (sid) {
      // Hard bind: only this session's canonical draft.
      if (isCanonicalSessionDraftPath(ctx.filePath, sid, ctx.projectRoot)) {
        return "allow";
      }
      // Legacy current-draft.md still allowed so migrate/claim can finish.
      const normalized = ctx.filePath.replace(/\\/g, "/");
      const legacy = LEGACY_DRAFT_PLAN_REL.replace(/\\/g, "/");
      if (normalized === legacy || normalized.endsWith(`/${legacy}`)) {
        return "allow";
      }
      // Invented drafts/<title>.md, foreign session drafts, approved plans, etc. → deny.
      return "deny";
    }
    // No sessionId yet — keep broad plans-dir allow (should be rare after chat.ts fix).
    if (isResearchPlanDraftPath(ctx.filePath, ctx.projectRoot)) return "allow";
    if (isResearchPlansDirPath(ctx.filePath, ctx.projectRoot)) return "allow";
    return "deny";
  }

  // Draft ready — only canonical draft edits above; deny research/execution tools.
  if (draftAwaiting) {
    return "deny";
  }

  // OpenCode plan: bash inherits allow — do not override here.
  if (key.includes("bash") || key === "shell" || key === "terminal" || key === "execute") {
    return undefined;
  }

  if (PLAN_EXECUTION_DENY.has(key)) return "deny";
  if (PLAN_ASK_TOOLS.has(key)) return "ask";
  return undefined;
}

/** True for `.workbench/research/plans/**` (draft + approved). */
export function isResearchPlansDirPath(
  filePath: string | null | undefined,
  projectRoot?: string | null,
): boolean {
  if (!filePath?.trim()) return false;
  const normalized = filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
  const marker = `${RESEARCH_PLANS_DIR_REL}/`;
  if (normalized.includes(marker) || normalized.endsWith(RESEARCH_PLANS_DIR_REL)) {
    return true;
  }
  if (projectRoot?.trim()) {
    const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const absDir = `${root}/${marker}`;
    if (normalized.startsWith(absDir) || normalized.toLowerCase().startsWith(absDir.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function getPermissionRuleForTool(
  mode: PermissionMode,
  toolName: string,
): PermissionRule | undefined {
  const entry = getToolPermissionEntry(toolName);
  if (entry) return entry.rules[mode];
  const key = toolName.toLowerCase();
  const rules = buildPermissionRulesForMode(mode);
  if (key in rules) return rules[key];
  return undefined;
}

export function resolveEffectivePermissionRule(
  mode: PermissionMode,
  agent: SessionAgent,
  toolName: string,
  ctx?: PlanPermissionContext,
): PermissionRule {
  const key = toolName.toLowerCase();
  // HARD: brief.md is tool-owned for Build and Plan — never generic edit/write.
  if (
    PLAN_EDIT_TOOLS.has(key)
    && isResearchBriefPath(ctx?.filePath, ctx?.projectRoot)
  ) {
    return "deny";
  }
  if (agent === "plan") {
    const override = getPlanPermissionOverride(toolName, ctx);
    if (override) return override;
  }
  return getPermissionRuleForTool(mode, toolName) ?? "ask";
}
