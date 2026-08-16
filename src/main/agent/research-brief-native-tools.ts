/**
 * ToolHost wrappers for research-brief-read.
 * (research-brief-update is registered in representative-tools).
 */

import { TOOL_NAMES } from "../../shared/tool-names";
import { BUILTIN_TOOLS } from "../tools/index";
import { buildOpencodeToolDescription } from "../tools/tool-description";
import type { ResearchBriefActionRequest } from "../services/research-brief-bridge";
import type { NativeToolDefinition, ToolExecuteContext } from "./tool-host";

export type ResearchBriefActionFn = (
  req: ResearchBriefActionRequest,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

function descriptionFor(name: string): string {
  const meta = BUILTIN_TOOLS.find((tool) => tool.name === name);
  return meta ? buildOpencodeToolDescription(meta) : name;
}

export function createResearchBriefNativeTools(deps?: {
  executeResearchBriefAction?: ResearchBriefActionFn;
}): NativeToolDefinition[] {
  const run = deps?.executeResearchBriefAction ?? (async (req) => {
    const { executeResearchBriefAction } = await import("../services/research-brief-bridge");
    return executeResearchBriefAction(req);
  });

  return [
    {
      name: TOOL_NAMES.researchBriefRead,
      description: descriptionFor(TOOL_NAMES.researchBriefRead),
      async execute(_args, ctx: ToolExecuteContext) {
        return run({
          action: "read",
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
        });
      },
    },
  ];
}
