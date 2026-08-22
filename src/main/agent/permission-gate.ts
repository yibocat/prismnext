/**
 * Single-channel PermissionGate.
 * ToolHost must call decide() before any mutating / shell service.
 */

import { matchReservedGateOp } from "../../shared/permissions/reserved-ops";
import {
  isPathInsideProject,
  resolveSmartBashAction,
  resolveSmartPermissionAction,
} from "../../shared/permissions/smart-policy";
import { isLatexCompileToolName } from "../../shared/agent/tool-names";
import { projectRulesRel } from "../../shared/workbench/paths";
import {
  extractOutsideProjectPathArgs,
  isWholeDiskSearchBashCommand,
  wholeDiskSearchBlockMessage,
} from "../../shared/permissions/project-escape-guard";
import { bashCommandMatchesAnyPattern } from "../../shared/permissions/bash-allow-always";
import {
  isPathUnderAllowedPaths,
  matchAllowRules,
  matchDenyRules,
  type PermissionRuleContext,
} from "../../shared/permissions/rules";
import type { PermissionMode, SessionAgent } from "../../shared/agent/session-agent";
import { getPlanPermissionOverride } from "../../shared/agent/session-agent";
import {
  emptyPermissionRulesConfig,
  type PermissionRulesConfig,
} from "../../shared/permissions/rules";
import { isPiPrimitiveToolName } from "./capability-matrix";
import { getNativeToolByName } from "./tools/index";
import type { ToolPermissionCategory } from "./tools/types";
import { createLogger } from "../services/logger";

const log = createLogger("permission-gate", "security");

export type HardDenyCode = "latex" | "whole_disk" | "outside_project" | "file_rm" | "display_raster";

export function classifyHardDeny(
  request: Pick<PermissionGateRequest, "toolName" | "bashCommand">,
  reason: string,
): HardDenyCode {
  const name = request.toolName.toLowerCase();
  const command = request.bashCommand ?? "";
  if ((name === "bash" || name === "experiment-run") && command) {
    if (isWholeDiskSearchBashCommand(command)) return "whole_disk";
    const reserved = matchReservedGateOp(command, name);
    if (reserved?.id === "latex_compile") return "latex";
    if (reserved?.id === "file_delete") return "file_rm";
    if (reserved?.id === "present_substitute") return "display_raster";
  }
  if (reason.startsWith("outside_project:")) return "outside_project";
  return "outside_project";
}

const PI_PRIMITIVE_CATEGORY: Record<string, ToolPermissionCategory> = {
  read: "read_only",
  grep: "read_only",
  find: "read_only",
  ls: "read_only",
  write: "safe_write",
  edit: "safe_write",
  bash: "shell_exec",
};

export type GateDecision = "allow" | "deny";

export interface PermissionGateRequest {
  requestId: string;
  runtimeSessionId: string;
  tabId: string;
  turnId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  projectRoot: string;
  permissionMode: PermissionMode;
  sessionAgent?: SessionAgent;
  /** Chat conversation id — Plan mode uses it to compute the canonical draft path. */
  sessionId?: string;
  allowedPaths?: string[];
  /** Enabled team skill folders — readable; bash read-only verbs are not escape. */
  skillReadRoots?: string[];
  filePath?: string | null;
  bashCommand?: string | null;
  bashCwd?: string | null;
  sourcePath?: string | null;
  destinationPath?: string | null;
  rules?: PermissionRulesConfig;
}

export interface PermissionGateResult {
  decision: GateDecision;
  reason: string;
  requestId: string;
}

export type PermissionPromptHandler = (request: PermissionGateRequest) => void;

const FALLBACK_MUTATING_TOOLS = new Set([
  "write",
  "edit",
  "apply_patch",
  "delete",
  "move",
  "research-brief-update",
  "literature-add",
  "literature-delete",
  "literature-export-bib",
  "experiment-log",
  "interaction-write",
  "project-rule-write",
]);

export function extractToolPathContext(
  toolName: string,
  args: Record<string, unknown>,
  projectRoot: string,
): {
  filePath?: string | null;
  bashCommand?: string | null;
  bashCwd?: string | null;
  sourcePath?: string | null;
  destinationPath?: string | null;
} {
  const tool = getNativeToolByName(toolName);
  if (tool?.permission) {
    const result: {
      filePath?: string | null;
      bashCommand?: string | null;
      bashCwd?: string | null;
      sourcePath?: string | null;
      destinationPath?: string | null;
    } = {};

    if (tool.permission.extractPath) {
      const extracted = tool.permission.extractPath(args, projectRoot);
      if (typeof extracted === "string") {
        result.filePath = extracted;
      } else if (extracted && typeof extracted === "object") {
        result.filePath = extracted.filePath ?? null;
        result.sourcePath = extracted.sourcePath ?? null;
        result.destinationPath = extracted.destinationPath ?? null;
      }
    }

    if (tool.permission.extractBash) {
      const bash = tool.permission.extractBash(args, projectRoot);
      if (bash) {
        result.bashCommand = bash.command;
        result.bashCwd = bash.cwd ?? projectRoot;
      }
    }

    if (result.filePath !== undefined || result.bashCommand !== undefined || result.sourcePath !== undefined) {
      return result;
    }
  }

  // Fallback heuristic for ad-hoc or standard tools
  const name = toolName.toLowerCase();
  const str = (key: string): string | null => {
    const v = args[key];
    return typeof v === "string" && v.trim() ? v : null;
  };

  if (name === "research-brief-update") {
    return { filePath: ".brief.md" };
  }
  if (name === "project-rule-write") {
    const ruleName = str("name");
    return {
      filePath: ruleName ? `${projectRulesRel()}/${ruleName}/RULE.md` : null,
    };
  }
  if (name === "bash" || name === "experiment-run") {
    return {
      bashCommand: str("command"),
      bashCwd: str("cwd") ?? projectRoot,
    };
  }
  if (name === "move") {
    return {
      sourcePath: str("source") ?? str("from") ?? str("sourcePath"),
      destinationPath: str("destination") ?? str("to") ?? str("destinationPath"),
      filePath: str("source") ?? str("from") ?? str("sourcePath"),
    };
  }
  return {
    filePath: str("path") ?? str("filePath") ?? str("file"),
  };
}

export function evaluateHardDeny(request: PermissionGateRequest): { deny: true; reason: string } | { deny: false } {
  const name = request.toolName.toLowerCase();
  const command = request.bashCommand ?? "";

  if ((name === "bash" || name === "experiment-run") && command) {
    if (isWholeDiskSearchBashCommand(command)) {
      return { deny: true, reason: wholeDiskSearchBlockMessage() };
    }
    const reserved = matchReservedGateOp(command, name);
    if (reserved) {
      return { deny: true, reason: reserved.message };
    }
    const outside = extractOutsideProjectPathArgs(
      command,
      request.bashCwd,
      request.projectRoot,
      { allowedPaths: request.allowedPaths, skillReadRoots: request.skillReadRoots },
    );
    if (outside.length > 0) {
      return { deny: true, reason: `outside_project:${outside.join(",")}` };
    }
  }

  const tool = getNativeToolByName(request.toolName);
  const isMutating = tool?.permission
    ? tool.permission.category === "safe_write" || tool.permission.category === "destructive"
    : FALLBACK_MUTATING_TOOLS.has(name) || name === "write" || name === "edit";

  const pathsToCheck: Array<string | null | undefined> = [];
  if (isMutating) {
    pathsToCheck.push(request.filePath, request.sourcePath, request.destinationPath);
  }
  for (const p of pathsToCheck) {
    if (!p?.trim()) continue;
    if (isPathInsideProject(p, request.projectRoot) === false) {
      const allowed = (request.allowedPaths ?? []).some((root) => isPathInsideProject(p, root) === true);
      if (!allowed) {
        return { deny: true, reason: `outside_project:${p}` };
      }
    }
  }

  return { deny: false };
}

export class PermissionGate {
  private readonly pending = new Map<string, {
    resolve: (result: PermissionGateResult) => void;
    timer: ReturnType<typeof setTimeout>;
    runtimeSessionId: string;
  }>();

  constructor(
    private readonly opts: {
      timeoutMs?: number;
      rules?: PermissionRulesConfig;
      onPrompt?: PermissionPromptHandler;
    } = {},
  ) {}

  get timeoutMs(): number {
    return this.opts.timeoutMs ?? 120_000;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  hasPendingForSession(runtimeSessionId: string): boolean {
    for (const waiter of this.pending.values()) {
      if (waiter.runtimeSessionId === runtimeSessionId) return true;
    }
    return false;
  }

  async decide(request: PermissionGateRequest): Promise<PermissionGateResult> {
    const rules = request.rules ?? this.opts.rules ?? emptyPermissionRulesConfig();
    // Session-level allowed paths (worktree) plus user Allowed Paths settings.
    const allowedPaths = request.allowedPaths?.length
      ? [...request.allowedPaths, ...rules.allowedPaths]
      : rules.allowedPaths;

    // 1. Hard Deny invariants: whole-disk search, raw latex compilation, project escaping
    const hard = evaluateHardDeny({ ...request, allowedPaths });
    if (hard.deny) {
      log.warn("permission.hard_deny", {
        toolName: request.toolName,
        code: classifyHardDeny(request, hard.reason),
        runtimeSessionId: request.runtimeSessionId,
        toolCallId: request.toolCallId,
      });
      return { decision: "deny", reason: hard.reason, requestId: request.requestId };
    }

    const tool = getNativeToolByName(request.toolName);
    const category = tool?.permission?.category
      ?? (isPiPrimitiveToolName(request.toolName)
        ? PI_PRIMITIVE_CATEGORY[request.toolName]
        : undefined)
      ?? (request.toolName.startsWith("mcp__") ? "shell_exec" : undefined)
      ?? (FALLBACK_MUTATING_TOOLS.has(request.toolName.toLowerCase()) ? "safe_write" : "read_only");

    // 2. User-defined deny rules — explicit refusal, overrides every mode.
    const ruleCtx: PermissionRuleContext = {
      toolName: request.toolName,
      projectRoot: request.projectRoot,
      filePath: request.filePath,
      sourcePath: request.sourcePath,
      destinationPath: request.destinationPath,
      bashCommand: request.bashCommand,
      bashCwd: request.bashCwd,
    };
    if (matchDenyRules(rules.denyRules, ruleCtx)) {
      log.warn("permission.user_deny_rule", {
        toolName: request.toolName,
        runtimeSessionId: request.runtimeSessionId,
        toolCallId: request.toolCallId,
      });
      return { decision: "deny", reason: "user_deny_rule", requestId: request.requestId };
    }

    // 3. Plan-agent override: when the tab is in Plan mode, apply the hard
    //    binding BEFORE the mode matrix so execution/editing constraints hold
    //    regardless of permissionMode (except explicit user deny/allow above).
    if (request.sessionAgent === "plan") {
      const override = getPlanPermissionOverride(request.toolName, {
        filePath: request.filePath,
        projectRoot: request.projectRoot,
        sessionId: request.sessionId,
      });
      if (override === "allow") {
        return { decision: "allow", reason: "plan_override_allow", requestId: request.requestId };
      }
      if (override === "deny") {
        return { decision: "deny", reason: "plan_override_deny", requestId: request.requestId };
      }
      // "ask" → fall through to mode matrix (will suspend for UI prompt).
    }

    // 4. PermissionMode evaluation
    const mode = request.permissionMode;

    if (mode === "readonly") {
      if (category === "read_only") {
        return { decision: "allow", reason: "readonly_allowed", requestId: request.requestId };
      }
      log.warn("permission.readonly_mode", {
        toolName: request.toolName,
        runtimeSessionId: request.runtimeSessionId,
        toolCallId: request.toolCallId,
      });
      return { decision: "deny", reason: "readonly_mode", requestId: request.requestId };
    }

    // 4. User-defined allow rules / allowed paths / Always lists — before the mode matrix.
    if (matchAllowRules(rules.allowRules, ruleCtx)) {
      return { decision: "allow", reason: "user_allow_rule", requestId: request.requestId };
    }
    if (isPathUnderAllowedPaths(request.filePath, request.projectRoot, rules.allowedPaths)) {
      return { decision: "allow", reason: "allowed_path", requestId: request.requestId };
    }
    if (rules.toolAllowAlways.includes(request.toolName.toLowerCase())) {
      return { decision: "allow", reason: "tool_always_allow", requestId: request.requestId };
    }
    if (request.bashCommand && rules.bashAllowAlwaysPatterns.length > 0) {
      if (bashCommandMatchesAnyPattern(request.bashCommand, rules.bashAllowAlwaysPatterns)) {
        return { decision: "allow", reason: "bash_always_allow", requestId: request.requestId };
      }
    }

    if (mode === "auto") {
      return { decision: "allow", reason: "auto_allowed", requestId: request.requestId };
    }

    // Shell smart convergence: for command-bearing shell tools (Pi bash primitive,
    // experiment-run) decide by the shared bash policy that the renderer uses to
    // pre-judge permission cards. This keeps "will the UI prompt?" and the actual
    // gate decision on the same single source of truth.
    if (
      (mode === "edit_auto" || mode === "ask")
      && category === "shell_exec"
      && request.bashCommand
    ) {
      const smart = resolveSmartBashAction(
        request.bashCommand,
        request.projectRoot,
        request.bashCwd,
        allowedPaths,
        request.skillReadRoots,
      );
      if (smart === "deny") {
        return { decision: "deny", reason: "smart_bash_deny", requestId: request.requestId };
      }
      if (smart === "allow") {
        return { decision: "allow", reason: "smart_bash_allow", requestId: request.requestId };
      }
      // "prompt" falls through to the mode matrix → suspends for UI.
    }

    // edit_auto: compile is safe_write → allow below. ask: renderer already
    // pre-judges in-project compile as allow; match it or the gate hangs 120s.
    if (mode === "ask" && isLatexCompileToolName(request.toolName)) {
      const smart = resolveSmartPermissionAction(
        {
          toolName: request.toolName,
          projectRoot: request.projectRoot,
          filePath: request.filePath,
          bashCommand: request.bashCommand,
          bashCwd: request.bashCwd ?? request.projectRoot,
          sourcePath: request.sourcePath,
          destinationPath: request.destinationPath,
          sessionId: request.sessionId,
          sessionAgent: request.sessionAgent,
        },
        rules,
      );
      if (smart === "deny") {
        return { decision: "deny", reason: "smart_latex_deny", requestId: request.requestId };
      }
      if (smart === "allow") {
        return { decision: "allow", reason: "smart_latex_allow", requestId: request.requestId };
      }
    }

    if (mode === "edit_auto") {
      if (category === "read_only" || category === "safe_write") {
        return { decision: "allow", reason: "edit_auto_allowed", requestId: request.requestId };
      }
      // destructive and shell_exec require user prompt
    }

    if (mode === "ask") {
      if (category === "read_only") {
        return { decision: "allow", reason: "ask_read_allowed", requestId: request.requestId };
      }
      // safe_write, destructive, shell_exec require user prompt
    }

    // 5. Suspend for UI prompt
    return await new Promise<PermissionGateResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        log.warn("permission.timeout", {
          toolName: request.toolName,
          runtimeSessionId: request.runtimeSessionId,
          toolCallId: request.toolCallId,
        });
        resolve({
          decision: "deny",
          reason: "permission_timeout",
          requestId: request.requestId,
        });
      }, this.timeoutMs);

      this.pending.set(request.requestId, {
        runtimeSessionId: request.runtimeSessionId,
        timer,
        resolve,
      });

      // Call onPrompt after pending map is registered so sync resolve works
      this.opts.onPrompt?.(request);
    });
  }

  resolve(requestId: string, decision: GateDecision): boolean {
    const waiter = this.pending.get(requestId);
    if (!waiter) return false;
    clearTimeout(waiter.timer);
    this.pending.delete(requestId);
    waiter.resolve({
      decision,
      reason: decision === "allow" ? "user_allow" : "user_deny",
      requestId,
    });
    return true;
  }

  cancelRequest(requestId: string): boolean {
    const waiter = this.pending.get(requestId);
    if (!waiter) return false;
    clearTimeout(waiter.timer);
    this.pending.delete(requestId);
    waiter.resolve({ decision: "deny", reason: "cancelled", requestId });
    return true;
  }

  cancelSession(runtimeSessionId: string): number {
    let n = 0;
    for (const [id, waiter] of [...this.pending.entries()]) {
      if (waiter.runtimeSessionId !== runtimeSessionId) continue;
      clearTimeout(waiter.timer);
      this.pending.delete(id);
      waiter.resolve({ decision: "deny", reason: "cancelled", requestId: id });
      n += 1;
    }
    return n;
  }
}
