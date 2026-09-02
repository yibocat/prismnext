/**
 * Cursor-style smart permission: no user-facing mode switch.
 * Tools are allowed at the OpenCode layer; this policy decides allow / prompt / deny.
 */
import {
  isAbsoluteFsPath,
  isPathNestedInside,
  normalizeAbsPath,
  resolveFsPath,
} from "../platform/fs-path";
import type { SessionAgent } from "../agent/session-agent";
import {
  getPlanPermissionOverride,
  resolveEffectivePermissionRule,
  type PlanPermissionContext,
} from "../agent/session-agent";
import { bashCommandMatchesAnyPattern, normalizeBashCommand } from "./bash-allow-always";
import {
  extractOutsideProjectPathArgs,
  isWholeDiskSearchBashCommand,
} from "./project-escape-guard";
import { matchBashException } from "./bash-intent";
import { matchReservedBashOp } from "./reserved-ops";
import {
  emptyPermissionRulesConfig,
  isLegacyBashAllowAlways,
  isLegacyToolAllowAlways,
  isPathUnderAllowedPaths,
  matchAllowRules,
  matchDenyRules,
  type PermissionRuleContext,
  type PermissionRulesConfig,
} from "./rules";

export type { PermissionRulesConfig } from "./rules";
export { buildPermissionRulesConfig, emptyPermissionRulesConfig } from "./rules";

export type SmartPermissionAction = "allow" | "prompt" | "deny";

export type SmartPermissionContext = PlanPermissionContext & {
  toolName: string;
  sessionAgent?: SessionAgent;
  sourcePath?: string | null;
  destinationPath?: string | null;
  bashCwd?: string | null;
  /** Enabled team skill folders — readable host resources, not project-escape. */
  skillReadRoots?: string[] | null;
};

/** OpenCode rules: reads allow; gated tools ask so requestPermission can run smart policy. */
export function buildSmartPermissionRules(): Record<string, "allow" | "ask" | "deny"> {
  return {
    read: "allow",
    grep: "allow",
    glob: "allow",
    webfetch: "allow",
    websearch: "allow",
    "document-read": "allow",
    question: "allow",
    task: "allow",
    skill: "allow",
    todowrite: "allow",
    "literature-search": "allow",
    "literature-read": "allow",
    "literature-read-pdf": "allow",
    "literature-intensive-reading": "allow",
    "literature-stage": "allow",
    "citation-health": "allow",
    "latex-compile": "ask",
    "latex-compile-standalone": "ask",
    "typst-compile": "ask",
    "typst-compile-standalone": "ask",
    "research-brief-read": "allow",
    "suggest-plan": "allow",
    "results-snapshot": "allow",
    "provenance-query": "allow",
    "interaction-list": "allow",
    "interaction-read": "allow",
    "interaction-open": "allow",
    edit: "ask",
    write: "ask",
    apply_patch: "ask",
    delete: "ask",
    move: "ask",
    bash: "ask",
    "literature-add": "ask",
    "literature-delete": "ask",
    "literature-export-bib": "ask",
    "research-brief-update": "ask",
    "experiment-log": "ask",
    "experiment-run": "ask",
    "interaction-write": "ask",
  };
}

export function resolvePathInProject(
  filePath: string,
  projectRoot: string,
): string {
  const p = filePath.trim();
  if (!p) return resolveFsPath(projectRoot);
  if (isAbsoluteFsPath(p)) return resolveFsPath(p);
  return resolveFsPath(projectRoot, p);
}

/** null = unknown (missing path or root). */
export function isPathInsideProject(
  filePath: string | null | undefined,
  projectRoot: string | null | undefined,
): boolean | null {
  if (!filePath?.trim() || !projectRoot?.trim()) return null;
  const root = normalizeAbsPath(projectRoot.trim());
  const target = normalizeAbsPath(resolvePathInProject(filePath, root));
  return isPathNestedInside(root, target);
}

export function isCwdInsideProject(
  cwd: string | null | undefined,
  projectRoot: string | null | undefined,
): boolean {
  if (!projectRoot?.trim()) return true;
  if (!cwd?.trim()) return true;
  return isPathInsideProject(cwd, projectRoot) !== false;
}

const BASH_DENY_PATTERNS = [
  "sudo*",
  "su *",
  "rm -rf /*",
  "rm -fr /*",
  "rm -r /*",
  "curl *|*bash*",
  "curl *|*sh*",
  "wget *|*bash*",
  "wget *|*sh*",
  "chmod *",
  "chown *",
  "docker*",
  "kubectl*",
  "mkfs*",
  "dd *",
  "shutdown*",
  "reboot*",
];


function isDeleteToolName(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n === "delete" || n === "literature-delete";
}

function isMoveToolName(toolName: string): boolean {
  return toolName.toLowerCase() === "move";
}

function isShellToolName(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return (
    n === "bash"
    || n === "experiment-run"
    || n.includes("bash")
    || n === "shell"
    || n === "terminal"
    || n === "execute"
  );
}

function isFileWriteToolName(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return (
    n.startsWith("edit")
    || n.startsWith("write")
    || n.startsWith("apply_patch")
    || n === "literature-add"
    || n === "literature-export-bib"
    || n === "research-brief-update"
    || n === "experiment-log"
    || n === "interaction-write"
    || n === "latex-compile"
    || n === "latex-compile-standalone"
    || n === "typst-compile"
    || n === "typst-compile-standalone"
  );
}

function isReadToolName(toolName: string): boolean {
  const n = toolName.toLowerCase();
  if (n.startsWith("lsp")) return true;
  return [
    "read", "grep", "glob", "webfetch", "websearch", "document-read", "question", "task", "skill",
    "todowrite", "literature-search", "literature-read", "literature-read-pdf",
    "literature-intensive-reading", "literature-stage", "citation-health",
    "latex-compile", "typst-compile", "research-brief-read", "suggest-plan", "results-snapshot",
    "provenance-query", "interaction-list", "interaction-read", "interaction-open",
  ].includes(n);
}

export function resolveSmartBashAction(
  command: string | null | undefined,
  projectRoot: string | null | undefined,
  cwd: string | null | undefined,
  allowedPaths?: string[] | null,
  skillReadRoots?: string[] | null,
): SmartPermissionAction {
  const cmd = normalizeBashCommand(command || "");
  if (!cmd) return "allow";

  if (bashCommandMatchesAnyPattern(cmd, BASH_DENY_PATTERNS)) {
    return "deny";
  }

  // Whole-disk search has no in-project use — grep/glob cover that.
  if (isWholeDiskSearchBashCommand(cmd)) {
    return "deny";
  }

  if (matchReservedBashOp(cmd)) {
    return "deny";
  }

  // File-access verbs carrying paths outside the project → visible prompt,
  // even when the cwd is inside the project (`cat /elsewhere/x` was silent).
  // Enabled skill folders are readable host roots, not escape.
  if (extractOutsideProjectPathArgs(cmd, cwd, projectRoot, { allowedPaths, skillReadRoots }).length > 0) {
    return "prompt";
  }

  const inProject = isCwdInsideProject(cwd, projectRoot);
  const exception = matchBashException(cmd);
  if (exception === "install") return "prompt";
  if (exception === "delete") return inProject ? "prompt" : "deny";
  return inProject ? "allow" : "prompt";
}

export function isPathInsideOrAllowed(
  filePath: string | null | undefined,
  projectRoot: string | null | undefined,
  allowedPaths: string[] | null | undefined,
): boolean | null {
  const inside = isPathInsideProject(filePath, projectRoot);
  if (inside === true) return true;
  if (isPathUnderAllowedPaths(filePath, projectRoot, allowedPaths)) return true;
  return inside;
}

function toRuleContext(ctx: SmartPermissionContext): PermissionRuleContext {
  return {
    toolName: ctx.toolName,
    projectRoot: ctx.projectRoot,
    filePath: ctx.filePath,
    sourcePath: ctx.sourcePath,
    destinationPath: ctx.destinationPath,
    bashCommand: ctx.bashCommand,
    bashCwd: ctx.bashCwd,
  };
}

/** Built-in safety denies that user rules cannot override. */
export function resolveHardDenyAction(ctx: SmartPermissionContext): boolean {
  const toolName = (ctx.toolName || "").toLowerCase();
  const root = ctx.projectRoot?.trim() || null;
  const cmd = normalizeBashCommand(ctx.bashCommand || "");

  if (cmd && bashCommandMatchesAnyPattern(cmd, BASH_DENY_PATTERNS)) {
    return true;
  }

  // Whole-disk search (mdfind / locate) — user allow rules cannot override.
  if (cmd && isWholeDiskSearchBashCommand(cmd)) {
    return true;
  }

  if (isShellToolName(toolName) && cmd && matchReservedBashOp(cmd)) {
    return true;
  }

  if (isDeleteToolName(toolName)) {
    const path = ctx.filePath?.trim();
    if (path && root && isPathInsideProject(path, root) === false) {
      return true;
    }
  }

  if (isShellToolName(toolName) && cmd && root) {
    const inProject = isCwdInsideProject(ctx.bashCwd, root);
    if (!inProject && matchBashException(cmd) === "delete") {
      return true;
    }
  }

  return false;
}

function userAllowHit(
  ctx: SmartPermissionContext,
  rules: PermissionRulesConfig,
): boolean {
  const ruleCtx = toRuleContext(ctx);
  if (matchAllowRules(rules.allowRules, ruleCtx)) return true;
  const tool = (ctx.toolName || "").toLowerCase();
  if (isShellToolName(tool) || tool === "experiment-run") {
    if (isLegacyBashAllowAlways(ctx.bashCommand, rules.bashAllowAlwaysPatterns)) return true;
    if (isLegacyToolAllowAlways(tool, rules.toolAllowAlways)) return true;
    return false;
  }
  return isLegacyToolAllowAlways(tool, rules.toolAllowAlways);
}

function resolveSmartDefaultAction(
  ctx: SmartPermissionContext,
  rules: PermissionRulesConfig,
): SmartPermissionAction {
  const toolName = (ctx.toolName || "").toLowerCase();
  const root = ctx.projectRoot?.trim() || null;
  const allowedPaths = rules.allowedPaths;

  if (isReadToolName(toolName)) return "allow";

  if (isDeleteToolName(toolName)) {
    const path = ctx.filePath?.trim();
    if (path && root) {
      const inside = isPathInsideProject(path, root);
      if (inside === false) return "deny";
    }
    return "prompt";
  }

  if (isMoveToolName(toolName)) {
    const src = ctx.sourcePath?.trim() || ctx.filePath?.trim();
    const dst = ctx.destinationPath?.trim();
    if (root && src && dst) {
      const srcOk = isPathInsideOrAllowed(src, root, allowedPaths) === true;
      const dstOk = isPathInsideOrAllowed(dst, root, allowedPaths) === true;
      if (srcOk && dstOk) return "allow";
      return "prompt";
    }
    if (root && src) {
      const srcIn = isPathInsideOrAllowed(src, root, allowedPaths);
      if (srcIn === false) return "prompt";
    }
    return "prompt";
  }

  if (isFileWriteToolName(toolName)) {
    const path = ctx.filePath?.trim();
    if (path && root) {
      const inside = isPathInsideOrAllowed(path, root, allowedPaths);
      if (inside === true) return "allow";
      if (inside === false) return "prompt";
    }
    return path ? "prompt" : "allow";
  }

  if (isShellToolName(toolName)) {
    if (toolName === "experiment-run" && !ctx.bashCommand && isCwdInsideProject(ctx.bashCwd, root)) {
      return "allow";
    }
    return resolveSmartBashAction(
      ctx.bashCommand,
      root,
      ctx.bashCwd,
      allowedPaths,
      ctx.skillReadRoots,
    );
  }

  return "allow";
}

export function resolveSmartPermissionAction(
  ctx: SmartPermissionContext,
  rules: PermissionRulesConfig = emptyPermissionRulesConfig(),
): SmartPermissionAction {
  const toolName = (ctx.toolName || "").toLowerCase();
  const ruleCtx = toRuleContext(ctx);

  if (resolveHardDenyAction(ctx)) return "deny";

  if (matchDenyRules(rules.denyRules, ruleCtx)) return "deny";

  if (ctx.sessionAgent === "plan") {
    const override = getPlanPermissionOverride(toolName, ctx);
    if (override === "allow") return "allow";
    if (override === "deny") return "deny";
    if (override === "ask") return "prompt";
    const rule = resolveEffectivePermissionRule("edit_auto", "plan", toolName, ctx);
    if (rule === "allow") return "allow";
    if (rule === "deny") return "deny";
    return "prompt";
  }

  let action = resolveSmartDefaultAction(ctx, rules);
  if (action === "prompt" && userAllowHit(ctx, rules)) {
    action = "allow";
  }
  return action;
}

export type PermissionDecisionDetail = {
  action: SmartPermissionAction;
  source: string;
};

/** Explain which layer decided the action (Settings rule tester). */
export function explainSmartPermissionAction(
  ctx: SmartPermissionContext,
  rules: PermissionRulesConfig = emptyPermissionRulesConfig(),
): PermissionDecisionDetail {
  const ruleCtx = toRuleContext(ctx);
  if (resolveHardDenyAction(ctx)) {
    return { action: "deny", source: "hard_deny" };
  }
  const denied = matchDenyRules(rules.denyRules, ruleCtx);
  if (denied) return { action: "deny", source: `deny_rule:${denied.raw}` };

  if (ctx.sessionAgent === "plan") {
    const override = getPlanPermissionOverride((ctx.toolName || "").toLowerCase(), ctx);
    if (override === "allow") return { action: "allow", source: "plan_override:allow" };
    if (override === "deny") return { action: "deny", source: "plan_override:deny" };
    if (override === "ask") return { action: "prompt", source: "plan_override:ask" };
  }

  let action = resolveSmartDefaultAction(ctx, rules);
  let source = action === "allow" ? "smart_default:allow" : action === "deny" ? "smart_default:deny" : "smart_default:prompt";
  if (action === "prompt" && userAllowHit(ctx, rules)) {
    action = "allow";
    source = "user_allow";
  }
  return { action, source };
}
/** Renderer: show composer permission card when main would prompt. */
export function shouldSmartPermissionPrompt(
  toolName: string,
  ctx: Omit<SmartPermissionContext, "toolName">,
  rules?: PermissionRulesConfig,
): boolean {
  return resolveSmartPermissionAction({ ...ctx, toolName }, rules) === "prompt";
}
