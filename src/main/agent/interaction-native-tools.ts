/**
 * ToolHost wrappers for interaction tools:
 * - interaction-list
 * - interaction-read
 * - interaction-write
 * - interaction-open
 */

import { TOOL_NAMES } from "../../shared/tool-names";
import { BUILTIN_TOOLS } from "../tools/index";
import { buildOpencodeToolDescription } from "../tools/tool-description";
import type { InteractionSpec } from "../../shared/interaction-spec";
import type { InteractionActionRequest } from "../services/interaction-bridge";
import type { NativeToolDefinition, ToolExecuteContext } from "./tool-host";

export type InteractionActionFn = (
  req: InteractionActionRequest,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v.trim() : "";
}

function descriptionFor(name: string): string {
  const meta = BUILTIN_TOOLS.find((tool) => tool.name === name);
  return meta ? buildOpencodeToolDescription(meta) : name;
}

export function createInteractionNativeTools(deps?: {
  executeInteractionAction?: InteractionActionFn;
}): NativeToolDefinition[] {
  const run = deps?.executeInteractionAction ?? (async (req) => {
    const { executeInteractionAction } = await import("../services/interaction-bridge");
    return executeInteractionAction(req);
  });

  return [
    {
      name: TOOL_NAMES.interactionList,
      description: descriptionFor(TOOL_NAMES.interactionList),
      async execute(args, ctx: ToolExecuteContext) {
        const req: InteractionActionRequest = {
          action: "list",
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
        };
        const kindPrefix = str(args, "kindPrefix");
        if (kindPrefix) req.kindPrefix = kindPrefix;
        return run(req);
      },
    },
    {
      name: TOOL_NAMES.interactionRead,
      description: descriptionFor(TOOL_NAMES.interactionRead),
      async execute(args, ctx: ToolExecuteContext) {
        const id = str(args, "id");
        if (!id) return { ok: false, error: "missing_id" };
        return run({
          action: "read",
          id,
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
        });
      },
    },
    {
      name: TOOL_NAMES.interactionWrite,
      description: descriptionFor(TOOL_NAMES.interactionWrite),
      async execute(args, ctx: ToolExecuteContext) {
        const spec = args.spec as InteractionSpec | undefined;
        if (!spec || typeof spec !== "object") {
          return { ok: false, error: "invalid_spec" };
        }
        return run({
          action: "write",
          spec,
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
        });
      },
    },
    {
      name: TOOL_NAMES.interactionOpen,
      description: descriptionFor(TOOL_NAMES.interactionOpen),
      async execute(args, ctx: ToolExecuteContext) {
        const id = str(args, "id");
        if (!id) return { ok: false, error: "missing_id" };
        return run({
          action: "open",
          id,
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
          focus: args.focus !== false,
        });
      },
    },
  ];
}
