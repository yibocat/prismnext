/**
 * ToolHost wrappers for interactive roundtrip tools:
 * - question
 * - suggest-plan
 */

import { TOOL_NAMES } from "../../shared/tool-names";
import { BUILTIN_TOOLS } from "../tools/index";
import { buildOpencodeToolDescription } from "../tools/tool-description";
import type { NativeToolDefinition, ToolExecuteContext } from "./tool-host";

export type AskQuestionFn = (input: {
  question: string;
  options?: string[];
  multiSelect?: boolean;
  ctx: ToolExecuteContext;
}) => Promise<Record<string, unknown>>;

export type SuggestPlanFn = (input: {
  reason?: string;
  ctx: ToolExecuteContext;
}) => Promise<Record<string, unknown>>;

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v.trim() : "";
}

function descriptionFor(name: string): string {
  const meta = BUILTIN_TOOLS.find((tool) => tool.name === name);
  return meta ? buildOpencodeToolDescription(meta) : name;
}

export function createInteractiveNativeTools(deps?: {
  askQuestion?: AskQuestionFn;
  suggestPlan?: SuggestPlanFn;
}): NativeToolDefinition[] {
  const askQuestion = deps?.askQuestion ?? (async ({ question, options, multiSelect }) => {
    return {
      answered: true,
      question,
      options: options ?? [],
      multiSelect: multiSelect === true,
      note: "Question acknowledged.",
    };
  });

  const suggestPlan = deps?.suggestPlan ?? (async ({ reason }) => {
    return {
      suggested: true,
      accepted: false,
      reason: reason || "User remained in current mode.",
    };
  });

  return [
    {
      name: TOOL_NAMES.question,
      description: descriptionFor(TOOL_NAMES.question),
      async execute(args, ctx: ToolExecuteContext) {
        const question = str(args, "question");
        if (!question) return { ok: false, error: "missing_question" };

        const options = Array.isArray(args.options)
          ? args.options.filter((o): o is string => typeof o === "string")
          : undefined;
        const multiSelect = args.multiSelect === true;

        return askQuestion({ question, options, multiSelect, ctx });
      },
    },
    {
      name: TOOL_NAMES.suggestPlan,
      description: descriptionFor(TOOL_NAMES.suggestPlan),
      async execute(args, ctx: ToolExecuteContext) {
        const reason = str(args, "reason");
        return suggestPlan({ reason: reason || undefined, ctx });
      },
    },
  ];
}
