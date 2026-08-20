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
        const args = (params ?? {}) as Record<string, unknown>;
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
          const result = await original.execute(toolCallId, params, signal, onUpdate, ctx);
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
