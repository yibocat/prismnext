/**
 * Single-channel PermissionGate.
 * ToolHost must call decide() before any mutating / shell service.
 */

import { isDirectLatexCompileBashCommand, latexCompileBashBlockMessage } from "../../shared/latex-compile-bash";
import { isPathInsideProject } from "../../shared/smart-permission-policy";
import {
  extractOutsideProjectPathArgs,
  isWholeDiskSearchBashCommand,
  wholeDiskSearchBlockMessage,
} from "../../shared/project-escape-guard";
import { bashCommandMatchesAnyPattern } from "../../shared/bash-allow-always";
import type { PermissionMode, SessionAgent } from "../../shared/session-agent";
import {
  emptyPermissionRulesConfig,
  type PermissionRulesConfig,
} from "../../shared/permission-rules";
import { getNativeToolByName } from "./tools/index";

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
  allowedPaths?: string[];
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
      filePath: ruleName ? `.prismnext/agent/rules/${ruleName}/RULE.md` : null,
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
    if (isDirectLatexCompileBashCommand(command)) {
      return { deny: true, reason: latexCompileBashBlockMessage() };
    }
    const outside = extractOutsideProjectPathArgs(
      command,
      request.bashCwd,
      request.projectRoot,
      { allowedPaths: request.allowedPaths },
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

  async decide(request: PermissionGateRequest): Promise<PermissionGateResult> {
    // 1. Hard Deny invariants: whole-disk search, raw latex compilation, project escaping
    const hard = evaluateHardDeny(request);
    if (hard.deny) {
      return { decision: "deny", reason: hard.reason, requestId: request.requestId };
    }

    const rules = request.rules ?? this.opts.rules ?? emptyPermissionRulesConfig();
    const tool = getNativeToolByName(request.toolName);
    const category = tool?.permission?.category ?? (
      FALLBACK_MUTATING_TOOLS.has(request.toolName.toLowerCase()) ? "safe_write" : "read_only"
    );

    // 2. Always Allow / Explicit Rules overrides
    const normalizedName = request.toolName.toLowerCase();
    if (rules.toolAllowAlways.includes(normalizedName)) {
      return { decision: "allow", reason: "tool_always_allow", requestId: request.requestId };
    }
    if (request.bashCommand && rules.bashAllowAlwaysPatterns.length > 0) {
      if (bashCommandMatchesAnyPattern(request.bashCommand, rules.bashAllowAlwaysPatterns)) {
        return { decision: "allow", reason: "bash_always_allow", requestId: request.requestId };
      }
    }

    // 3. PermissionMode evaluation
    const mode = request.permissionMode;

    if (mode === "readonly") {
      if (category === "read_only") {
        return { decision: "allow", reason: "readonly_allowed", requestId: request.requestId };
      }
      return { decision: "deny", reason: "readonly_mode", requestId: request.requestId };
    }

    if (mode === "auto") {
      return { decision: "allow", reason: "auto_allowed", requestId: request.requestId };
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

    // 4. Suspend for UI prompt
    return await new Promise<PermissionGateResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
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
