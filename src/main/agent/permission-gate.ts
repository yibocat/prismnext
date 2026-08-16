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
import type { PermissionMode, SessionAgent } from "../../shared/session-agent";
import { getPermissionRuleForTool, resolvePermissionAction } from "../services/permission-modes";

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
}

export interface PermissionGateResult {
  decision: GateDecision;
  reason: string;
  requestId: string;
}

export type PermissionPromptHandler = (request: PermissionGateRequest) => void;

const MUTATING_PATH_TOOLS = new Set([
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
  const name = toolName.toLowerCase();
  const str = (key: string): string | null => {
    const v = args[key];
    return typeof v === "string" && v.trim() ? v : null;
  };

  if (name === "research-brief-update") {
    return { filePath: ".brief.md" };
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

  const pathsToCheck: Array<string | null | undefined> = [];
  if (MUTATING_PATH_TOOLS.has(name) || name === "write" || name === "edit") {
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
      onPrompt?: PermissionPromptHandler;
    } = {},
  ) {}

  get timeoutMs(): number {
    return this.opts.timeoutMs ?? 30_000;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  async decide(request: PermissionGateRequest): Promise<PermissionGateResult> {
    const hard = evaluateHardDeny(request);
    if (hard.deny) {
      return { decision: "deny", reason: hard.reason, requestId: request.requestId };
    }

    const rule = getPermissionRuleForTool(request.permissionMode, request.toolName);
    if (rule === "allow") {
      return { decision: "allow", reason: "policy_allow", requestId: request.requestId };
    }
    if (rule === "deny") {
      return { decision: "deny", reason: "policy_deny", requestId: request.requestId };
    }
    if (rule !== "ask") {
      const action = resolvePermissionAction(
        request.permissionMode,
        request.toolName,
        request.sessionAgent,
        {
          filePath: request.filePath,
          projectRoot: request.projectRoot,
          bashCommand: request.bashCommand,
          bashCwd: request.bashCwd,
          sourcePath: request.sourcePath,
          destinationPath: request.destinationPath,
          sessionId: request.runtimeSessionId,
        },
      );
      if (action === "allow") {
        return { decision: "allow", reason: "policy_allow", requestId: request.requestId };
      }
      if (action === "deny") {
        return { decision: "deny", reason: "policy_deny", requestId: request.requestId };
      }
    }

    this.opts.onPrompt?.(request);
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
