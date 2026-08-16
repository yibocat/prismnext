/**
 * ToolHost wrappers for LaTeX tools (latex-root, latex-compile).
 */

import { TOOL_NAMES } from "../../shared/tool-names";
import { BUILTIN_TOOLS } from "../tools/index";
import { buildOpencodeToolDescription } from "../tools/tool-description";
import type { LatexActionRequest } from "../services/latex-bridge";
import type { NativeToolDefinition, ToolExecuteContext } from "./tool-host";

export type LatexActionFn = (
  req: LatexActionRequest,
) => unknown | Promise<unknown>;

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v.trim() : "";
}

function descriptionFor(name: string): string {
  const meta = BUILTIN_TOOLS.find((tool) => tool.name === name);
  return meta ? buildOpencodeToolDescription(meta) : name;
}

export function createLatexNativeTools(deps?: {
  executeLatexAction?: LatexActionFn;
}): NativeToolDefinition[] {
  const run = deps?.executeLatexAction ?? (async (req) => {
    const { executeLatexAction } = await import("../services/latex-bridge");
    return executeLatexAction(req);
  });

  return [
    {
      name: TOOL_NAMES.latexRoot,
      description: descriptionFor(TOOL_NAMES.latexRoot),
      async execute(args, ctx: ToolExecuteContext) {
        const mainFile = str(args, "mainFile");
        const req: LatexActionRequest = {
          action: "root",
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
        };
        if (mainFile) req.mainFile = mainFile;
        return run(req);
      },
    },
    {
      name: TOOL_NAMES.latexCompile,
      description: descriptionFor(TOOL_NAMES.latexCompile),
      async execute(args, ctx: ToolExecuteContext) {
        const mainFile = str(args, "mainFile");
        const req: LatexActionRequest = {
          action: "compile",
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
          useTexlive: args.useTexlive === true,
        };
        if (mainFile) req.mainFile = mainFile;
        return run(req);
      },
    },
  ];
}
