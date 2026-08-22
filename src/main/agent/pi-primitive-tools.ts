/**
 * Pi's own file/shell tools, with PermissionGate wrapped around execute.
 * Implementations come from the SDK factories — this file does not reimplement them.
 */

import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  defineTool,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import {
  extractToolPathContext,
  type PermissionGate,
} from "./permission-gate";
import {
  PI_PRIMITIVE_TOOL_NAMES,
  type PiPrimitiveToolName,
} from "./capability-matrix";
import type { ToolExecuteContext } from "./tool-host";
import { createLogger, shortLogDetail } from "../services/logger";
import {
  formatAmbiguousSkillPath,
  resolveSkillRelativePath,
} from "../../shared/skills/read-roots";

const SKILL_RELATIVE_TOOLS = new Set(["read", "ls", "grep", "find"]);

function rewriteSkillRelativeArgs(
  toolName: string,
  args: Record<string, unknown>,
  projectRoot: string,
  skillReadRoots: readonly string[] | undefined,
): { args: Record<string, unknown> } | { error: string } {
  if (!SKILL_RELATIVE_TOOLS.has(toolName) || !skillReadRoots?.length) {
    return { args };
  }
  const raw = typeof args.path === "string" ? args.path : "";
  if (!raw.trim()) return { args };
  const resolved = resolveSkillRelativePath(raw, projectRoot, skillReadRoots, existsSync);
  if (resolved.action === "rewrite") {
    return { args: { ...args, path: resolved.abs } };
  }
  if (resolved.action === "ambiguous") {
    return { error: formatAmbiguousSkillPath(raw, resolved.candidates) };
  }
  return { args };
}

const log = createLogger("pi-primitive", "agent");

type PrimitiveTurnContext = Omit<ToolExecuteContext, "toolCallId" | "abortSignal">;

export { PI_PRIMITIVE_TOOL_NAMES, isPiPrimitiveToolName } from "./capability-matrix";

export function wrapPiPrimitiveTools(input: {
  cwd: string;
  gate: PermissionGate;
  getContext: () => PrimitiveTurnContext;
  names?: readonly string[];
}): ToolDefinition[] {
  const defs = {
    read: createReadToolDefinition(input.cwd),
    bash: createBashToolDefinition(input.cwd),
    edit: createEditToolDefinition(input.cwd),
    write: createWriteToolDefinition(input.cwd),
    grep: createGrepToolDefinition(input.cwd),
    find: createFindToolDefinition(input.cwd),
    ls: createLsToolDefinition(input.cwd),
  };
  const allow = input.names
    ? new Set(input.names.map((name) => name.toLowerCase()))
    : null;
  return PI_PRIMITIVE_TOOL_NAMES.filter((name) => !allow || allow.has(name)).map((name: PiPrimitiveToolName) => {
    const original = defs[name];
    return defineTool({
      ...original,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => {
        const turn = input.getContext();
        const rawArgs = (params ?? {}) as Record<string, unknown>;
        const rewritten = rewriteSkillRelativeArgs(
          name,
          rawArgs,
          turn.projectRoot,
          turn.skillReadRoots,
        );
        if ("error" in rewritten) {
          return {
            content: [{ type: "text", text: rewritten.error }],
            details: { ok: false, error: rewritten.error },
          };
        }
        const args = rewritten.args;
        const paths = extractToolPathContext(name, args, turn.projectRoot);
        const decision = await input.gate.decide({
          requestId: `perm-${toolCallId}`,
          runtimeSessionId: turn.runtimeSessionId,
          tabId: turn.tabId,
          turnId: turn.turnId,
          toolCallId,
          toolName: name,
          args,
          projectRoot: turn.projectRoot,
          permissionMode: turn.permissionMode,
          sessionAgent: turn.sessionAgent,
          sessionId: turn.tabId,
          allowedPaths: turn.allowedPaths,
          skillReadRoots: turn.skillReadRoots,
          ...paths,
        });
        if (decision.decision === "deny") {
          return {
            content: [{ type: "text", text: decision.reason }],
            details: { ok: false, denied: true, error: decision.reason },
          };
        }
        const startedAt = Date.now();
        log.info("tool.execute.start", { toolName: name, toolCallId });
        try {
          const result = await original.execute(toolCallId, args, signal, onUpdate, ctx);
          log.info("tool.execute.end", {
            toolName: name,
            toolCallId,
            durationMs: Date.now() - startedAt,
            ok: "ok",
          });
          return result;
        } catch (err) {
          log.info("tool.execute.end", {
            toolName: name,
            toolCallId,
            durationMs: Date.now() - startedAt,
            ok: "error",
          });
          log.warn("tool.execute.error", {
            toolName: name,
            toolCallId,
            error: shortLogDetail(err),
          });
          throw err;
        }
      },
    });
  });
}
