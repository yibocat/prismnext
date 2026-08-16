/**
 * ToolHost wrappers for image-describe.
 */

import { TOOL_NAMES } from "../../shared/tool-names";
import { BUILTIN_TOOLS } from "../tools/index";
import { buildOpencodeToolDescription } from "../tools/tool-description";
import type { ImageDescribeActionRequest } from "../services/image-describe-bridge";
import type { NativeToolDefinition, ToolExecuteContext } from "./tool-host";

export type ImageDescribeActionFn = (
  req: ImageDescribeActionRequest,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v.trim() : "";
}

function descriptionFor(name: string): string {
  const meta = BUILTIN_TOOLS.find((tool) => tool.name === name);
  return meta ? buildOpencodeToolDescription(meta) : name;
}

export function createImageDescribeNativeTools(deps?: {
  executeImageDescribeAction?: ImageDescribeActionFn;
}): NativeToolDefinition[] {
  const run = deps?.executeImageDescribeAction ?? (async (req) => {
    const { executeImageDescribeAction } = await import("../services/image-describe-bridge");
    return executeImageDescribeAction(req);
  });

  return [
    {
      name: TOOL_NAMES.imageDescribe,
      description: descriptionFor(TOOL_NAMES.imageDescribe),
      async execute(args, ctx: ToolExecuteContext) {
        const imagePath = str(args, "path") || str(args, "imagePath");
        if (!imagePath) return { ok: false, error: "missing_image_path" };

        const req: ImageDescribeActionRequest = {
          action: "describe",
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
          imagePath,
        };
        const question = str(args, "question");
        if (question) req.question = question;

        return run(req);
      },
    },
  ];
}
